# NFE — simPRO ↔ QuickBooks Online forensic reconciliation

Forensic reconciliation toolchain for Nexus Communications Technology
(NexusCT). Two systems of record: **simPRO** (field service, jobs, labor,
invoicing) and **QuickBooks Online** (accounting). The toolchain compares
exports from both and emits an exception register. Read this file before
touching anything.

## Non-negotiables

1. **Read-only against source systems.** Nothing in this repo may write to
   simPRO or QBO. If running Intuit's MCP server, set
   `QUICKBOOKS_DISABLE_WRITE=true`, `QUICKBOOKS_DISABLE_UPDATE=true`,
   `QUICKBOOKS_DISABLE_DELETE=true`. Never call a QBO/simPRO
   create/update/delete tool from this repo's workflows.
2. **No fabricated data, ever.** Test fixtures use `CUSTOMER_01`,
   `TECH_01`, `USER_A@example.invalid`, `TESTJOB-####`. Never invent a
   plausible person or company name — a fabricated name that looks real
   can be mistaken for a finding about a real employee.
3. **Everything is an exception requiring investigation, never a finding
   of wrongdoing.** Legitimate explanations exist for every rule
   (duplicate-job cleanup, re-quotes, sync failure, timing lag, honest
   error, shared logins). Preserve the "What this does NOT establish"
   section in every reconstruction and the README sheet in every report.
4. **Two-source corroboration** before anything is exported as evidence.
   Tool-assigned confidence caps at `medium`; `high` requires a human to
   test normal explanations. `probable_exposure` requires ≥2 independent
   sources; single-source items stay `unresolved_exposure`.
5. **Determinism.** Matching is SQL over SQLite, never inference. Two runs
   on one snapshot must be byte-identical (fixed workbook metadata +
   normalized zip timestamps — see `nfe/util.py:normalize_zip_in_place`).
6. **Snapshots are immutable.** Never overwrite one. `nfe/snapshot.py`
   refuses overwrites and flags same-label/different-hash registrations as
   mutations — the only thing that catches a record altered after we looked.
7. **Never commit** `.env`, `snapshots/`, `evidence.db` (any `*.db`),
   `dim_customer_alias.csv`, `exports/`, `anomalies*.xlsx`, or
   `reconstructions/`. Enforced by `.githooks/pre-commit`
   (`git config core.hooksPath forensics/.githooks`) and `.gitignore`.

## Module map

| Module | Purpose |
|---|---|
| `nfe/config.py` | Constants: $104/h labor cost, status sets, destructive keywords, buckets |
| `nfe/util.py` | Money→cents, timestamp parsing, job-no extraction, sha256, deterministic zip |
| `nfe/snapshot.py` | Immutable snapshot registry + mutation detection (`register`, `mutations`, `verify`) |
| `nfe/ingest.py` | CSV exports → SQLite with strict header specs (`SPECS`); hard error on missing columns |
| `nfe/rules.py` | Rules R01–R13 → exception register; population-completeness guard |
| `nfe/report_xlsx.py` | CLI: builds `anomalies.xlsx` (Exceptions, Jobs_vs_Invoices, Labor, Payments, Exposure_Summary) |
| `nfe/deleted_jobs.py` | CLI: per-job reconstruction (event chain, old→new, actor, timestamp) from user+audit logs |
| `nfe/user_activity.py` | `user_activity_profile()` — destructive-action concentration, **lead not conclusion** |
| `scripts/recalc.py` | Independent re-derivation of every computed figure in the workbook; must print `0 errors` |
| `tests/make_fixture.py` | Synthetic fixture + 7 gate checks; must pass before touching real data |

## Rules (exception register)

R01 completed job, no QBO invoice · R02 invoiced ≠ job value (variance
listed) · R03 job value reduced from initial entry (`REDUCED_FROM_INITIAL`)
· R04 invoice existed in simPRO, never in QBO
(`SIMPRO_INVOICE_UNPUSHED_OR_DELETED`) · R05 labor applied then
voided/zeroed/removed · R06 labor cost (at $104/h) exceeds invoiced revenue
· R07/R08 payment in one system only · R09 payment totals differ · R10
payment received with NO QBO invoice at all (strongest diversion
signature) · R11 job-number sequence gap · R12 job in user log but not in
job list (`DELETED_JOB`) · R13 snapshot mutation.

## Workflow

```bash
cd forensics
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
git config core.hooksPath forensics/.githooks
python -m tests.make_fixture          # 7/7 must pass before real data

# register every export as an immutable snapshot FIRST
python - <<'EOF'
from nfe import snapshot
snapshot.register("exports/jobs.csv", "simpro_jobs")
# ... one per export
EOF

python -m nfe.report_xlsx exports/jobs.csv exports/qbo_txns.csv \
  --labor exports/labor.csv --simpro-payments exports/sp_pay.csv \
  --qbo-payments exports/qb_pay.csv --user-log exports/user_log.csv \
  --audit-log exports/audit_log.csv --snapshots snapshots -o anomalies.xlsx
python scripts/recalc.py anomalies.xlsx          # must be 0 errors

python -m nfe.deleted_jobs --user-log exports/user_log.csv \
  --audit-log exports/audit_log.csv --labor exports/labor.csv \
  --auto exports/jobs.csv -o reconstructions/
python -m nfe.user_activity --user-log exports/user_log.csv
```

## Required exports

| # | Export | Must contain |
|---|---|---|
| 1 | QuickBooks Audit Log (Settings → Audit Log, filter Deleted + Changed) | Date, User, Event, Name, Amount |
| 2 | simPRO user log — widest range available, back to 2023-01-01 | Date/time, user, action, record, description, old value, new value |
| 3 | Full simPRO job list — **including closed, archived, voided, paid** | Job no, customer, status, job value, total cost, balance remaining |
| 4 | simPRO labor/timesheets | Job no, technician, date, hours (cost computed at $104/h) |
| 5 | simPRO payments + QBO payments | Invoice/job ref, date, amount |
| 6 | QBO transactions (all invoices) | Num (job ref), customer, date, amount, payment date, payment source |

Exports 1 and 2 are the highest value: both survive a job's deletion and
both carry a user and timestamp.

## Known gotchas

- **Export 3 must be the complete population.** `rules.check_population`
  raises if the job list has no closed/archived jobs — against a filtered
  list every ordinary closed job reads as a deletion.
- Job numbers are normalized to their digits everywhere
  (`TESTJOB-7001` → `7001`, `Job #7001` → `7001`) so joins line up; a QBO
  `Num` that isn't the simPRO job number will not match — maintain
  `dim_customer_alias.csv` locally (gitignored) for manual mappings.
- A missing job number in the sequence is worth more investigation than a
  modified invoice whose payment reconciled in both systems (R11/R12
  rank accordingly via severity).
- openpyxl embeds timestamps in xlsx zip entries; `normalize_zip_in_place`
  rewrites them — do not remove it or determinism breaks.
- Header matching is by normalized name with explicit aliases
  (`nfe/ingest.py:SPECS`) — add aliases there when a new export spelling
  appears; never match by column position.
- simPRO can invoice from QBO side manually: an invoice sent from QBO to a
  customer, paid by check, then the simPRO job deleted before export,
  leaves traces ONLY in the simPRO user log (and the QBO audit log if the
  QBO record was also removed). That is exactly what R04/R10/R12 look for.
