#!/usr/bin/env python3
"""QBO-only pre-scan: sequence gaps + open balances from the invoice export.

Runs BEFORE the simPRO exports exist. Every line it emits is a lead to
corroborate against the simPRO user log and the QBO audit log — never a
finding. A missing invoice number can be a deleted QBO invoice, a simPRO
invoice never exported, a voided document, or a number consumed by an
estimate / credit memo / other transaction type.

    python scripts/qbo_prescan.py exports/qbo_txns_api.csv -o prescan/

Writes prescan/qbo_sequence_gaps.csv and prescan/qbo_open_balances.csv.
Output is deterministic for a given input (sorted, no timestamps).
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from nfe.util import fmt_cents, norm_header, parse_cents  # noqa: E402

_NUM_RE = re.compile(r"(\d{3,})")


def load(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        header = [norm_header(h) for h in next(reader)]
        rows = []
        for raw in reader:
            if not any(c.strip() for c in raw):
                continue
            rows.append(dict(zip(header, raw)))
    return rows


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python scripts/qbo_prescan.py")
    ap.add_argument("qbo_txns", help="QBO invoices CSV (Num, Customer, Date, Amount[, Balance])")
    ap.add_argument("-o", "--out", default="prescan", help="output directory")
    ap.add_argument("--max-gap", type=int, default=50,
                    help="ignore gaps wider than this (outlier/renumbered refs)")
    args = ap.parse_args(argv)

    rows = load(args.qbo_txns)
    num_col = next((c for c in ("num", "job_ref", "no", "invoice_no", "doc_number")
                    if rows and c in rows[0]), None)
    if num_col is None:
        print("error: no invoice-number column (Num/No/Invoice No) found", file=sys.stderr)
        return 2
    cust_col = next((c for c in ("customer", "customer_name", "name") if c in rows[0]), None)
    bal_col = next((c for c in ("balance", "open_balance", "balance_remaining") if c in rows[0]), None)

    nums = sorted({int(m.group(1)) for r in rows
                   for m in [_NUM_RE.search(r.get(num_col, ""))] if m})
    os.makedirs(args.out, exist_ok=True)

    gaps = []
    for a, b in zip(nums, nums[1:]):
        if 1 < b - a <= args.max_gap:
            gaps.append((a, b, list(range(a + 1, b))))
    with open(os.path.join(args.out, "qbo_sequence_gaps.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["gap_after", "gap_before", "missing_count", "missing_numbers",
                    "note"])
        for a, b, miss in gaps:
            w.writerow([a, b, len(miss), ";".join(map(str, miss)),
                        "LEAD: corroborate with simPRO user log + QBO audit log"])
    missing_total = sum(len(m) for _, _, m in gaps)

    total = sum(parse_cents(r.get("amount")) or 0 for r in rows)
    opens = []
    if bal_col:
        for r in rows:
            bal = parse_cents(r.get(bal_col)) or 0
            if bal != 0:
                opens.append((bal, r))
        opens.sort(key=lambda x: (-abs(x[0]), x[1].get(num_col, "")))
        with open(os.path.join(args.out, "qbo_open_balances.csv"), "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["num", "customer", "date", "amount_usd", "open_balance_usd",
                        "flag"])
            for bal, r in opens:
                flag = "CREDIT_OR_UNAPPLIED" if bal < 0 else "OPEN"
                w.writerow([r.get(num_col, ""), r.get(cust_col, "") if cust_col else "",
                            r.get("date", ""), fmt_cents(parse_cents(r.get("amount"))),
                            fmt_cents(bal), flag])

    print(f"invoices: {len(rows)}  numeric refs: {len(nums)}"
          + (f"  range {nums[0]}..{nums[-1]}" if nums else ""))
    print(f"total invoiced: {fmt_cents(total)}")
    print(f"sequence gaps (<= {args.max_gap} wide): {len(gaps)} gaps, "
          f"{missing_total} missing numbers -> {args.out}/qbo_sequence_gaps.csv")
    if bal_col:
        open_total = sum(b for b, _ in opens if b > 0)
        credit_total = sum(b for b, _ in opens if b < 0)
        print(f"open balances: {sum(1 for b,_ in opens if b>0)} open "
              f"({fmt_cents(open_total)}), {sum(1 for b,_ in opens if b<0)} "
              f"credit/unapplied ({fmt_cents(credit_total)}) -> "
              f"{args.out}/qbo_open_balances.csv")
    print("Every row is a LEAD requiring corroboration, never a finding.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
