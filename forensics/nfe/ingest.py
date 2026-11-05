"""Load CSV exports into SQLite with strict, explicit column mapping.

Every dataset has a required-field spec. Header matching is by normalized
name with a short alias list per field — never by position, never fuzzy.
A missing required column is a hard error naming the file and the column.
"""

from __future__ import annotations

import csv
import sqlite3

from . import config
from .util import extract_job_no, iso, norm_header, norm_text, parse_cents, parse_dt


class IngestError(RuntimeError):
    pass


# field -> accepted normalized headers (first match wins, left to right)
SPECS: dict[str, dict[str, list[str]]] = {
    "jobs": {
        "job_no": ["job_no", "job_number", "job", "job_id", "no"],
        "customer": ["customer", "customer_name", "company", "client"],
        "status": ["status", "job_status", "stage"],
        "job_value": ["job_value", "value", "total_ex_tax", "total", "contract_value", "job_total"],
        "total_cost": ["total_cost", "cost", "actual_cost"],
        "balance_remaining": ["balance_remaining", "balance", "remaining", "outstanding"],
    },
    "qbo_txns": {
        "job_ref": ["job_ref", "num", "no", "invoice_no", "invoice_number", "doc_number"],
        "customer": ["customer", "customer_name", "name", "client"],
        "date": ["date", "txn_date", "invoice_date"],
        "amount": ["amount", "total", "amount_gross"],
        "payment_date": ["payment_date", "paid_date", "last_payment_date"],
        "payment_source": ["payment_source", "payment_method", "source", "deposit_to"],
    },
    "labor": {
        "job_no": ["job_no", "job_number", "job", "job_id"],
        "technician": ["technician", "tech", "employee", "staff", "resource"],
        "date": ["date", "work_date", "schedule_date"],
        "hours": ["hours", "hrs", "duration", "time"],
        "labor_cost": ["labor_cost", "labour_cost", "cost"],  # optional, recomputed anyway
    },
    "simpro_payments": {
        "ref": ["ref", "invoice_job_ref", "invoice_ref", "job_ref", "invoice_no", "job_no"],
        "date": ["date", "payment_date", "paid_date"],
        "amount": ["amount", "payment_amount", "total", "applied"],
    },
    "qbo_payments": {
        "ref": ["ref", "invoice_job_ref", "invoice_ref", "job_ref", "invoice_no", "num"],
        "date": ["date", "payment_date", "txn_date"],
        "amount": ["amount", "payment_amount", "total", "applied"],
    },
    "user_log": {
        "ts": ["ts", "date_time", "datetime", "timestamp", "date"],
        "user": ["user", "username", "employee", "staff"],
        "action": ["action", "event", "activity", "operation"],
        "record": ["record", "record_ref", "reference", "item", "object"],
        "description": ["description", "details", "detail", "message"],
        "old_value": ["old_value", "old", "previous_value", "before"],
        "new_value": ["new_value", "new", "after"],
    },
    "audit_log": {
        "ts": ["ts", "date", "date_time", "datetime", "date_changed"],
        "user": ["user", "username", "changed_by"],
        "event": ["event", "action", "history_type"],
        "name": ["name", "record", "transaction", "customer"],
        "amount": ["amount", "total"],
    },
}

# fields allowed to be absent from the file entirely
OPTIONAL_FIELDS = {
    "jobs": {"total_cost", "balance_remaining"},
    "qbo_txns": {"payment_date", "payment_source"},
    "labor": {"labor_cost"},
    "simpro_payments": set(),
    "qbo_payments": set(),
    "user_log": {"old_value", "new_value", "description", "record"},
    "audit_log": {"amount", "name"},
}


def load_csv(path: str, dataset: str) -> list[dict]:
    """Read one export. Returns rows keyed by canonical field names, plus
    row_no (1-based data row) and source_file."""
    spec = SPECS[dataset]
    optional = OPTIONAL_FIELDS[dataset]
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        try:
            raw_header = next(reader)
        except StopIteration:
            raise IngestError(f"{path}: empty file") from None
        headers = [norm_header(h) for h in raw_header]
        col_of: dict[str, int] = {}
        for field, aliases in spec.items():
            for alias in aliases:
                if alias in headers:
                    col_of[field] = headers.index(alias)
                    break
            else:
                if field not in optional:
                    raise IngestError(
                        f"{path}: required column '{field}' not found "
                        f"(accepted headers: {aliases}; file has: {headers})"
                    )
        rows = []
        for i, raw in enumerate(reader, start=1):
            if not any(cell.strip() for cell in raw):
                continue
            row = {"row_no": i, "source_file": path}
            for field, idx in col_of.items():
                row[field] = raw[idx].strip() if idx < len(raw) else ""
            for field in spec:
                row.setdefault(field, "")
            rows.append(row)
    return rows


