"""
File Parser — extracts plain text from PDF / DOCX / TXT / XLSX / ZIP.

Returns a list of (filename, text) pairs.
ZIP files are unpacked and each supported member is parsed recursively.
"""
import io
import logging
import os
import zipfile
from pathlib import Path

logger = logging.getLogger(__name__)

SUPPORTED = {".pdf", ".docx", ".txt", ".xlsx"}


def parse_file(path: str) -> list[tuple[str, str]]:
    """Parse any supported file. Returns [(filename, text), ...]."""
    ext = Path(path).suffix.lower()
    if ext == ".zip":
        return _parse_zip(path)
    text = _parse_single(path, ext)
    return [(os.path.basename(path), text)] if text else []


def parse_bytes(data: bytes, filename: str) -> list[tuple[str, str]]:
    """Parse from raw bytes (downloaded from URL)."""
    ext  = Path(filename).suffix.lower()
    buf  = io.BytesIO(data)
    if ext == ".zip":
        return _parse_zip_bytes(buf)
    text = _parse_bytes_single(buf, ext)
    return [(filename, text)] if text else []


# ── Single file ───────────────────────────────────────────────────────────────

def _parse_single(path: str, ext: str) -> str:
    with open(path, "rb") as f:
        return _parse_bytes_single(io.BytesIO(f.read()), ext)


def _parse_bytes_single(buf: io.BytesIO, ext: str) -> str:
    if ext == ".pdf":
        return _pdf(buf)
    if ext == ".docx":
        return _docx(buf)
    if ext == ".txt":
        return buf.read().decode("utf-8", errors="replace")
    if ext == ".xlsx":
        return _xlsx(buf)
    return ""


def _pdf(buf: io.BytesIO) -> str:
    try:
        import pdfplumber
        text_parts = []
        with pdfplumber.open(buf) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text_parts.append(t)
        return "\n".join(text_parts)
    except ImportError:
        logger.warning("pdfplumber not installed — trying pypdf")
    try:
        from pypdf import PdfReader
        buf.seek(0)
        reader = PdfReader(buf)
        return "\n".join(
            page.extract_text() or "" for page in reader.pages
        )
    except ImportError:
        logger.error("Neither pdfplumber nor pypdf is installed.")
        return ""


def _docx(buf: io.BytesIO) -> str:
    try:
        from docx import Document
        doc = Document(buf)
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except ImportError:
        logger.error("python-docx not installed.")
        return ""


def _xlsx(buf: io.BytesIO) -> str:
    try:
        import openpyxl
        wb   = openpyxl.load_workbook(buf, read_only=True, data_only=True)
        rows = []
        for sheet in wb.worksheets:
            for row in sheet.iter_rows(values_only=True):
                line = "\t".join(str(c) if c is not None else "" for c in row)
                if line.strip():
                    rows.append(line)
        return "\n".join(rows)
    except ImportError:
        logger.error("openpyxl not installed.")
        return ""


# ── ZIP ───────────────────────────────────────────────────────────────────────

def _parse_zip(path: str) -> list[tuple[str, str]]:
    with open(path, "rb") as f:
        return _parse_zip_bytes(io.BytesIO(f.read()))


def _parse_zip_bytes(buf: io.BytesIO) -> list[tuple[str, str]]:
    results = []
    with zipfile.ZipFile(buf) as zf:
        for name in zf.namelist():
            ext = Path(name).suffix.lower()
            if ext not in SUPPORTED:
                continue
            try:
                data   = zf.read(name)
                parsed = parse_bytes(data, os.path.basename(name))
                results.extend(parsed)
            except Exception as exc:
                logger.warning("Failed to parse ZIP member %s: %s", name, exc)
    return results
