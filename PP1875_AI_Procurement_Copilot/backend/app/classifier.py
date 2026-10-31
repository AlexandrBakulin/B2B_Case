import re
import time
import uuid
from dataclasses import dataclass

import numpy as np
from sqlalchemy import select

from .database import CatalogItem, ClassificationLog, SessionLocal
from .embeddings import embedder
from .schemas import Alternative, ClassificationResult
from .scoring import confidence_from_similarity

CODE_PATTERN = re.compile(r"(?<!\d)(?:\d{2}\.){1,4}\d{1,3}(?!\d)")


def to_alternative(item: CatalogItem, similarity: float, margin: float = 0.0) -> Alternative:
    return Alternative(
        id=item.id,
        name=item.name,
        okpd2=item.okpd2,
        appendix=item.appendix,
        position=item.position,
        regime=item.regime,
        regime_label=item.regime_label,
        legal_reference=item.legal_reference,
        source_url=item.source_url,
        quota_percent=item.quota_percent,
        similarity=round(similarity, 4),
        confidence=confidence_from_similarity(similarity, margin),
    )


@dataclass
class SearchMatch:
    item: CatalogItem
    similarity: float


def exact_code_match(db, query: str) -> list[SearchMatch]:
    codes = CODE_PATTERN.findall(query)
    for code in codes:
        items = db.scalars(select(CatalogItem).where(CatalogItem.okpd2.contains(code)).limit(5)).all()
        if items:
            return [SearchMatch(item=item, similarity=0.999) for item in items]
    return []


def semantic_search(db, vector: np.ndarray, top_k: int) -> list[SearchMatch]:
    distance = CatalogItem.embedding.cosine_distance(vector.tolist())
    rows = db.execute(select(CatalogItem, distance.label("distance")).order_by("distance").limit(top_k)).all()
    return [SearchMatch(item=item, similarity=max(-1.0, min(1.0, 1.0 - float(dist)))) for item, dist in rows]


def classify_vector(db, query: str, vector: np.ndarray, top_k: int, batch_id: str | None = None) -> ClassificationResult:
    started = time.perf_counter()
    matches = exact_code_match(db, query) or semantic_search(db, vector, top_k)
    if not matches:
        raise RuntimeError("Справочник пуст. Загрузите позиции ПП № 1875.")
    best = matches[0]
    margin = best.similarity - matches[1].similarity if len(matches) > 1 else 0.1
    alternatives = [to_alternative(match.item, match.similarity) for match in matches]
    best_alternative = to_alternative(best.item, best.similarity, margin)
    alternatives[0] = best_alternative
    duration = (time.perf_counter() - started) * 1000
    result = ClassificationResult(
        query=query,
        match=best_alternative,
        alternatives=alternatives,
        needs_review=best_alternative.confidence < 65,
        explanation=(
            "Совпадение по указанному коду ОКПД2."
            if CODE_PATTERN.search(query) and best.similarity == 0.999
            else "Результат получен косинусным сравнением вектора запроса с позициями локального справочника. "
                 "Уверенность — калиброванная оценка близости, а не вероятность юридической применимости нормы."
        ),
        duration_ms=round(duration, 2),
    )
    db.add(ClassificationLog(
        id=str(uuid.uuid4()), query=query, item_id=best.item.id,
        confidence=best_alternative.confidence, duration_ms=result.duration_ms, batch_id=batch_id,
    ))
    return result


def classify_one(query: str, top_k: int = 3) -> ClassificationResult:
    vector = embedder.encode(query)
    with SessionLocal() as db:
        with db.begin():
            return classify_vector(db, query, vector, top_k)


def classify_batch(items: list[str], top_k: int = 3) -> tuple[list[ClassificationResult], float]:
    started = time.perf_counter()
    vectors = embedder.encode(items)
    batch_id = str(uuid.uuid4())
    results = []
    with SessionLocal() as db:
        with db.begin():
            for query, vector in zip(items, vectors, strict=True):
                results.append(classify_vector(db, query, vector, top_k, batch_id))
    return results, round((time.perf_counter() - started) * 1000, 2)
