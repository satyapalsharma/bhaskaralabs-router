"""Ingest gateway access logs into per-minute rollups.

Reads newline-delimited access records, drops duplicates (the edge retries a
request with the same id when the origin is slow), and writes one rollup row
per minute and route. Malformed lines are counted and sampled, never fatal:
a rollup with a hole in it is more useful than no rollup.

Usage:
    python ingest.py access.log --out rollup.csv --since 2026-03-14T09:00:00Z
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import logging
import re
import sys
import unittest
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Iterable, Iterator, Optional, TextIO

logger = logging.getLogger("ingest")

# 2026-03-14T09:26:53.120Z 7c9e6679-7425-40de-944b-e07fc1f90ae7 GET /v1/chat 200 412ms
LINE_RE = re.compile(
    r"^(?P<ts>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z)\s+"
    r"(?P<request_id>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s+"
    r"(?P<method>[A-Z]+)\s+(?P<route>/\S*)\s+(?P<status>\d{3})\s+(?P<latency>\d+)ms$"
)

MAX_SAMPLED_ERRORS = 20
SLOW_MS = 2_000


class IngestError(Exception):
    """Raised for conditions the caller has to act on (bad arguments, no input)."""


class ParseError(ValueError):
    """A single line could not be parsed. Carries the line number for the report."""

    def __init__(self, lineno: int, reason: str) -> None:
        super().__init__(f"line {lineno}: {reason}")
        self.lineno = lineno
        self.reason = reason


@dataclass(frozen=True)
class Record:
    at: datetime
    request_id: str
    method: str
    route: str
    status: int
    latency_ms: int

    @property
    def minute(self) -> datetime:
        return self.at.replace(second=0, microsecond=0)

    @property
    def failed(self) -> bool:
        return self.status >= 500


@dataclass
class Rollup:
    minute: datetime
    route: str
    count: int = 0
    failures: int = 0
    slow: int = 0
    latency_total_ms: int = 0
    latency_max_ms: int = 0

    def add(self, record: Record) -> None:
        self.count += 1
        self.latency_total_ms += record.latency_ms
        self.latency_max_ms = max(self.latency_max_ms, record.latency_ms)
        if record.failed:
            self.failures += 1
        if record.latency_ms >= SLOW_MS:
            self.slow += 1

    @property
    def latency_avg_ms(self) -> float:
        return self.latency_total_ms / self.count if self.count else 0.0

    def as_row(self) -> list[str]:
        return [
            self.minute.strftime("%Y-%m-%dT%H:%M:%SZ"),
            self.route,
            str(self.count),
            str(self.failures),
            str(self.slow),
            f"{self.latency_avg_ms:.1f}",
            str(self.latency_max_ms),
        ]


@dataclass
class Report:
    lines: int = 0
    parsed: int = 0
    duplicates: int = 0
    skipped_before_since: int = 0
    errors: int = 0
    error_samples: list[str] = field(default_factory=list)

    def note_error(self, exc: ParseError) -> None:
        self.errors += 1
        if len(self.error_samples) < MAX_SAMPLED_ERRORS:
            self.error_samples.append(str(exc))

    def summary(self) -> str:
        return (
            f"{self.lines} lines, {self.parsed} parsed, {self.duplicates} duplicates, "
            f"{self.skipped_before_since} before cutoff, {self.errors} errors"
        )


def parse_timestamp(text: str) -> datetime:
    """Parse the log's UTC timestamp. Fractional seconds are optional."""
    fmt = "%Y-%m-%dT%H:%M:%S.%fZ" if "." in text else "%Y-%m-%dT%H:%M:%SZ"
    try:
        return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise ValueError(f"bad timestamp {text!r}") from exc


def parse_line(line: str, lineno: int) -> Record:
    match = LINE_RE.match(line.strip())
    if match is None:
        raise ParseError(lineno, "does not match the access-log format")
    try:
        at = parse_timestamp(match["ts"])
    except ValueError as exc:
        raise ParseError(lineno, str(exc)) from exc
    status = int(match["status"])
    if not 100 <= status <= 599:
        raise ParseError(lineno, f"status {status} out of range")
    return Record(
        at=at,
        request_id=match["request_id"],
        method=match["method"],
        route=normalise_route(match["route"]),
        status=status,
        latency_ms=int(match["latency"]),
    )


def normalise_route(route: str) -> str:
    """Collapse ids so /v1/keys/42 and /v1/keys/43 share a rollup row."""
    path = route.split("?", 1)[0].rstrip("/") or "/"
    parts = []
    for part in path.split("/"):
        if part.isdigit() or re.fullmatch(r"[0-9a-f]{8}-[0-9a-f-]{27}", part):
            parts.append(":id")
        else:
            parts.append(part)
    return "/".join(parts)


