import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.scoring import confidence_from_similarity
from app.schemas import BatchRequest, CatalogUpdate, ClassifyRequest


def test_single_query_is_normalized():
    assert ClassifyRequest(query="  Ноутбук\n  портативный  ").query == "Ноутбук портативный"


def test_batch_limit_is_100():
    BatchRequest(items=["Товар"] * 100)
    with pytest.raises(ValidationError):
        BatchRequest(items=["Товар"] * 101)


def test_batch_rejects_blank_items():
    with pytest.raises(ValidationError):
        BatchRequest(items=["Товар", " "])


def test_confidence_is_bounded_and_monotonic():
    values = [confidence_from_similarity(score) for score in (-1, 0, 0.4, 0.6, 1)]
    assert values == sorted(values)
    assert all(0 < value <= 100 for value in values)


def test_catalog_is_complete_and_consistent():
    path = Path(__file__).parents[1] / "data" / "catalog.json"
    document = CatalogUpdate.model_validate(json.loads(path.read_text(encoding="utf-8")))
    assert len(document.items) == 893
    assert {appendix: sum(item.appendix == appendix for item in document.items) for appendix in (1, 2, 3)} == {1: 151, 2: 465, 3: 277}
    assert all(item.legal_reference and item.source_url.startswith("https://") for item in document.items)
    assert all(item.quota_percent is not None for item in document.items if item.appendix == 3)


def test_evaluation_dataset_has_20_valid_targets():
    root = Path(__file__).parents[1] / "data"
    catalog = json.loads((root / "catalog.json").read_text(encoding="utf-8"))
    evaluation = json.loads((root / "evaluation.json").read_text(encoding="utf-8"))
    catalog_ids = {item["id"] for item in catalog["items"]}

    assert len(evaluation) == 20
    assert all(case["expected_id"] in catalog_ids for case in evaluation)
    assert len({case["query"] for case in evaluation}) == 20


def test_catalog_links_are_specific_to_each_appendix():
    root = Path(__file__).parents[1] / "data"
    document = CatalogUpdate.model_validate_json((root / "catalog.json").read_text(encoding="utf-8"))
    sources = {
        appendix: {item.source_url for item in document.items if item.appendix == appendix}
        for appendix in (1, 2, 3)
    }
    assert all(len(sources[appendix]) == 1 for appendix in (1, 2, 3))
    assert len({next(iter(sources[appendix])) for appendix in (1, 2, 3)}) == 3
