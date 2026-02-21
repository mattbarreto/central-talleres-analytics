"""
Phase 2 smoke + perf check.

Usage:
  python scripts/phase2_smoke.py --base-url http://127.0.0.1:8000 --email admin@example.com --password admin123
"""

from __future__ import annotations

import argparse
import json
import statistics
import threading
import time
import urllib.error
import urllib.request
from typing import Any


def request_json(
    base_url: str,
    method: str,
    path: str,
    token: str | None = None,
    body: dict[str, Any] | None = None,
    timeout: int = 45,
):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(f"{base_url}{path}", data=data, method=method, headers=headers)
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            ms = (time.perf_counter() - t0) * 1000
            ctype = resp.headers.get("Content-Type", "")
            parsed = json.loads(raw.decode("utf-8")) if "application/json" in ctype and raw else None
            return resp.status, parsed, raw, ms
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {exc.code} for {path}: {detail}") from exc


def percentile_95(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = max(0, min(len(ordered) - 1, int(round(0.95 * len(ordered))) - 1))
    return ordered[idx]


def main():
    parser = argparse.ArgumentParser(description="Phase 2 smoke/perf validation")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--email", default="admin@example.com")
    parser.add_argument("--password", default="admin123")
    parser.add_argument("--overview-runs", type=int, default=20)
    parser.add_argument("--concurrency-workers", type=int, default=3)
    parser.add_argument("--concurrency-iterations", type=int, default=10)
    args = parser.parse_args()

    report: dict[str, Any] = {"base_url": args.base_url}

    health_ms = None
    last_exc = None
    for _ in range(25):
        try:
            _, _, _, health_ms = request_json(args.base_url, "GET", "/health")
            break
        except Exception as exc:  # pragma: no cover - startup race handling
            last_exc = exc
            time.sleep(0.4)
    if health_ms is None:
        raise RuntimeError(f"No se pudo conectar al servidor {args.base_url}") from last_exc
    report["health_ms"] = round(health_ms, 2)

    _, login_data, _, login_ms = request_json(
        args.base_url,
        "POST",
        "/api/v1/auth/login",
        body={"email": args.email, "password": args.password},
    )
    token = login_data["access_token"]
    report["login_ms"] = round(login_ms, 2)

    overview_samples = []
    for _ in range(args.overview_runs):
        _, _, _, ms = request_json(args.base_url, "GET", "/api/v1/insights/overview?period=monthly", token=token)
        overview_samples.append(ms)
    report["insights_overview_avg_ms"] = round(statistics.mean(overview_samples), 2)
    report["insights_overview_p95_ms"] = round(percentile_95(overview_samples), 2)

    _, _, raw, sync_pdf_ms = request_json(args.base_url, "GET", "/api/v1/insights/report.pdf?period=monthly", token=token)
    report["insights_pdf_sync_ms"] = round(sync_pdf_ms, 2)
    report["insights_pdf_sync_bytes"] = len(raw)

    # Async insights job
    _, created, _, create_ms = request_json(
        args.base_url,
        "POST",
        "/api/v1/insights/report-jobs/pdf?period=monthly",
        token=token,
        body={},
    )
    report["insights_job_create_ms"] = round(create_ms, 2)
    status_path = created["status_url"].replace(args.base_url, "")
    download_path = created["download_url"].replace(args.base_url, "")

    polls = 0
    status = {}
    for _ in range(80):
        polls += 1
        _, status, _, _ = request_json(args.base_url, "GET", status_path, token=token)
        if status.get("status") in {"completed", "failed"}:
            break
        time.sleep(0.2)
    if status.get("status") != "completed":
        raise RuntimeError(f"Insights async job did not complete: {status}")
    report["insights_job_polls"] = polls
    report["insights_job_duration_ms"] = status.get("duration_ms")
    _, _, raw, dl_ms = request_json(args.base_url, "GET", download_path, token=token)
    report["insights_pdf_async_download_ms"] = round(dl_ms, 2)
    report["insights_pdf_async_bytes"] = len(raw)

    # Async dashboard job
    _, created, _, create_ms = request_json(
        args.base_url,
        "POST",
        "/api/v1/metrics/dashboard-report-jobs/pdf?range=30d",
        token=token,
        body={},
    )
    report["dashboard_job_create_ms"] = round(create_ms, 2)
    status_path = created["status_url"].replace(args.base_url, "")
    download_path = created["download_url"].replace(args.base_url, "")

    polls = 0
    status = {}
    for _ in range(80):
        polls += 1
        _, status, _, _ = request_json(args.base_url, "GET", status_path, token=token)
        if status.get("status") in {"completed", "failed"}:
            break
        time.sleep(0.2)
    if status.get("status") != "completed":
        raise RuntimeError(f"Dashboard async job did not complete: {status}")
    report["dashboard_job_polls"] = polls
    report["dashboard_job_duration_ms"] = status.get("duration_ms")
    _, _, raw, dl_ms = request_json(args.base_url, "GET", download_path, token=token)
    report["dashboard_pdf_async_download_ms"] = round(dl_ms, 2)
    report["dashboard_pdf_async_bytes"] = len(raw)

    # Concurrent read pressure while async job runs
    _, created, _, _ = request_json(
        args.base_url,
        "POST",
        "/api/v1/insights/report-jobs/pdf?period=monthly",
        token=token,
        body={},
    )
    status_path = created["status_url"].replace(args.base_url, "")

    samples: list[float] = []
    errors: list[str] = []

    def hit_overview():
        for _ in range(args.concurrency_iterations):
            try:
                _, _, _, ms = request_json(args.base_url, "GET", "/api/v1/insights/overview?period=monthly", token=token)
                samples.append(ms)
            except Exception as exc:  # pragma: no cover
                errors.append(str(exc))

    threads = [threading.Thread(target=hit_overview) for _ in range(args.concurrency_workers)]
    for t in threads:
        t.start()

    concurrent_job_status = None
    for _ in range(80):
        _, st, _, _ = request_json(args.base_url, "GET", status_path, token=token)
        concurrent_job_status = st.get("status")
        if concurrent_job_status in {"completed", "failed"}:
            break
        time.sleep(0.2)

    for t in threads:
        t.join()

    report["concurrent_overview_calls"] = len(samples)
    report["concurrent_overview_avg_ms"] = round(statistics.mean(samples), 2) if samples else None
    report["concurrent_overview_max_ms"] = round(max(samples), 2) if samples else None
    report["concurrent_overview_errors"] = len(errors)
    report["concurrent_job_status"] = concurrent_job_status

    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
