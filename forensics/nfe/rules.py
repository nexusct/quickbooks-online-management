"""Deterministic anomaly rules over the evidence DB.

Every rule emits EXCEPTIONS REQUIRING INVESTIGATION — never findings of
wrongdoing. Legitimate explanations exist for every rule (timing lag,
duplicate-job cleanup, re-quotes, sync failure, honest error). The report
preserves that framing on every sheet.

Matching is SQL / set logic over the SQLite evidence DB. No inference.
Two runs on one snapshot produce the identical exception list.
"""

from __future__ import annotations

import sqlite3

from . import config
from .util import fmt_cents, parse_cents


class RulesError(RuntimeError):
    pass


RULES = {
    "R01_COMPLETED_NO_QBO_INVOICE": "Completed simPRO job with no QuickBooks invoice",
    "R02_INVOICE_VARIANCE": "QBO invoiced total differs from simPRO job value",
    "R03_JOB_VALUE_REDUCED": "Job value reduced after initial entry (simPRO user log)",
    "R04_SIMPRO_INVOICE_NOT_IN_QBO": "Invoice existed in simPRO (created/deleted per user log) but never appears in QBO",
    "R05_LABOR_STRIPPED": "Technician time applied then voided/zeroed/removed (user log)",
    "R06_LABOR_NO_REVENUE": "Labor cost incurred exceeds revenue invoiced for the job",
    "R07_PAYMENT_SIMPRO_ONLY": "Payment recorded in simPRO with no matching QBO payment",
    "R08_PAYMENT_QBO_ONLY": "Payment recorded in QBO with no matching simPRO payment",
    "R09_PAYMENT_AMOUNT_MISMATCH": "Payment totals differ between simPRO and QBO for same job",
    "R10_PAID_NO_QBO_INVOICE": "Payment received (simPRO) for a job with NO QBO invoice at all",
    "R11_SEQUENCE_GAP": "Job number missing from the sequence (candidate deletion)",
    "R12_DELETED_JOB": "Job exists in user log but not in job list (deleted/renumbered)",
    "R13_SNAPSHOT_MUTATION": "Source export content changed between snapshots",
}

# Special denotations Jim asked for explicitly.
FLAG_SIMPRO_INVOICE_UNPUSHED = "SIMPRO_INVOICE_UNPUSHED_OR_DELETED"
FLAG_REDUCED = "REDUCED_FROM_INITIAL"
FLAG_DELETED_JOB = "DELETED_JOB"

_DEFAULT_SEVERITY = {
    "R01_COMPLETED_NO_QBO_INVOICE": "medium",
    "R02_INVOICE_VARIANCE": "medium",
    "R03_JOB_VALUE_REDUCED": "medium",
    "R04_SIMPRO_INVOICE_NOT_IN_QBO": "high",
    "R05_LABOR_STRIPPED": "high",
    "R06_LABOR_NO_REVENUE": "medium",
    "R07_PAYMENT_SIMPRO_ONLY": "high",
    "R08_PAYMENT_QBO_ONLY": "medium",
    "R09_PAYMENT_AMOUNT_MISMATCH": "medium",
    "R10_PAID_NO_QBO_INVOICE": "high",
    "R11_SEQUENCE_GAP": "medium",
    "R12_DELETED_JOB": "high",
    "R13_SNAPSHOT_MUTATION": "high",
}


def _exc(rule, job_no, customer, amount_cents, detail, sources, flag=""):
    sources = sorted(set(sources))
    corroborated = len(sources) >= 2
    return {
        "rule": rule,
        "rule_desc": RULES[rule],
        "severity": _DEFAULT_SEVERITY[rule],
        # Tool-assigned confidence caps at medium: "high" requires a human
        # to test normal explanations (two-source rule, skill methodology).
        "confidence": "medium" if corroborated else "low",
        "bucket": config.BUCKET_PROBABLE if corroborated else config.BUCKET_UNRESOLVED,
        "special_flag": flag,
        "job_no": str(job_no or ""),
        "customer": customer or "",
        "amount_cents": int(amount_cents or 0),
        "detail": detail,
        "sources": ";".join(sources),
    }


def _destructive_clause(column: str) -> str:
    return "(" + " OR ".join(
        f"{column} LIKE '%{kw}%'" for kw in config.DESTRUCTIVE_KEYWORDS
    ) + ")"


def _kw_clause(column: str, keywords) -> str:
    return "(" + " OR ".join(f"{column} LIKE '%{kw}%'" for kw in keywords) + ")"


