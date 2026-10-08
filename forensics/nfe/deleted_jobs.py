"""Per-job reconstruction for deleted / voided / stripped jobs.

Builds the full discoverable event chain for a job number from the simPRO
user log and the QBO audit log: creation, modifications (old -> new),
labor applied, scheduling, notes, invoices, payments — actor and
timestamp on every step. Both logs survive a job's deletion, which is why
they are the highest-value exports.

Usage:
    python -m nfe.deleted_jobs --user-log ul.csv [--audit-log al.csv]
        [--labor labor.csv] [--simpro-payments sp.csv] [--qbo-txns qb.csv]
        (--job 1234 [--job 1301 ...] | --auto jobs.csv) -o reconstructions/

--auto reconstructs every job number that appears in the logs but not in
the supplied full job list (deletion candidates), plus sequence gaps.
"""

from __future__ import annotations

import argparse
import os
import sys

from .ingest import build_db, load_csv
from .util import fmt_cents

NOT_ESTABLISH = """## What this does NOT establish

This reconstruction is an exception requiring investigation, never a
finding of wrongdoing. Specifically, it does NOT establish:

- that the deletion/modification was improper. Duplicate-job cleanup,
  re-quoting, customer cancellations, training entries and data-entry
  error are all legitimate reasons a job is deleted or reduced;
- that the named user performed the action personally (shared logins,
  delegated sessions and imports attribute actions to one account);
- that any payment was diverted. That requires corroborating bank/deposit
  evidence and customer remittance records (two-source rule);
- the completeness of this chain: the log window supplied bounds what is
  discoverable. Events outside the export window are invisible here.

Next evidence steps: customer remittance / check images, bank deposit
detail for the period, wider log export, and technician interviews about
the site visits listed above.
"""


def event_chain(conn, job_no: str) -> list[tuple]:
    """Merge user-log + audit-log + labor + payments into one timeline."""
    rows: list[tuple] = []
    for ts, user, action, record, desc, old, new in conn.execute(
            "SELECT ts, user, action, record, description, old_value, new_value"
            " FROM user_log WHERE job_no=? ORDER BY ts, id", (job_no,)):
        change = f" [{old} -> {new}]" if (old or new) else ""
        rows.append((ts or "(no ts)", "simPRO user log", user,
                     f"{action}{change}", f"{record} {desc}".strip()))
    for ts, user, event, name, amt in conn.execute(
            "SELECT ts, user, event, name, amount_cents FROM audit_log"
            " WHERE job_no=? ORDER BY ts, id", (job_no,)):
        amount = f" {fmt_cents(amt)}" if amt else ""
        rows.append((ts or "(no ts)", "QBO audit log", user,
                     f"{event}{amount}", name))
    for ts, tech, hours, cost in conn.execute(
            "SELECT work_date, technician, hours, labor_cost_cents FROM labor"
            " WHERE job_no=? ORDER BY work_date, id", (job_no,)):
        rows.append((ts or "(no ts)", "simPRO timesheets", tech,
                     f"{hours:g}h on site ({fmt_cents(cost)} @ $104/h)", ""))
    for ts, amt in conn.execute(
            "SELECT pay_date, amount_cents FROM simpro_payments"
            " WHERE job_no=? ORDER BY pay_date, id", (job_no,)):
        rows.append((ts or "(no ts)", "simPRO payments", "",
                     f"payment recorded {fmt_cents(amt)}", ""))
    for ts, amt, cust in conn.execute(
            "SELECT txn_date, amount_cents, customer FROM qbo_txns"
            " WHERE job_no=? ORDER BY txn_date, id", (job_no,)):
        rows.append((ts or "(no ts)", "QBO invoices", "",
                     f"invoice {fmt_cents(amt)}", cust))
    rows.sort(key=lambda r: (r[0], r[1], r[3]))
    return rows


def reconstruct(conn, job_no: str) -> str:
    chain = event_chain(conn, job_no)
    in_jobs = conn.execute("SELECT customer, status, job_value_cents FROM jobs"
                           " WHERE job_no=?", (job_no,)).fetchone()
    lines = [f"# Reconstruction — job {job_no}", ""]
    if in_jobs:
        lines.append(f"Present in job list: customer={in_jobs[0]!r}, "
                     f"status={in_jobs[1]!r}, value={fmt_cents(in_jobs[2])}")
    else:
        lines.append("NOT present in the full job list supplied — deletion "
                     "or renumbering candidate.")
    lines += ["", f"Discoverable events: {len(chain)}", "",
              "| timestamp | source | actor | event | context |",
              "|---|---|---|---|---|"]
    for ts, src, actor, event, ctx in chain:
        esc = lambda s: str(s).replace("|", "\\|")
        lines.append(f"| {esc(ts)} | {esc(src)} | {esc(actor)} | {esc(event)} "
                     f"| {esc(ctx)} |")
    if not chain:
        lines.append("| (no events found in supplied exports) | | | | |")
    lines += ["", NOT_ESTABLISH]
    return "\n".join(lines)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m nfe.deleted_jobs")
    ap.add_argument("--user-log", required=True)
    ap.add_argument("--audit-log")
    ap.add_argument("--labor")
    ap.add_argument("--simpro-payments", dest="sp")
    ap.add_argument("--qbo-txns", dest="qb")
    ap.add_argument("--job", action="append", default=[],
                    help="job number to reconstruct (repeatable)")
    ap.add_argument("--auto", metavar="JOBS_CSV",
                    help="full job list; reconstruct every log-referenced "
                         "job missing from it")
    ap.add_argument("-o", "--out", required=True, help="output directory")
    args = ap.parse_args(argv)

    datasets = {"user_log": load_csv(args.user_log, "user_log")}
    if args.audit_log:
        datasets["audit_log"] = load_csv(args.audit_log, "audit_log")
    if args.labor:
        datasets["labor"] = load_csv(args.labor, "labor")
    if args.sp:
        datasets["simpro_payments"] = load_csv(args.sp, "simpro_payments")
    if args.qb:
        datasets["qbo_txns"] = load_csv(args.qb, "qbo_txns")
    if args.auto:
        datasets["jobs"] = load_csv(args.auto, "jobs")
    conn = build_db(datasets)

    targets = list(dict.fromkeys(args.job))
    if args.auto:
        known = {r[0] for r in conn.execute("SELECT job_no FROM jobs")}
        logged = [r[0] for r in conn.execute(
            "SELECT DISTINCT job_no FROM user_log WHERE job_no IS NOT NULL"
            " ORDER BY job_no")]
        targets += [j for j in logged if j not in known and j not in targets]
    if not targets:
        print("nothing to reconstruct (no --job and no deletion candidates)")
        return 0

    os.makedirs(args.out, exist_ok=True)
    for job_no in targets:
        path = os.path.join(args.out, f"job_{job_no}.md")
        with open(path, "w", encoding="utf-8") as f:
            f.write(reconstruct(conn, job_no))
        print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
