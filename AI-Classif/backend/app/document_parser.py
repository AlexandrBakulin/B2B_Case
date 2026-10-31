"""Text extraction for long PDF and DOCX files, executed by a Celery worker."""
from __future__ import annotations

import math
import zipfile
from pathlib import Path

from docx import Document
from pypdf import PdfReader

from .config import get_settings


def _extract_pdf(path: Path) -> tuple[int, bool, str]:
    try:
        pdf = PdfReader(str(path), strict=False)
    except Exception as exc:  # pragma: no cover - exact errors depend on malformed input
        raise ValueError(f"Не удалось открыть PDF: {exc}") from exc

    if pdf.is_encrypted:
        raise ValueError("PDF защищён паролем. Загрузите файл без пароля.")
    page_count = len(pdf.pages)
    if page_count < 1:
        raise ValueError("PDF не содержит страниц.")
    if page_count > get_settings().max_document_pages:
        raise ValueError(f"В PDF {page_count} страниц; допустимый предел — {get_settings().max_document_pages}.")

    chunks: list[str] = []
    extracted_page_texts: list[str] = []
    for index, page in enumerate(pdf.pages, start=1):
        page_text = (page.extract_text() or "").strip()
        if page_text:
            extracted_page_texts.append(page_text)
        chunks.append(f"[Страница {index}]\n{page_text}")
    text = "\n\n".join(chunks).strip()

    if not extracted_page_texts:
        raise ValueError(
            "В PDF не найден текстовый слой. Возможно, это скан. "
            "Для автоматического извлечения загрузите PDF с распознанным текстом."
        )
    return page_count, False, text


def _extract_docx(path: Path) -> tuple[int, bool, str]:
    if not zipfile.is_zipfile(path):
        raise ValueError("Файл DOCX повреждён или имеет неверный формат.")
    try:
        document = Document(path)
    except Exception as exc:
        raise ValueError(f"Не удалось открыть DOCX: {exc}") from exc

    chunks: list[str] = []
    for paragraph in document.paragraphs:
        value = paragraph.text.strip()
        if value:
            chunks.append(value)

    for table_index, table in enumerate(document.tables, start=1):
        chunks.append(f"[Таблица {table_index}]")
        for row in table.rows:
            chunks.append(" | ".join(cell.text.strip().replace("\n", " ") for cell in row.cells))

    text = "\n".join(chunks).strip()
    if not text:
        raise ValueError("В DOCX не найден текст.")

    # DOCX has no fixed pagination until rendered by a word processor.
    # Return an explicitly labelled estimate for progress/volume only.
    estimated_pages = max(1, math.ceil(len(text) / 3000))
    if estimated_pages > get_settings().max_document_pages:
        raise ValueError(f"Объём DOCX превышает лимит {get_settings().max_document_pages} расчётных страниц.")
    return estimated_pages, True, text


def extract_document(file_path: str | Path, file_type: str) -> tuple[int, bool, str]:
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError("Загруженный файл не найден в общем хранилище API/worker.")
    normalized_type = file_type.lower().lstrip(".")
    if normalized_type == "pdf":
        return _extract_pdf(path)
    if normalized_type == "docx":
        return _extract_docx(path)
    raise ValueError("Поддерживаются только PDF и DOCX.")