def check_population(conn: sqlite3.Connection) -> None:
    """Export 3 must be the complete job population. Against a filtered
    list every ordinary closed job reads as a deletion, so refuse."""
    n = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    if n == 0:
        raise RulesError("jobs export is empty")
    closed = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE status_norm IN (%s)"
        % ",".join("?" * len(config.COMPLETED_STATUSES)),
        tuple(config.COMPLETED_STATUSES),
    ).fetchone()[0]
    if closed == 0:
        raise RulesError(
            "jobs export contains no completed/closed/archived jobs — it looks "
            "filtered to open work. Sequence-gap and deleted-job detection are "
            "unsafe against a partial population. Re-export the FULL job list "
            "(including closed, archived, voided and paid)."
        )


def run_rules(conn: sqlite3.Connection) -> list[dict]:
    check_population(conn)
    out: list[dict] = []
    completed = tuple(sorted(config.COMPLETED_STATUSES))
    in_completed = "status_norm IN (%s)" % ",".join("'%s'" % s for s in completed)
    in_voided = "status_norm IN (%s)" % ",".join(
        "'%s'" % s for s in sorted(config.VOIDED_STATUSES))

    # --- R01: completed job, no QBO invoice -------------------------------
    for job_no, cust, val in conn.execute(f"""
        SELECT j.job_no, j.customer, COALESCE(j.job_value_cents, 0)
        FROM jobs j
        WHERE j.{in_completed}
          AND COALESCE(j.job_value_cents, 0) > 0
          AND NOT EXISTS (SELECT 1 FROM qbo_txns q WHERE q.job_no = j.job_no)
        ORDER BY j.job_no"""):
        out.append(_exc("R01_COMPLETED_NO_QBO_INVOICE", job_no, cust, val,
                        f"job value {fmt_cents(val)}; zero QBO invoices found",
                        ["simpro_jobs"]))

    # --- R02: invoiced total vs job value ---------------------------------
    for job_no, cust, val, inv in conn.execute(f"""
        SELECT j.job_no, j.customer, COALESCE(j.job_value_cents,0),
               SUM(COALESCE(q.amount_cents,0))
        FROM jobs j JOIN qbo_txns q ON q.job_no = j.job_no
        WHERE NOT j.{in_voided}
        GROUP BY j.job_no, j.customer
        HAVING SUM(COALESCE(q.amount_cents,0)) != COALESCE(j.job_value_cents,0)
        ORDER BY j.job_no"""):
        variance = val - inv
        out.append(_exc("R02_INVOICE_VARIANCE", job_no, cust, abs(variance),
                        f"simPRO job value {fmt_cents(val)} vs QBO invoiced "
                        f"{fmt_cents(inv)}; variance {fmt_cents(variance)} "
                        + ("(under-invoiced)" if variance > 0 else "(over-invoiced)"),
                        ["simpro_jobs", "qbo_txns"]))

    # --- R03: job value reduced from initial entry (user log) -------------
    for job_no, user, ts, old, new in conn.execute(f"""
        SELECT u.job_no, u.user, u.ts, u.old_value, u.new_value
        FROM user_log u
        WHERE u.job_no IS NOT NULL AND u.old_value != '' AND u.new_value != ''
          AND {_kw_clause('u.action_norm', ('value', 'total', 'price', 'amount'))}
        ORDER BY u.ts, u.id"""):
        o, n = parse_cents(old), parse_cents(new)
        if o is None or n is None or n >= o:
            continue
        cust = conn.execute("SELECT customer FROM jobs WHERE job_no=?",
                            (job_no,)).fetchone()
        out.append(_exc("R03_JOB_VALUE_REDUCED", job_no, cust[0] if cust else "",
                        o - n,
                        f"{ts} by {user}: value {fmt_cents(o)} -> {fmt_cents(n)} "
                        f"(reduction {fmt_cents(o - n)})",
                        ["simpro_user_log"] + (["simpro_jobs"] if cust else []),
                        flag=FLAG_REDUCED))

    # --- R04: invoice existed in simPRO, never reached QBO -----------------
    inv_kw = _kw_clause("u.action_norm", config.INVOICE_KEYWORDS)
    for job_no, events in conn.execute(f"""
        SELECT u.job_no,
               GROUP_CONCAT(u.ts || ' ' || u.user || ': ' || u.action, ' | ')
        FROM user_log u
        WHERE u.job_no IS NOT NULL AND {inv_kw}
        GROUP BY u.job_no ORDER BY u.job_no"""):
        has_qbo = conn.execute(
            "SELECT 1 FROM qbo_txns WHERE job_no=? LIMIT 1", (job_no,)).fetchone()
        if has_qbo:
            continue
        deleted = conn.execute(f"""
            SELECT 1 FROM user_log u WHERE u.job_no=? AND {inv_kw}
              AND {_destructive_clause('u.action_norm')} LIMIT 1""",
            (job_no,)).fetchone()
        cust = conn.execute("SELECT customer FROM jobs WHERE job_no=?",
                            (job_no,)).fetchone()
        val = conn.execute(
            "SELECT COALESCE(job_value_cents,0) FROM jobs WHERE job_no=?",
            (job_no,)).fetchone()
        out.append(_exc(
            "R04_SIMPRO_INVOICE_NOT_IN_QBO", job_no, cust[0] if cust else "",
            val[0] if val else 0,
            ("invoice DELETED in simPRO before export to QBO; " if deleted
             else "invoice created in simPRO, not found in QBO; ") + events,
            ["simpro_user_log"] + (["simpro_jobs"] if cust else []),
            flag=FLAG_SIMPRO_INVOICE_UNPUSHED))

    # --- R05: labor applied then voided/zeroed/removed ---------------------
    labor_kw = _kw_clause("u.action_norm", config.LABOR_KEYWORDS)
    for job_no, user, ts, action, old, new in conn.execute(f"""
        SELECT u.job_no, u.user, u.ts, u.action, u.old_value, u.new_value
        FROM user_log u
        WHERE u.job_no IS NOT NULL AND {labor_kw}
          AND {_destructive_clause('u.action_norm')}
        ORDER BY u.ts, u.id"""):
        hours = conn.execute(
            "SELECT COALESCE(SUM(hours),0) FROM labor WHERE job_no=?",
            (job_no,)).fetchone()[0]
        amount = parse_cents(old) or round(hours * config.LABOR_COST_RATE_CENTS)
        cust = conn.execute("SELECT customer FROM jobs WHERE job_no=?",
                            (job_no,)).fetchone()
        sources = ["simpro_user_log"]
        if hours:
            sources.append("simpro_labor")
        out.append(_exc("R05_LABOR_STRIPPED", job_no, cust[0] if cust else "",
                        amount,
                        f"{ts} by {user}: {action}"
                        + (f" (old={old} new={new})" if old or new else "")
                        + f"; {hours:g}h on timesheets @ $104/h", sources))

    # --- R06: labor cost exceeds invoiced revenue ---------------------------
    for job_no, cust, hours, cost, inv in conn.execute("""
        SELECT l.job_no, COALESCE(j.customer,''), SUM(l.hours),
               SUM(l.labor_cost_cents),
               COALESCE((SELECT SUM(q.amount_cents) FROM qbo_txns q
                         WHERE q.job_no = l.job_no), 0)
        FROM labor l LEFT JOIN jobs j ON j.job_no = l.job_no
        GROUP BY l.job_no
        HAVING SUM(l.labor_cost_cents) > COALESCE((SELECT SUM(q.amount_cents)
               FROM qbo_txns q WHERE q.job_no = l.job_no), 0)
        ORDER BY l.job_no"""):
        out.append(_exc("R06_LABOR_NO_REVENUE", job_no, cust, cost - inv,
                        f"{hours:g}h labor = {fmt_cents(cost)} cost at $104/h vs "
                        f"{fmt_cents(inv)} invoiced in QBO",
                        ["simpro_labor", "qbo_txns"] if inv else ["simpro_labor"]))

    # --- R07/R08/R09/R10: payment application ------------------------------
    sp = {r[0]: r[1] for r in conn.execute(
        "SELECT job_no, SUM(amount_cents) FROM simpro_payments "
        "WHERE job_no IS NOT NULL GROUP BY job_no")}
    qp = {r[0]: r[1] for r in conn.execute(
        "SELECT job_no, SUM(amount_cents) FROM qbo_payments "
        "WHERE job_no IS NOT NULL GROUP BY job_no")}
    for job_no in sorted(set(sp) | set(qp)):
        s, q = sp.get(job_no), qp.get(job_no)
        cust_row = conn.execute("SELECT customer FROM jobs WHERE job_no=?",
                                (job_no,)).fetchone()
        cust = cust_row[0] if cust_row else ""
        if s is not None and q is None:
            has_inv = conn.execute(
                "SELECT 1 FROM qbo_txns WHERE job_no=? LIMIT 1",
                (job_no,)).fetchone()
            if not has_inv:
                out.append(_exc(
                    "R10_PAID_NO_QBO_INVOICE", job_no, cust, s,
                    f"simPRO shows {fmt_cents(s)} received; job has NO QBO "
                    "invoice and NO QBO payment — revenue never reached "
                    "accounting", ["simpro_payments", "qbo_txns"]))
            else:
                out.append(_exc(
                    "R07_PAYMENT_SIMPRO_ONLY", job_no, cust, s,
                    f"simPRO payment {fmt_cents(s)}; no QBO payment recorded",
                    ["simpro_payments", "qbo_payments"]))
        elif q is not None and s is None:
            out.append(_exc(
                "R08_PAYMENT_QBO_ONLY", job_no, cust, q,
                f"QBO payment {fmt_cents(q)}; no simPRO payment recorded",
                ["simpro_payments", "qbo_payments"]))
        elif s != q:
            out.append(_exc(
                "R09_PAYMENT_AMOUNT_MISMATCH", job_no, cust, abs(s - q),
                f"simPRO total {fmt_cents(s)} vs QBO total {fmt_cents(q)}",
                ["simpro_payments", "qbo_payments"]))

    # --- R11/R12: sequence gaps and deleted jobs ----------------------------
    nums = [int(r[0]) for r in conn.execute(
        "SELECT job_no FROM jobs WHERE job_no GLOB '[0-9]*'") if str(r[0]).isdigit()]
    log_jobs = {r[0] for r in conn.execute(
        "SELECT DISTINCT job_no FROM user_log WHERE job_no IS NOT NULL")}
    known = {str(r[0]) for r in conn.execute("SELECT job_no FROM jobs")}
    gap_nos: list[str] = []
    if nums:
        present = set(nums)
        gap_nos = [str(n) for n in range(min(nums), max(nums) + 1)
                   if n not in present]
    for g in gap_nos:
        if g in log_jobs:
            continue  # escalated to R12 below with log evidence
        out.append(_exc(
            "R11_SEQUENCE_GAP", g, "", 0,
            "job number absent from full job list; no surviving user-log "
            "trace in supplied window — request wider log export",
            ["simpro_jobs"]))
    deleted_candidates = sorted(
        (set(gap_nos) & log_jobs) | {j for j in log_jobs if j not in known},
        key=lambda x: (len(x), x))
    for job_no in deleted_candidates:
        events = conn.execute(
            "SELECT COUNT(*), MIN(ts), MAX(ts) FROM user_log WHERE job_no=?",
            (job_no,)).fetchone()
        destr = conn.execute(f"""
            SELECT ts, user, action FROM user_log
            WHERE job_no=? AND {_destructive_clause('action_norm')}
            ORDER BY ts, id""", (job_no,)).fetchall()
        amount = conn.execute("""
            SELECT COALESCE(MAX(x), 0) FROM (
              SELECT SUM(amount_cents) AS x FROM simpro_payments WHERE job_no=:j
              UNION ALL
              SELECT SUM(amount_cents) FROM qbo_txns WHERE job_no=:j
              UNION ALL
              SELECT SUM(labor_cost_cents) FROM labor WHERE job_no=:j)""",
            {"j": job_no}).fetchone()[0] or 0
        sources = ["simpro_user_log"]
        for table, src in (("labor", "simpro_labor"),
                           ("simpro_payments", "simpro_payments"),
                           ("qbo_txns", "qbo_txns"),
                           ("audit_log", "qbo_audit_log")):
            if conn.execute(f"SELECT 1 FROM {table} WHERE job_no=? LIMIT 1",
                            (job_no,)).fetchone():
                sources.append(src)
        detail = (f"{events[0]} user-log events {events[1]}..{events[2]}; "
                  "job absent from full job list")
        if destr:
            detail += "; destructive: " + " | ".join(
                f"{ts} {user}: {action}" for ts, user, action in destr[:5])
        out.append(_exc("R12_DELETED_JOB", job_no, "", amount, detail, sources,
                        flag=FLAG_DELETED_JOB))

    # Deterministic order + IDs.
    out.sort(key=lambda e: (e["rule"], e["job_no"], e["detail"]))
    counters: dict[str, int] = {}
    for e in out:
        key = f"{e['rule']}:{e['job_no']}"
        counters[key] = counters.get(key, 0) + 1
        e["exception_id"] = f"{e['rule']}-{e['job_no'] or 'NA'}-{counters[key]:02d}"
    return out


def mutation_exceptions(manifest_mutations: list[dict]) -> list[dict]:
    """Convert snapshot-mutation manifest entries into exceptions."""
    out = []
    for i, m in enumerate(sorted(manifest_mutations,
                                 key=lambda m: (m["label"], m["sha256"])), 1):
        e = _exc("R13_SNAPSHOT_MUTATION", "", "", 0,
                 f"label '{m['label']}' content changed: {m['mutation_of'][:12]} "
                 f"-> {m['sha256'][:12]} (re-export or record altered after "
                 "first look — corroborate before relying on either copy)",
                 ["snapshot_manifest"])
        e["exception_id"] = f"R13_SNAPSHOT_MUTATION-NA-{i:02d}"
        out.append(e)
    return out
