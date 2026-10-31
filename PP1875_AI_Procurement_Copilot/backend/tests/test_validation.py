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
