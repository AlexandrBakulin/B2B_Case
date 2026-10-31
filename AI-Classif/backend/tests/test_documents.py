from pathlib import Path

import pytest
from docx import Document
from pypdf import PdfReader, PdfWriter

from app.document_parser import extract_document


def test_extract_pdf_over_50_pages(tmp_path: Path):
    path = tmp_path / "long.pdf"
    source_path = Path(__file__).parents[2] / "public" / "docs" / "pp1875-overview.pdf"
    source = PdfReader(str(source_path))
    writer = PdfWriter()
    for _ in range(12):
        for page in source.pages:
            writer.add_page(page)
    with path.open("wb") as output:
        writer.write(output)

    page_count, estimated, text = extract_document(path, "pdf")

    assert page_count == 60
    assert estimated is False
    assert "[Страница 60]" in text
    assert "национального режима" in text.lower()


def test_extract_docx_returns_estimated_pagination(tmp_path: Path):
    path = tmp_path / "guide.docx"
    document = Document()
    for index in range(100):
        document.add_paragraph(f"Пункт нормативного документа номер {index + 1}. " * 12)
    document.save(path)

    page_count, estimated, text = extract_document(path, "docx")

    assert page_count > 1
    assert estimated is True
    assert "Пункт нормативного документа номер 100" in text


def test_pdf_without_text_layer_reports_ocr_requirement(tmp_path: Path):
    path = tmp_path / "blank.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    with path.open("wb") as output:
        writer.write(output)

    with pytest.raises(ValueError, match="скан"):
        extract_document(path, "pdf")


def test_unsupported_document_type_is_rejected(tmp_path: Path):
    path = tmp_path / "notes.txt"
    path.write_text("some text", encoding="utf-8")

    with pytest.raises(ValueError, match="PDF и DOCX"):
        extract_document(path, "txt")