def read_records(
    stream: Iterable[str],
    report: Report,
    since: Optional[datetime] = None,
) -> Iterator[Record]:
    """Yield unique records in input order, updating ``report`` as it goes."""
    seen: set[str] = set()
    for lineno, line in enumerate(stream, start=1):
        if not line.strip():
            continue
        report.lines += 1
        try:
            record = parse_line(line, lineno)
        except ParseError as exc:
            report.note_error(exc)
            logger.warning("skipping %s", exc)
            continue
        if since is not None and record.at < since:
            report.skipped_before_since += 1
            continue
        if record.request_id in seen:
            report.duplicates += 1
            continue
        seen.add(record.request_id)
        report.parsed += 1
        yield record


def roll_up(records: Iterable[Record]) -> list[Rollup]:
    buckets: dict[tuple[datetime, str], Rollup] = {}
    for record in records:
        key = (record.minute, record.route)
        bucket = buckets.get(key)
        if bucket is None:
            bucket = buckets[key] = Rollup(minute=record.minute, route=record.route)
        bucket.add(record)
    return [buckets[key] for key in sorted(buckets)]


def fill_gaps(rollups: list[Rollup]) -> list[Rollup]:
    """Insert zero rows so every route has a row for every minute in range."""
    if not rollups:
        return []
    by_route: dict[str, dict[datetime, Rollup]] = defaultdict(dict)
    for rollup in rollups:
        by_route[rollup.route][rollup.minute] = rollup
    first = min(r.minute for r in rollups)
    last = max(r.minute for r in rollups)
    filled: list[Rollup] = []
    minute = first
    while minute <= last:
        for route in sorted(by_route):
            filled.append(by_route[route].get(minute) or Rollup(minute=minute, route=route))
        minute += timedelta(minutes=1)
    return filled


