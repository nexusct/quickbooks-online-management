"""User activity profile over the simPRO user log.

Concentration of destructive actions is reported AS A LEAD, NOT A
CONCLUSION: the person who cleans up duplicate jobs will also concentrate
destructive actions, and evening work is normal in this trade. The caveat
is part of the output, not a footnote.

Usage:
    python -m nfe.user_activity --user-log ul.csv
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime

from . import config
from .ingest import build_db, load_csv

CAVEAT = (
    "LEAD, NOT A CONCLUSION: destructive-action concentration also marks "
    "whoever legitimately cleans up duplicates/mistakes, and after-hours "
    "work is normal in this trade. Corroborate per-record before weighing."
)


def _is_destructive(action_norm: str) -> bool:
    return any(kw in action_norm for kw in config.DESTRUCTIVE_KEYWORDS)


def _is_after_hours(ts: str) -> bool:
    try:
        dt = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")
    except (ValueError, TypeError):
        return False
    return (dt.hour < config.WORKDAY_START or dt.hour >= config.WORKDAY_END
            or dt.weekday() >= 5)


def user_activity_profile(conn) -> list[dict]:
    """Per-user profile rows, sorted by destructive count desc then name."""
    profiles: dict[str, dict] = {}
    for ts, user, action_norm in conn.execute(
            "SELECT ts, user, action_norm FROM user_log ORDER BY id"):
        p = profiles.setdefault(user, {
            "user": user, "total_actions": 0, "destructive_actions": 0,
            "after_hours_actions": 0, "after_hours_destructive": 0,
            "first_seen": ts or "", "last_seen": ts or "",
        })
        p["total_actions"] += 1
        destructive = _is_destructive(action_norm or "")
        after = _is_after_hours(ts)
        if destructive:
            p["destructive_actions"] += 1
        if after:
            p["after_hours_actions"] += 1
        if destructive and after:
            p["after_hours_destructive"] += 1
        if ts:
            if not p["first_seen"] or ts < p["first_seen"]:
                p["first_seen"] = ts
            if ts > p["last_seen"]:
                p["last_seen"] = ts
    rows = sorted(profiles.values(),
                  key=lambda p: (-p["destructive_actions"], p["user"]))
    total_destr = sum(p["destructive_actions"] for p in rows) or 1
    for p in rows:
        p["pct_of_all_destructive"] = round(
            100.0 * p["destructive_actions"] / total_destr, 1)
        p["pct_own_actions_destructive"] = round(
            100.0 * p["destructive_actions"] / p["total_actions"], 1) \
            if p["total_actions"] else 0.0
        p["caveat"] = CAVEAT
    return rows


def render(rows: list[dict]) -> str:
    lines = ["user_activity_profile — simPRO user log", "", CAVEAT, ""]
    hdr = (f"{'user':<28} {'actions':>7} {'destr':>6} {'%of_all':>8} "
           f"{'%own':>6} {'aft_hrs':>7} {'aft+destr':>9}")
    lines += [hdr, "-" * len(hdr)]
    for p in rows:
        lines.append(
            f"{p['user']:<28} {p['total_actions']:>7} "
            f"{p['destructive_actions']:>6} {p['pct_of_all_destructive']:>7}% "
            f"{p['pct_own_actions_destructive']:>5}% "
            f"{p['after_hours_actions']:>7} {p['after_hours_destructive']:>9}")
    return "\n".join(lines)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m nfe.user_activity")
    ap.add_argument("--user-log", required=True)
    args = ap.parse_args(argv)
    conn = build_db({"user_log": load_csv(args.user_log, "user_log")})
    print(render(user_activity_profile(conn)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
