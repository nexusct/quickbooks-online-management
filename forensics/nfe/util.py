"""Parsing and determinism helpers. Stdlib only."""

from __future__ import annotations

import hashlib
import os
import re
import zipfile
from datetime import datetime

_MONEY_RE = re.compile(r"[^0-9.\-]")


def norm_header(h: str) -> str:
    """Normalize a CSV header: lowercase, alnum -> underscore, collapsed."""
    h = (h or "").strip().lower()
    h = re.sub(r"[^a-z0-9]+", "_", h)
    return h.strip("_")


def norm_text(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def parse_cents(raw) -> int | None:
    """Parse '$1,234.50', '(500.00)', '1234.5' -> integer cents. None if blank."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    neg = s.startswith("(") and s.endswith(")")
    s = _MONEY_RE.sub("", s)
    if s in ("", "-", "."):
        return None
    try:
        value = round(float(s) * 100)
    except ValueError:
        return None
    if neg and value > 0:
        value = -value
    return int(value)


def fmt_cents(cents: int | None) -> str:
    if cents is None:
        return ""
    sign = "-" if cents < 0 else ""
    cents = abs(cents)
    return f"{sign}${cents // 100:,}.{cents % 100:02d}"


_DATE_FORMATS = (
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d",
    "%m/%d/%Y %I:%M:%S %p", "%m/%d/%Y %I:%M %p", "%m/%d/%Y %H:%M:%S",
    "%m/%d/%Y %H:%M", "%m/%d/%Y", "%d/%m/%Y %H:%M", "%d/%m/%Y",
    "%b %d, %Y %I:%M %p", "%b %d, %Y",
)


def parse_dt(raw) -> datetime | None:
    """Parse the timestamp formats simPRO/QBO exports actually emit."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def iso(dt: datetime | None) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S") if dt else ""


_JOBNO_RE = re.compile(r"(\d{2,})")


def extract_job_no(raw) -> str | None:
    """Pull a job number out of 'Job #1234', 'TESTJOB-1234', '1234', etc."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    m = _JOBNO_RE.search(s)
    return m.group(1) if m else None


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


_CORE_TS_RE = re.compile(
    rb"(<dcterms:(?:created|modified)[^>]*>)[^<]*(</dcterms:)")


def normalize_zip_in_place(path: str) -> None:
    """Rewrite a zip (xlsx) with fixed entry timestamps/permissions so the
    file is byte-identical across runs. Entry order is preserved. openpyxl
    stamps docProps/core.xml with save time regardless of workbook
    properties, so those timestamps are pinned here too."""
    tmp = path + ".nfe_tmp"
    with zipfile.ZipFile(path, "r") as zin, \
            zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for name in zin.namelist():
            data = zin.read(name)
            if name == "docProps/core.xml":
                data = _CORE_TS_RE.sub(rb"\g<1>2000-01-01T00:00:00Z\g<2>", data)
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o600 << 16
            info.create_system = 0
            zout.writestr(info, data)
    os.replace(tmp, path)
