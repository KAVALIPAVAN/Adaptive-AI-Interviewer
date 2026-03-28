"""
Upload Routes
POST /api/upload/resume — receive PDF, extract text, return context string
"""

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
import os
import tempfile
from middleware.auth import get_current_user

router = APIRouter()

ALLOWED_TYPES = {
    "application/pdf",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


async def extract_text(file_path: str, filename: str) -> str:
    """Extract plain text from uploaded file."""
    ext = os.path.splitext(filename)[1].lower()

    # ── PDF ──────────────────────────────────────────────────
    if ext == ".pdf":
        try:
            import pdfplumber
            text_parts = []
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    t = page.extract_text()
                    if t:
                        text_parts.append(t)
            return "\n".join(text_parts)
        except ImportError:
            pass  # fall through to PyPDF2

        try:
            import PyPDF2
            text_parts = []
            with open(file_path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    t = page.extract_text()
                    if t:
                        text_parts.append(t)
            return "\n".join(text_parts)
        except ImportError:
            return f"[PDF uploaded: {filename}. Install pdfplumber: pip install pdfplumber]"

    # ── Plain text ───────────────────────────────────────────
    if ext == ".txt":
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()

    # ── DOCX ─────────────────────────────────────────────────
    if ext == ".docx":
        try:
            import docx
            doc  = docx.Document(file_path)
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except ImportError:
            return f"[DOCX uploaded: {filename}. Install python-docx: pip install python-docx]"

    return f"[Unsupported file type: {ext}]"


@router.post("/resume")
async def upload_resume(
    file:         UploadFile = File(...),
    current_user: dict       = Depends(get_current_user),
):
    """
    Accepts a PDF/DOC/TXT resume.
    Extracts text and returns a trimmed context string for RAG injection.
    Protected — requires a valid JWT.
    """
    # Validate content type
    if file.content_type not in ALLOWED_TYPES and not file.filename.endswith((".pdf", ".txt", ".doc", ".docx")):
        raise HTTPException(status_code=400, detail="Only PDF, DOC, DOCX, or TXT files are supported.")

    # Read and size-check
    content = await file.read()
    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit.")

    # Write to temp file, extract text, clean up
    suffix = os.path.splitext(file.filename)[1] or ".pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        raw_text = await extract_text(tmp_path, file.filename)
    finally:
        os.unlink(tmp_path)

    # Clean and trim to ~2500 chars to fit system prompt budget
    cleaned = " ".join(raw_text.split())          # normalise whitespace
    cleaned = "".join(c for c in cleaned if c.isprintable() or c == "\n")
    trimmed = cleaned[:2500] if len(cleaned) > 2500 else cleaned

    if not trimmed.strip():
        return {
            "context":  f"[Resume: {file.filename} — could not extract text. The file may be scanned/image-based.]",
            "filename": file.filename,
            "chars":    0,
        }

    context = f"Resume ({file.filename}):\n\n{trimmed}"

    return {
        "context":  context,
        "filename": file.filename,
        "chars":    len(trimmed),
    }
