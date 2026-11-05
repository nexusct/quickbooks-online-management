# NFE — simPRO ↔ QuickBooks Online forensic reconciliation

Read-only, deterministic reconciliation between simPRO exports and
QuickBooks Online exports for Nexus Communications Technology. Emits an
exception register (`anomalies.xlsx`), per-job reconstructions for
deleted/voided/stripped jobs, and a user-activity profile.

**Every output row is an exception requiring investigation, never a
finding of wrongdoing.** See `CLAUDE.md` for the module map,
non-negotiables, and known gotchas — read it first.

## Quick start

```bash
cd forensics
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
git config core.hooksPath forensics/.githooks     # install the data-leak pre-commit hook
python -m tests.make_fixture            # gate: all 7 checks must pass
```

Then follow the Workflow section of `CLAUDE.md` once the six real exports
are available. Real data lives only in `exports/`, `snapshots/`,
`evidence.db`, `anomalies*.xlsx`, `reconstructions/` — all gitignored and
blocked by the pre-commit hook.
