"""NFE — Nexus Forensic Engine.

Read-only forensic reconciliation between simPRO (field service) and
QuickBooks Online (accounting) for Nexus Communications Technology.

Hard rules (see CLAUDE.md):
- Never writes to simPRO or QBO. Input is exports/snapshots only.
- Deterministic: matching is SQL over SQLite; two runs on one snapshot
  are byte-identical.
- Every output row is an EXCEPTION REQUIRING INVESTIGATION, never a
  finding of wrongdoing.
"""

__version__ = "0.1.0"
