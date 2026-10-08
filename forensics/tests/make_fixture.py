"""Build the synthetic fixture and run the 7 gate checks.

    python -m tests.make_fixture      # all 7 checks must pass

The fixture is 100% synthetic: CUSTOMER_01.., TECH_01..,
USER_A@example.invalid, TESTJOB-####. No name in here refers to any real
person or company, and the gate itself verifies that convention.

Planted anomalies (the golden set):
  TESTJOB-7002  R02 variance (value $8,000, QBO invoiced $6,500)
  TESTJOB-7003  R01 completed, no QBO invoice ($4,200)
  TESTJOB-7004  R03 value reduced $7,500 -> $3,000 (user log)
  TESTJOB-7005  R01+R04+R10: invoice created then DELETED in simPRO, never
                in QBO, yet $6,000 payment recorded in simPRO
  TESTJOB-7006  R05+R06 labor voided; 12h on timesheets, zero revenue
  TESTJOB-7007  R07 paid in simPRO only ($2,500)
  TESTJOB-7008  R12 deleted job (full log chain survives) +R04 +R06
  TESTJOB-7009  R09 payment totals differ ($1,800 vs $1,500)
  TESTJOB-7010  R08 paid in QBO only ($3,200)
  TESTJOB-7011  R11 sequence gap, no surviving log trace
  TESTJOB-7014  R06 voided job with 4h labor
Clean controls: 7001, 7012 (open), 7013 (fully reconciled).
"""

from __future__ import annotations

import filecmp
import os
import shutil
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(REPO, "tests", "_build")
PY = sys.executable

JOBS = """Job No,Customer,Status,Job Value,Total Cost,Balance Remaining
TESTJOB-7001,CUSTOMER_01,Completed,5000.00,2100.00,0.00
TESTJOB-7002,CUSTOMER_02,Completed,8000.00,3900.00,1500.00
TESTJOB-7003,CUSTOMER_03,Completed,4200.00,1700.00,4200.00
TESTJOB-7004,CUSTOMER_04,Completed,3000.00,2800.00,0.00
TESTJOB-7005,CUSTOMER_05,Completed,6000.00,2600.00,0.00
TESTJOB-7006,CUSTOMER_06,Completed,0.00,1248.00,0.00
TESTJOB-7007,CUSTOMER_07,Completed,2500.00,900.00,0.00
TESTJOB-7009,CUSTOMER_01,Completed,1800.00,700.00,0.00
TESTJOB-7010,CUSTOMER_02,Completed,3200.00,1300.00,0.00
TESTJOB-7012,CUSTOMER_03,In Progress,900.00,100.00,900.00
TESTJOB-7013,CUSTOMER_04,Completed,7200.00,3000.00,0.00
TESTJOB-7014,CUSTOMER_05,Voided,1500.00,416.00,0.00
"""

JOBS_FILTERED = """Job No,Customer,Status,Job Value,Total Cost,Balance Remaining
TESTJOB-7012,CUSTOMER_03,In Progress,900.00,100.00,900.00
"""

QBO_TXNS = """Num,Customer,Date,Amount,Payment Date,Payment Source
TESTJOB-7001,CUSTOMER_01,2024-01-20,5000.00,2024-02-01,Check
TESTJOB-7002,CUSTOMER_02,2024-02-25,6500.00,2024-03-10,ACH
TESTJOB-7004,CUSTOMER_04,2024-02-15,3000.00,2024-03-01,Check
TESTJOB-7007,CUSTOMER_07,2024-04-10,2500.00,,
TESTJOB-7009,CUSTOMER_01,2024-05-05,1800.00,2024-05-20,Check
TESTJOB-7010,CUSTOMER_02,2024-05-12,3200.00,2024-05-30,ACH
TESTJOB-7013,CUSTOMER_04,2024-06-01,7200.00,2024-06-15,ACH
"""

LABOR = """Job No,Technician,Date,Hours
TESTJOB-7001,TECH_01,2024-01-12,8
TESTJOB-7002,TECH_02,2024-02-14,20
TESTJOB-7006,TECH_01,2024-03-18,12
TESTJOB-7008,TECH_02,2024-05-06,10
TESTJOB-7014,TECH_03,2024-06-20,4
"""

SP_PAY = """Invoice/Job Ref,Date,Amount
TESTJOB-7001,2024-02-01,5000.00
TESTJOB-7005,2024-03-18,6000.00
TESTJOB-7007,2024-04-20,2500.00
TESTJOB-7009,2024-05-20,1800.00
TESTJOB-7013,2024-06-15,7200.00
"""