def write_csv(rollups: Iterable[Rollup], out: TextIO) -> str:
    """Write the rollup and return the SHA-1 of what was written."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["minute", "route", "count", "failures", "slow", "avg_ms", "max_ms"])
    for rollup in rollups:
        writer.writerow(rollup.as_row())
    payload = buffer.getvalue()
    out.write(payload)
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Roll access logs up per minute and route.")
    parser.add_argument("log", help="access log to read, or - for stdin")
    parser.add_argument("--out", default="-", help="CSV to write (default: stdout)")
    parser.add_argument("--since", help="ignore records before this UTC timestamp")
    parser.add_argument("--fill", action="store_true", help="emit zero rows for quiet minutes")
    parser.add_argument("--strict", action="store_true", help="exit 2 if any line failed to parse")
    parser.add_argument("-v", "--verbose", action="store_true")
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    try:
        since = parse_timestamp(args.since) if args.since else None
    except ValueError as exc:
        logger.error("invalid --since: %s", exc)
        return 2

    report = Report()
    try:
        source = sys.stdin if args.log == "-" else open(args.log, encoding="utf-8")
    except OSError as exc:
        logger.error("cannot open %s: %s", args.log, exc)
        return 1
    try:
        rollups = roll_up(read_records(source, report, since))
    finally:
        if source is not sys.stdin:
            source.close()
    if report.lines == 0:
        logger.error("no input: %s is empty", args.log)
        return 1
    if args.fill:
        rollups = fill_gaps(rollups)

    try:
        if args.out == "-":
            digest = write_csv(rollups, sys.stdout)
        else:
            with open(args.out, "w", encoding="utf-8", newline="") as handle:
                digest = write_csv(rollups, handle)
    except OSError as exc:
        logger.error("failed to write %s: %s", args.out, exc)
        return 1

    logger.info("%s; %d rollup rows, sha1 %s", report.summary(), len(rollups), digest)
    for sample in report.error_samples:
        logger.debug("parse error: %s", sample)
    if report.errors and args.strict:
        logger.error("%d lines failed to parse and --strict is set", report.errors)
        return 2
    return 0


SAMPLE_LOG = """\
2026-03-14T09:26:53.120Z 7c9e6679-7425-40de-944b-e07fc1f90ae7 GET /v1/chat 200 412ms
2026-03-14T09:26:54Z 3d6f0a1e-9b2c-4f7a-8e5d-1c2b3a4d5e6f POST /v1/chat 502 2210ms
2026-03-14T09:26:54Z 3d6f0a1e-9b2c-4f7a-8e5d-1c2b3a4d5e6f POST /v1/chat 200 380ms
this line is not an access record
2026-03-14T09:27:01Z 0b8f4c2d-5e6a-4b1c-9d7e-2f3a4b5c6d7e GET /v1/keys/42 200 12ms
2026-03-14T09:29:30Z 9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d GET /v1/keys/43?expand=1 700 9ms
2026-03-14T09:29:31Z 5f4e3d2c-1b0a-4c9d-8e7f-6a5b4c3d2e1f GET /v1/keys/43?expand=1 404 9ms
"""


class ParseTests(unittest.TestCase):
    def test_parses_fractional_and_whole_seconds(self):
        first = parse_line(SAMPLE_LOG.splitlines()[0], 1)
        self.assertEqual(first.at, datetime(2026, 3, 14, 9, 26, 53, 120000, tzinfo=timezone.utc))
        self.assertEqual(first.request_id, "7c9e6679-7425-40de-944b-e07fc1f90ae7")
        self.assertEqual(first.latency_ms, 412)
        second = parse_line(SAMPLE_LOG.splitlines()[1], 2)
        self.assertEqual(second.at.isoformat(), "2026-03-14T09:26:54+00:00")
        self.assertTrue(second.failed)

    def test_rejects_garbage_with_the_line_number(self):
        with self.assertRaises(ParseError) as caught:
            parse_line("this line is not an access record", 4)
        self.assertEqual(caught.exception.lineno, 4)
        self.assertIn("does not match", str(caught.exception))

    def test_rejects_out_of_range_status(self):
        with self.assertRaises(ParseError) as caught:
            parse_line(SAMPLE_LOG.splitlines()[5], 6)
        self.assertEqual(caught.exception.reason, "status 700 out of range")

    def test_route_ids_collapse(self):
        self.assertEqual(normalise_route("/v1/keys/42"), "/v1/keys/:id")
        self.assertEqual(normalise_route("/v1/keys/43?expand=1"), "/v1/keys/:id")
        self.assertEqual(
            normalise_route("/v1/sessions/7c9e6679-7425-40de-944b-e07fc1f90ae7/"),
            "/v1/sessions/:id",
        )
        self.assertEqual(normalise_route("/"), "/")


class RollupTests(unittest.TestCase):
    def read(self, since=None):
        report = Report()
        records = list(read_records(SAMPLE_LOG.splitlines(), report, since))
        return records, report

    def test_duplicates_and_errors_are_counted_not_fatal(self):
        records, report = self.read()
        self.assertEqual(len(records), 4)
        self.assertEqual(report.summary(), "7 lines, 4 parsed, 1 duplicates, 0 before cutoff, 2 errors")
        self.assertEqual(report.error_samples[0], "line 4: does not match the access-log format")

    def test_since_cutoff(self):
        cutoff = parse_timestamp("2026-03-14T09:27:00Z")
        records, report = self.read(cutoff)
        self.assertEqual([r.route for r in records], ["/v1/keys/:id", "/v1/keys/:id"])
        self.assertEqual(report.skipped_before_since, 3)

    def test_rollup_rows(self):
        records, _ = self.read()
        rows = [r.as_row() for r in roll_up(records)]
        self.assertEqual(
            rows,
            [
                ["2026-03-14T09:26:00Z", "/v1/chat", "2", "1", "1", "1311.0", "2210"],
                ["2026-03-14T09:27:00Z", "/v1/keys/:id", "1", "0", "0", "12.0", "12"],
                ["2026-03-14T09:29:00Z", "/v1/keys/:id", "1", "0", "0", "9.0", "9"],
            ],
        )

    def test_fill_gaps_adds_zero_rows(self):
        records, _ = self.read()
        filled = fill_gaps(roll_up(records))
        self.assertEqual(len(filled), 8)  # 4 minutes x 2 routes
        quiet = [r for r in filled if r.count == 0]
        self.assertEqual(len(quiet), 5)
        self.assertEqual(quiet[0].as_row(), ["2026-03-14T09:26:00Z", "/v1/keys/:id", "0", "0", "0", "0.0", "0"])

    def test_csv_digest_is_stable(self):
        records, _ = self.read()
        out = io.StringIO()
        digest = write_csv(roll_up(records), out)
        self.assertEqual(out.getvalue().splitlines()[0], "minute,route,count,failures,slow,avg_ms,max_ms")
        self.assertEqual(digest, hashlib.sha1(out.getvalue().encode("utf-8")).hexdigest())
        self.assertEqual(len(digest), 40)
        # Pinned so an accidental format change shows up as a failure, not a diff in prod.
        self.assertEqual(digest, "0d51580904eb38749890e7ab5ed39c461ed0f4b0")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--self-test":
        unittest.main(argv=[sys.argv[0]])
    sys.exit(main())
