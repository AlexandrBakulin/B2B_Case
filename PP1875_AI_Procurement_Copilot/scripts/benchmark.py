#!/usr/bin/env python3
"""Приёмочная проверка запущенного API: точность, одиночный ответ, 100 товаров."""
import argparse
import json
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def call(base: str, path: str, payload: dict) -> tuple[dict, float]:
    request = urllib.request.Request(
        base + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=180) as response:
        result = json.load(response)
    return result, time.perf_counter() - started


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    cases = json.loads((ROOT / "backend/data/evaluation.json").read_text(encoding="utf-8"))

    predictions, _ = call(args.api, "/api/v1/classify/batch", {"items": [case["query"] for case in cases], "top_k": 3})
    rows = []
    for case, prediction in zip(cases, predictions["results"], strict=True):
        rows.append({**case, "predicted_id": prediction["match"]["id"], "correct": prediction["match"]["id"] == case["expected_id"], "confidence": prediction["match"]["confidence"]})
    accuracy = sum(row["correct"] for row in rows) / len(rows) * 100

    _, single_seconds = call(args.api, "/api/v1/classify", {"query": "Сервер стоечный 2U", "top_k": 3})
    batch_items = [f"{case['query']} партия {index}" for index, case in enumerate(cases * 5)]
    _, batch_seconds = call(args.api, "/api/v1/classify/batch", {"items": batch_items, "top_k": 3})
    report = {
        "accuracy_percent": round(accuracy, 1), "accuracy_threshold": 85,
        "single_seconds": round(single_seconds, 3), "single_threshold": 5,
        "batch_100_seconds": round(batch_seconds, 3), "batch_threshold": 120,
        "passed": accuracy >= 85 and single_seconds < 5 and batch_seconds < 120,
        "cases": rows,
    }
    text = json.dumps(report, ensure_ascii=False, indent=2)
    print(text)
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
