#!/usr/bin/env python3
"""Build export #6 (QBO transactions) from raw Intuit MCP invoice pulls.

Inputs (all gitignored, under <forensics>/exports/):
  qbo_invoices_*_raw.json      raw `qbo_sales_get_invoices` responses
  qbo_invoices_*_inline.csv    small pulls transcribed by hand (columns:
                               Num,Customer,Date,DueDate,Amount,Balance,InvoiceId,JobLines
                               where JobLines is "job=amount|job=amount")

Outputs:
  exports/qbo_txns_api_v2.csv  one row per QBO invoice (QBO Num, JobNos, Balance ...)
  exports/qbo_txns_by_job.csv  one row per invoice x simPRO job; `Job Ref` is the
                               simPRO job number parsed from line descriptions
                               ("Job No. 6207 [Nexus Labor]"), falling back to the
                               QBO Num when no line carries a job number. This is the
                               file to feed `nfe.report_xlsx` as <qbo_txns>.

Deterministic: sorted output, regex extraction only, no inference. Run with
`python -I`. The QBO invoice number is NOT the simPRO job number — see CLAUDE.md.
"""
import csv, glob, json, os, re, sys

JOB_RE = re.compile(r"Job\s*No\.?\s*#?\s*(\d{3,})", re.I)


def load(forensics_dir):
    exports = os.path.join(forensics_dir, "exports")
    inv = {}
    for path in sorted(glob.glob(os.path.join(exports, "qbo_invoices_*_raw.json"))):
        with open(path) as fh:
            d = json.load(fh)
        for r in d["data"]:
            jobs = {}
            for ln in r.get("lines") or []:
                m = JOB_RE.search(ln.get("description") or "")
                if m:
                    jobs[m.group(1)] = jobs.get(m.group(1), 0.0) + float(ln.get("amount") or 0)
            inv.setdefault(r["id"], dict(
                Num=r.get("reference_number") or "",
                Customer=(r.get("contact") or {}).get("display_name", ""),
                Date=r.get("txn_date") or "", DueDate=r.get("due_date") or "",
                Amount=float(r.get("amount") or 0), Balance=float(r.get("balance_amount") or 0),
                InvoiceId=r["id"], jobs=jobs, SourceFile=os.path.basename(path)))
    for path in sorted(glob.glob(os.path.join(exports, "qbo_invoices_*_inline.csv"))):
        with open(path, newline="") as fh:
            for r in csv.DictReader(fh):
                jobs = {}
                for part in (r.get("JobLines") or "").split("|"):
                    if "=" in part:
                        j, a = part.split("=", 1)
                        jobs[j.strip()] = jobs.get(j.strip(), 0.0) + float(a)
                inv.setdefault(r["InvoiceId"], dict(
                    Num=r["Num"], Customer=r["Customer"], Date=r["Date"], DueDate=r["DueDate"],
                    Amount=float(r["Amount"]), Balance=float(r["Balance"]), InvoiceId=r["InvoiceId"],
                    jobs=jobs, SourceFile=os.path.basename(path)))
    return sorted(inv.values(), key=lambda r: (r["Date"], r["Num"], r["InvoiceId"]))


def main():
    forensics_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    rows = load(forensics_dir)
    exports = os.path.join(forensics_dir, "exports")
    cols = ["Num", "Customer", "Date", "DueDate", "Amount", "Balance", "InvoiceId", "JobNos", "SourceFile"]
    with open(os.path.join(exports, "qbo_txns_api_v2.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(cols)
        for r in rows:
            r["JobNos"] = "|".join(sorted(r["jobs"], key=int))
            w.writerow([f"{r[c]:.2f}" if c in ("Amount", "Balance") else r[c] for c in cols])
    n = 0
    with open(os.path.join(exports, "qbo_txns_by_job.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Job Ref", "QBO Num", "Customer", "Date", "Amount", "Balance", "InvoiceId", "Job Ref Source"])
        for r in rows:
            if r["jobs"]:
                for j in sorted(r["jobs"], key=int):
                    bal = f"{r['Balance']:.2f}" if len(r["jobs"]) == 1 else ""
                    w.writerow([j, r["Num"], r["Customer"], r["Date"], f"{r['jobs'][j]:.2f}", bal,
                                r["InvoiceId"], "line_description_Job_No"]); n += 1
            else:
                w.writerow([r["Num"], r["Num"], r["Customer"], r["Date"], f"{r['Amount']:.2f}",
                            f"{r['Balance']:.2f}", r["InvoiceId"], "qbo_num_fallback_no_job_in_lines"]); n += 1
    withjob = sum(1 for r in rows if r["jobs"])
    print(f"invoices {len(rows)} ({rows[0]['Date']}..{rows[-1]['Date']}); with Job No. in lines {withjob}; by-job rows {n}")
    print("open balance total", f"{sum(r['Balance'] for r in rows):.2f}")
    print("Every row is a LEAD requiring corroboration, never a finding.")


if __name__ == "__main__":
    main()
