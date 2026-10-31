from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class ClassifyRequest(BaseModel):
    query: str = Field(min_length=2, max_length=2000, examples=["Ноутбук портативный"])
    top_k: int = Field(default=3, ge=1, le=5)

    @field_validator("query")
    @classmethod
    def clean_query(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Введите наименование товара")
        return value


class BatchRequest(BaseModel):
    items: list[str] = Field(min_length=1, max_length=100)
    top_k: int = Field(default=3, ge=1, le=5)

    @field_validator("items")
    @classmethod
    def validate_items(cls, values: list[str]) -> list[str]:
        cleaned = [" ".join(value.split()) for value in values]
        if any(len(value) < 2 or len(value) > 2000 for value in cleaned):
            raise ValueError("Каждое наименование должно содержать от 2 до 2000 символов")
        return cleaned


class Alternative(BaseModel):
    id: str
    name: str
    okpd2: str
    appendix: int
    position: int
    regime: str
    regime_label: str
    legal_reference: str
    source_url: str
    quota_percent: float | None = None
    similarity: float
    confidence: float


class ClassificationResult(BaseModel):
    query: str
    match: Alternative
    alternatives: list[Alternative]
    needs_review: bool
    explanation: str
    duration_ms: float


class BatchResponse(BaseModel):
    results: list[ClassificationResult]
    count: int
    duration_ms: float


class CatalogItemInput(BaseModel):
    id: str = Field(pattern=r"^a[123]-[0-9]+$")
    appendix: Literal[1, 2, 3]
    position: int = Field(gt=0)
    name: str = Field(min_length=2, max_length=10000)
    okpd2: str = Field(min_length=1, max_length=2000)
    regime: Literal["prohibition", "restriction", "quota"]
    regime_label: str = Field(min_length=2, max_length=160)
    legal_reference: str = Field(min_length=2, max_length=1000)
    source_url: str = Field(min_length=10, max_length=2000)
    quota_percent: float | None = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def validate_regime(self):
        expected = {1: "prohibition", 2: "restriction", 3: "quota"}[self.appendix]
        if self.regime != expected:
            raise ValueError("Тип нацрежима не соответствует приложению")
        if self.appendix == 3 and self.quota_percent is None:
            raise ValueError("Для приложения № 3 укажите quota_percent")
        return self


class CatalogUpdate(BaseModel):
    schema_version: Literal[1]
    version: str = Field(min_length=1, max_length=64)
    document: str = Field(min_length=2, max_length=500)
    source_url: str = Field(min_length=10, max_length=2000)
    retrieved_at: str
    items: list[CatalogItemInput] = Field(min_length=1, max_length=5000)
    sha256: str | None = None

    @field_validator("items")
    @classmethod
    def unique_ids(cls, items: list[CatalogItemInput]) -> list[CatalogItemInput]:
        ids = [item.id for item in items]
        if len(ids) != len(set(ids)):
            raise ValueError("Идентификаторы позиций должны быть уникальными")
        return items


class JobResponse(BaseModel):
    job_id: str
    status: str


class HistoryItem(BaseModel):
    id: str
    query: str
    item_id: str | None
    confidence: float
    duration_ms: float
    created_at: str
