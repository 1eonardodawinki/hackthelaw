"""Extract text from uploaded files (PDF or plain text)."""

import hashlib
from pathlib import Path


def extract_text(file_path: str, content_type: str) -> str:
    """Extract text from a file based on its content type."""
    if content_type == "application/pdf":
        return _extract_pdf(file_path)
    # Plain text, markdown, etc.
    return Path(file_path).read_text(encoding="utf-8", errors="replace")


def _extract_pdf(file_path: str) -> str:
    import pymupdf

    doc = pymupdf.open(file_path)
    pages = []
    for page in doc:
        text = page.get_text()
        if text.strip():
            pages.append(text)
    doc.close()
    return "\n\n".join(pages)


def content_hash(text: str) -> str:
    """SHA-256 hash of the text content for dedup and integrity."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
