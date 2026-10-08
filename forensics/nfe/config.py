"""Central constants. Nothing here may vary between runs on one snapshot."""

from datetime import datetime

# Real-world fully-loaded labor cost used for exposure math (per Jim).
LABOR_COST_RATE_CENTS = 104_00  # $104.00 / hour

# Fixed workbook metadata so two runs on one snapshot are byte-identical.
FIXED_DOC_TIMESTAMP = datetime(2000, 1, 1, 0, 0, 0)

# Variance below this many cents is logged but ranked last (rounding noise).
MATERIALITY_CENTS = 100  # $1.00

# Hours in a user-log timestamp outside [WORKDAY_START, WORKDAY_END) count
# as after-hours for the activity profile. Evening work is normal in this
# trade — after-hours concentration is a LEAD, never a conclusion.
WORKDAY_START = 7   # 07:00
WORKDAY_END = 19    # 19:00

# Job statuses treated as "completed" (should have invoices) and as
# "voided". Matching is case-insensitive on normalized status text.
COMPLETED_STATUSES = {"complete", "completed", "closed", "invoiced", "paid", "archived"}
VOIDED_STATUSES = {"void", "voided", "cancelled", "canceled"}

# User-log action keywords that count as destructive. Kept deliberately
# narrow; matching is substring on the normalized action+description.
DESTRUCTIVE_KEYWORDS = (
    "delete", "deleted", "void", "voided", "remove", "removed",
    "zero", "zeroed", "archive forced", "reversed", "reversal",
)

# Keywords that identify invoice-related user-log events.
INVOICE_KEYWORDS = ("invoice",)
LABOR_KEYWORDS = ("labor", "labour", "timesheet", "time sheet", "schedule", "technician")

# Exposure buckets (per AR-diversion methodology). The tool NEVER emits
# "known loss" — that label requires human review of corroborated items.
BUCKET_PROBABLE = "probable_exposure"      # >= 2 independent sources
BUCKET_UNRESOLVED = "unresolved_exposure"  # single source