QB_PAY = """Invoice/Job Ref,Date,Amount
TESTJOB-7001,2024-02-01,5000.00
TESTJOB-7009,2024-05-20,1500.00
TESTJOB-7010,2024-05-30,3200.00
TESTJOB-7013,2024-06-15,7200.00
"""

USER_LOG = """Date/Time,User,Action,Record,Description,Old Value,New Value
2024-01-05 09:00:00,USER_A@example.invalid,Job created,Job #7004,,,
2024-01-06 10:15:00,USER_A@example.invalid,Job created,Job #7005,,,
2024-02-10 14:00:00,USER_A@example.invalid,Job value updated,Job #7004,,7500.00,3000.00
2024-03-01 10:00:00,USER_B@example.invalid,Invoice created,Job #7005,invoice for completed work,,
2024-03-20 22:15:00,USER_B@example.invalid,Invoice deleted,Job #7005,,,
2024-04-02 11:00:00,USER_B@example.invalid,Timesheet entry voided,Job #7006,12h TECH_01,1248.00,0.00
2024-05-01 08:30:00,USER_A@example.invalid,Job created,Job #7008,,,
2024-05-03 07:45:00,USER_A@example.invalid,Technician scheduled,Job #7008,TECH_02 on site 2024-05-06,,
2024-05-06 16:00:00,USER_B@example.invalid,Note added,Job #7008,rough-in complete; panel terminated,,
2024-05-10 09:00:00,USER_B@example.invalid,Invoice created,Job #7008,,,
2024-06-15 23:40:00,USER_B@example.invalid,Job deleted,Job #7008,,,
2024-06-16 08:00:00,USER_A@example.invalid,Job note added,Job #7001,closeout photos attached,,
"""

AUDIT_LOG = """Date,User,Event,Name,Amount
2024-02-24 17:05:00,USER_B@example.invalid,Changed,Invoice 7002,6500.00
2024-05-21 09:30:00,USER_B@example.invalid,Deleted,Payment 7009,300.00
"""

FILES = {
    "jobs.csv": JOBS,
    "jobs_filtered.csv": JOBS_FILTERED,
    "qbo_txns.csv": QBO_TXNS,
    "labor.csv": LABOR,
    "simpro_payments.csv": SP_PAY,
    "qbo_payments.csv": QB_PAY,
    "user_log.csv": USER_LOG,
    "audit_log.csv": AUDIT_LOG,
}

# (rule, job_no, amount_cents, special_flag) — exact expected output.
GOLDEN = sorted([
    ("R01_COMPLETED_NO_QBO_INVOICE", "7003", 420000, ""),
    ("R01_COMPLETED_NO_QBO_INVOICE", "7005", 600000, ""),
    ("R02_INVOICE_VARIANCE", "7002", 150000, ""),
    ("R03_JOB_VALUE_REDUCED", "7004", 450000, "REDUCED_FROM_INITIAL"),
    ("R04_SIMPRO_INVOICE_NOT_IN_QBO", "7005", 600000, "SIMPRO_INVOICE_UNPUSHED_OR_DELETED"),
    ("R04_SIMPRO_INVOICE_NOT_IN_QBO", "7008", 0, "SIMPRO_INVOICE_UNPUSHED_OR_DELETED"),
    ("R05_LABOR_STRIPPED", "7006", 124800, ""),
    ("R06_LABOR_NO_REVENUE", "7006", 124800, ""),
    ("R06_LABOR_NO_REVENUE", "7008", 104000, ""),
    ("R06_LABOR_NO_REVENUE", "7014", 41600, ""),
    ("R07_PAYMENT_SIMPRO_ONLY", "7007", 250000, ""),
    ("R08_PAYMENT_QBO_ONLY", "7010", 320000, ""),
    ("R09_PAYMENT_AMOUNT_MISMATCH", "7009", 30000, ""),
    ("R10_PAID_NO_QBO_INVOICE", "7005", 600000, ""),
    ("R11_SEQUENCE_GAP", "7011", 0, ""),
    ("R12_DELETED_JOB", "7008", 104000, "DELETED_JOB"),
])


def write_fixture(dest: str) -> None:
    os.makedirs(dest, exist_ok=True)
    for name, content in FILES.items():
        with open(os.path.join(dest, name), "w", encoding="utf-8",
                  newline="") as f:
            f.write(content)


