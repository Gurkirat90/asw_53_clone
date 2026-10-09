"""Performance sanity check (PRD 3.4 engineering targets, not SLAs).

Seeds a scratch SQLite DB with 100 zones and 1,000 records through the real services, starts
uvicorn on it, and times 20 sequential requests per list endpoint, printing p50/p95.
Run from backend/:  .venv/bin/python -m scripts.perf_check
Never touches backend/data/.
"""

from __future__ import annotations

import os
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ZONES = 100
RECORDS = 1000
BIG_ZONE_RECORDS = 500  # one zone carries half of the records to stress the records page
REQUESTS = 20
PORT = int(os.environ.get("PERF_PORT", "8003"))
PASSWORD = "perf-check-password"


def seed(database_url: str) -> str:
    from alembic import command

    from app.core.security import hash_password
    from app.db.migrations import alembic_config
    from app.db.session import build_engine, build_session_factory
    from app.models import User
    from app.schemas.hosted_zones import ZoneCreate
    from app.schemas.records import RecordCreate
    from app.services import hosted_zone_service, record_service

    command.upgrade(alembic_config(database_url), "head")
    engine = build_engine(database_url)
    with build_session_factory(engine)() as db:
        user = User(
            email="demo@example.test", display_name="Perf", password_hash=hash_password(PASSWORD)
        )
        db.add(user)
        db.commit()
        big_zone_id = ""
        other = (RECORDS - BIG_ZONE_RECORDS) // (ZONES - 1)
        made = 0
        for z in range(ZONES):
            zone = hosted_zone_service.create_zone(
                db, user, ZoneCreate(name=f"perf-{z:03d}.example.com", comment=f"Perf zone {z}")
            )
            count = BIG_ZONE_RECORDS if z == 0 else other
            if z == ZONES - 1:
                count = RECORDS - made
            for r in range(count):
                record_service.create_record(
                    db,
                    zone,
                    RecordCreate(
                        name=f"host-{r:04d}",
                        record_type="A" if r % 3 else "TXT",
                        values=[{"value": f"192.0.2.{r % 250 + 1}"}]
                        if r % 3
                        else [{"value": f"perf text {r}"}],
                    ),
                )
            made += count
            if z == 0:
                big_zone_id = zone.zone_id
        print(f"seeded {ZONES} zones and {made} user records (+{2 * ZONES} system records)")
    engine.dispose()
    return big_zone_id


def timed(client, url: str) -> list[float]:
    samples = []
    for _ in range(REQUESTS):
        start = time.perf_counter()
        response = client.get(url)
        samples.append((time.perf_counter() - start) * 1000)
        response.raise_for_status()
    return samples


def p95(samples: list[float]) -> float:
    ordered = sorted(samples)
    return ordered[max(0, int(round(0.95 * len(ordered))) - 1)]


def main() -> int:
    import httpx

    tmp = Path(tempfile.mkdtemp(prefix="fiftythree-perf-"))
    database_url = f"sqlite:///{tmp / 'perf.db'}"
    os.environ.update({"APP_ENV": "test", "DATABASE_URL": database_url, "LOG_LEVEL": "WARNING"})
    big_zone = seed(database_url)

    server = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(PORT),
            "--log-level",
            "warning",
        ],
        env={**os.environ},
    )
    try:
        base = f"http://127.0.0.1:{PORT}"
        for _ in range(50):
            try:
                if httpx.get(f"{base}/healthz").status_code == 200:
                    break
            except httpx.HTTPError:
                time.sleep(0.2)
        with httpx.Client(base_url=base) as client:
            client.post(
                "/api/v1/auth/login", json={"email": "demo@example.test", "password": PASSWORD}
            ).raise_for_status()
            records = f"/api/v1/hosted-zones/{big_zone}/records"
            cases = {
                "zones page (page_size=20)": "/api/v1/hosted-zones?page_size=20",
                "zones search q=perf-09": "/api/v1/hosted-zones?q=perf-09&page_size=100",
                "records page, 502-record zone": f"{records}?page_size=20",
                "records q=192.0.2.1 + A": f"{records}?q=192.0.2.1&record_type=A&page_size=100",
                "records sort ttl desc, page 10": (
                    f"{records}?sort_by=ttl_seconds&sort_order=desc&page=10&page_size=20"
                ),
            }
            header = f"{'endpoint':38s} {'p50 ms':>8s} {'p95 ms':>8s} {'max ms':>8s}"
            print(f"\n{header}  ({REQUESTS} sequential requests)")
            worst = 0.0
            for label, url in cases.items():
                samples = timed(client, url)
                worst = max(worst, p95(samples))
                median = statistics.median(samples)
                print(f"{label:38s} {median:8.1f} {p95(samples):8.1f} {max(samples):8.1f}")
            print(f"\nworst p95: {worst:.1f} ms (target: < 500 ms)")
            return 0 if worst < 500 else 1
    finally:
        server.terminate()
        server.wait()
        for path in tmp.iterdir():
            path.unlink()
        tmp.rmdir()


if __name__ == "__main__":
    sys.exit(main())