DDL = """
CREATE TABLE jobs (
    job_no TEXT PRIMARY KEY, customer TEXT, status TEXT, status_norm TEXT,
    job_value_cents INTEGER, total_cost_cents INTEGER,
    balance_remaining_cents INTEGER, row_no INTEGER, source_file TEXT);
CREATE TABLE qbo_txns (
    id INTEGER PRIMARY KEY, job_ref TEXT, job_no TEXT, customer TEXT,
    txn_date TEXT, amount_cents INTEGER, payment_date TEXT,
    payment_source TEXT, row_no INTEGER, source_file TEXT);
CREATE TABLE labor (
    id INTEGER PRIMARY KEY, job_no TEXT, technician TEXT, work_date TEXT,
    hours REAL, labor_cost_cents INTEGER, row_no INTEGER, source_file TEXT);
CREATE TABLE simpro_payments (
    id INTEGER PRIMARY KEY, ref TEXT, job_no TEXT, pay_date TEXT,
    amount_cents INTEGER, row_no INTEGER, source_file TEXT);
CREATE TABLE qbo_payments (
    id INTEGER PRIMARY KEY, ref TEXT, job_no TEXT, pay_date TEXT,
    amount_cents INTEGER, row_no INTEGER, source_file TEXT);
CREATE TABLE user_log (
    id INTEGER PRIMARY KEY, ts TEXT, user TEXT, action TEXT, record TEXT,
    description TEXT, old_value TEXT, new_value TEXT, job_no TEXT,
    action_norm TEXT, row_no INTEGER, source_file TEXT);
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY, ts TEXT, user TEXT, event TEXT, name TEXT,
    amount_cents INTEGER, job_no TEXT, row_no INTEGER, source_file TEXT);
"""


def build_db(datasets: dict[str, list[dict]]) -> sqlite3.Connection:
    """Create an in-memory evidence DB from loaded rows.

    Insert order is made deterministic by sorting on stable keys before
    assigning rowids, so downstream SQL is reproducible byte-for-byte.
    """
    conn = sqlite3.connect(":memory:")
    conn.executescript(DDL)

    for r in sorted(datasets.get("jobs", []), key=lambda r: (r["job_no"], r["row_no"])):
        status_norm = norm_text(r["status"])
        # Same normalization as every other table ('TESTJOB-7001' -> '7001')
        # so SQL joins on job_no line up across exports.
        job_no = extract_job_no(r["job_no"]) or r["job_no"].strip()
        conn.execute(
            "INSERT OR REPLACE INTO jobs VALUES (?,?,?,?,?,?,?,?,?)",
            (job_no, r["customer"], r["status"], status_norm,
             parse_cents(r["job_value"]), parse_cents(r.get("total_cost")),
             parse_cents(r.get("balance_remaining")), r["row_no"], r["source_file"]),
        )
    for r in sorted(datasets.get("qbo_txns", []),
                    key=lambda r: (r["job_ref"], r["date"], r["row_no"])):
        conn.execute(
            "INSERT INTO qbo_txns (job_ref, job_no, customer, txn_date, amount_cents,"
            " payment_date, payment_source, row_no, source_file)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (r["job_ref"], extract_job_no(r["job_ref"]), r["customer"],
             iso(parse_dt(r["date"])), parse_cents(r["amount"]),
             iso(parse_dt(r.get("payment_date"))), r.get("payment_source", ""),
             r["row_no"], r["source_file"]),
        )
    for r in sorted(datasets.get("labor", []),
                    key=lambda r: (r["job_no"], r["date"], r["technician"], r["row_no"])):
        try:
            hours = float(r["hours"]) if str(r["hours"]).strip() else 0.0
        except ValueError:
            hours = 0.0
        cost = parse_cents(r.get("labor_cost"))
        if cost is None:
            cost = round(hours * config.LABOR_COST_RATE_CENTS)
        conn.execute(
            "INSERT INTO labor (job_no, technician, work_date, hours,"
            " labor_cost_cents, row_no, source_file) VALUES (?,?,?,?,?,?,?)",
            (extract_job_no(r["job_no"]), r["technician"], iso(parse_dt(r["date"])),
             hours, cost, r["row_no"], r["source_file"]),
        )
    for name in ("simpro_payments", "qbo_payments"):
        for r in sorted(datasets.get(name, []),
                        key=lambda r: (r["ref"], r["date"], r["row_no"])):
            conn.execute(
                f"INSERT INTO {name} (ref, job_no, pay_date, amount_cents, row_no,"
                " source_file) VALUES (?,?,?,?,?,?)",
                (r["ref"], extract_job_no(r["ref"]), iso(parse_dt(r["date"])),
                 parse_cents(r["amount"]), r["row_no"], r["source_file"]),
            )
    for r in sorted(datasets.get("user_log", []),
                    key=lambda r: (r["ts"], r["row_no"])):
        blob = " ".join([r["action"], r.get("description", ""), r.get("record", "")])
        conn.execute(
            "INSERT INTO user_log (ts, user, action, record, description,"
            " old_value, new_value, job_no, action_norm, row_no, source_file)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (iso(parse_dt(r["ts"])), r["user"], r["action"], r.get("record", ""),
             r.get("description", ""), r.get("old_value", ""), r.get("new_value", ""),
             extract_job_no(r.get("record") or r.get("description")),
             norm_text(blob), r["row_no"], r["source_file"]),
        )
    for r in sorted(datasets.get("audit_log", []),
                    key=lambda r: (r["ts"], r["row_no"])):
        conn.execute(
            "INSERT INTO audit_log (ts, user, event, name, amount_cents, job_no,"
            " row_no, source_file) VALUES (?,?,?,?,?,?,?,?)",
            (iso(parse_dt(r["ts"])), r["user"], r["event"], r.get("name", ""),
             parse_cents(r.get("amount")),
             extract_job_no(r.get("name") or r.get("event")),
             r["row_no"], r["source_file"]),
        )
    conn.commit()
    return conn