def _load_all(d: str):
    from nfe.ingest import build_db, load_csv
    datasets = {
        "jobs": load_csv(os.path.join(d, "jobs.csv"), "jobs"),
        "qbo_txns": load_csv(os.path.join(d, "qbo_txns.csv"), "qbo_txns"),
        "labor": load_csv(os.path.join(d, "labor.csv"), "labor"),
        "simpro_payments": load_csv(os.path.join(d, "simpro_payments.csv"),
                                    "simpro_payments"),
        "qbo_payments": load_csv(os.path.join(d, "qbo_payments.csv"),
                                 "qbo_payments"),
        "user_log": load_csv(os.path.join(d, "user_log.csv"), "user_log"),
        "audit_log": load_csv(os.path.join(d, "audit_log.csv"), "audit_log"),
    }
    return datasets, build_db(datasets)


def main() -> int:
    passed = 0

    def check(n, name, ok, info=""):
        nonlocal passed
        status = "PASS" if ok else "FAIL"
        print(f"check {n}/7 {name}: {status}" + (f" — {info}" if info else ""))
        if ok:
            passed += 1
        return ok

    if os.path.exists(BUILD):
        shutil.rmtree(BUILD)

    # 1 — fixture generation is deterministic and uses only synthetic names
    a, b = os.path.join(BUILD, "a"), os.path.join(BUILD, "b")
    write_fixture(a)
    write_fixture(b)
    identical = all(
        filecmp.cmp(os.path.join(a, f), os.path.join(b, f), shallow=False)
        for f in FILES)
    blob = "".join(FILES.values())
    synthetic_only = ("example.invalid" in blob and "TESTJOB-" in blob
                      and "CUSTOMER_01" in blob and "TECH_01" in blob)
    check(1, "fixture determinism + synthetic naming",
          identical and synthetic_only)

    # 2 — ingest integrity + population guard
    from nfe.ingest import build_db, load_csv
    from nfe.rules import RulesError, run_rules
    datasets, conn = _load_all(a)
    counts_ok = (
        len(datasets["jobs"]) == 12 and len(datasets["qbo_txns"]) == 7
        and len(datasets["labor"]) == 5 and len(datasets["user_log"]) == 12
        and len(datasets["audit_log"]) == 2)
    filtered_raises = False
    try:
        run_rules(build_db({
            "jobs": load_csv(os.path.join(a, "jobs_filtered.csv"), "jobs"),
            "qbo_txns": datasets["qbo_txns"]}))
    except RulesError:
        filtered_raises = True
    check(2, "ingest row counts + filtered-population guard",
          counts_ok and filtered_raises)

    # 3 — golden exception set (exact)
    exceptions = run_rules(conn)
    got = sorted((e["rule"], e["job_no"], e["amount_cents"], e["special_flag"])
                 for e in exceptions)
    ok = got == GOLDEN
    if not ok:
        for row in sorted(set(GOLDEN) - set(got)):
            print("   missing:", row)
        for row in sorted(set(got) - set(GOLDEN)):
            print("   extra:  ", row)
    check(3, "golden anomaly set (16 exceptions, exact match)", ok,
          f"{len(got)} exceptions")

    # 4 — labor red flags, $104/h math, two-source corroboration
    r05 = [e for e in exceptions if e["rule"] == "R05_LABOR_STRIPPED"]
    r06 = {e["job_no"]: e for e in exceptions
           if e["rule"] == "R06_LABOR_NO_REVENUE"}
    ok = (len(r05) == 1 and r05[0]["job_no"] == "7006"
          and r05[0]["amount_cents"] == 124800
          and r05[0]["bucket"] == "probable_exposure"   # user log + timesheets
          and r06["7006"]["amount_cents"] == 12 * 10400
          and r06["7014"]["amount_cents"] == 4 * 10400)
    check(4, "labor red flags ($104/h, corroborated)", ok)

    # 5 — payment application rules
    pay = {e["rule"]: e for e in exceptions if e["rule"].startswith(
        ("R07", "R08", "R09", "R10"))}
    ok = (pay["R07_PAYMENT_SIMPRO_ONLY"]["job_no"] == "7007"
          and pay["R08_PAYMENT_QBO_ONLY"]["job_no"] == "7010"
          and pay["R09_PAYMENT_AMOUNT_MISMATCH"]["amount_cents"] == 30000
          and pay["R10_PAID_NO_QBO_INVOICE"]["job_no"] == "7005"
          and pay["R10_PAID_NO_QBO_INVOICE"]["amount_cents"] == 600000)
    check(5, "payment application (one-system, mismatch, paid-no-invoice)", ok)

    # 6 — deleted-job reconstruction + user activity profile
    recon_dir = os.path.join(BUILD, "recon")
    rc = subprocess.run(
        [PY, "-m", "nfe.deleted_jobs", "--user-log",
         os.path.join(a, "user_log.csv"), "--audit-log",
         os.path.join(a, "audit_log.csv"), "--labor",
         os.path.join(a, "labor.csv"), "--simpro-payments",
         os.path.join(a, "simpro_payments.csv"), "--qbo-txns",
         os.path.join(a, "qbo_txns.csv"), "--auto",
         os.path.join(a, "jobs.csv"), "-o", recon_dir],
        cwd=REPO, capture_output=True, text=True)
    recon_path = os.path.join(recon_dir, "job_7008.md")
    recon_ok = rc.returncode == 0 and os.path.exists(recon_path)
    if recon_ok:
        text = open(recon_path, encoding="utf-8").read()
        recon_ok = ("Job deleted" in text and "TECH_02" in text
                    and "Technician scheduled" in text
                    and "What this does NOT establish" in text
                    and "10h on site" in text)
    from nfe.user_activity import CAVEAT, user_activity_profile
    profile = user_activity_profile(conn)
    prof_ok = (profile and profile[0]["user"] == "USER_B@example.invalid"
               and profile[0]["destructive_actions"] == 3
               and profile[0]["after_hours_destructive"] == 2
               and profile[0]["caveat"] == CAVEAT)
    check(6, "deleted-job reconstruction + activity profile (lead-not-conclusion)",
          recon_ok and prof_ok)

    # 7 — report byte-determinism, recalc 0 errors, snapshot mutation detection
    out1 = os.path.join(BUILD, "anomalies_1.xlsx")
    out2 = os.path.join(BUILD, "anomalies_2.xlsx")
    args = ["-m", "nfe.report_xlsx", os.path.join(a, "jobs.csv"),
            os.path.join(a, "qbo_txns.csv"),
            "--labor", os.path.join(a, "labor.csv"),
            "--simpro-payments", os.path.join(a, "simpro_payments.csv"),
            "--qbo-payments", os.path.join(a, "qbo_payments.csv"),
            "--user-log", os.path.join(a, "user_log.csv"),
            "--audit-log", os.path.join(a, "audit_log.csv")]
    r1 = subprocess.run([PY, *args, "-o", out1], cwd=REPO,
                        capture_output=True, text=True)
    r2 = subprocess.run([PY, *args, "-o", out2], cwd=REPO,
                        capture_output=True, text=True)
    byte_identical = (r1.returncode == 0 and r2.returncode == 0
                      and filecmp.cmp(out1, out2, shallow=False))
    if r1.returncode != 0:
        print(r1.stdout, r1.stderr)
    recalc = subprocess.run(
        [PY, os.path.join("scripts", "recalc.py"), out1], cwd=REPO,
        capture_output=True, text=True)
    recalc_ok = recalc.returncode == 0 and recalc.stdout.strip().startswith("0 errors")
    if not recalc_ok:
        print(recalc.stdout, recalc.stderr)

    from nfe import snapshot
    snap_dir = os.path.join(BUILD, "snaps")
    probe = os.path.join(BUILD, "probe.csv")
    with open(probe, "w", encoding="utf-8") as f:
        f.write("a,b\n1,2\n")
    e1 = snapshot.register(probe, "probe", snap_dir)
    with open(probe, "a", encoding="utf-8") as f:
        f.write("3,4\n")
    e2 = snapshot.register(probe, "probe", snap_dir)
    muts = snapshot.mutations(snap_dir)
    snap_ok = (e1["mutation_of"] is None and e2["mutation_of"] == e1["sha256"]
               and len(muts) == 1 and not snapshot.verify(snap_dir)
               and os.path.exists(e1["stored_as"]))  # original copy preserved
    check(7, "xlsx byte-determinism + recalc 0 errors + mutation detection",
          byte_identical and recalc_ok and snap_ok)

    print(f"\n{passed}/7 checks passed")
    return 0 if passed == 7 else 1


if __name__ == "__main__":
    sys.exit(main())
