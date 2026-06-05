import os
import uuid
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, status

from app.routes.auth import require_roles

router = APIRouter(prefix="/api/upload", tags=["Uploads"])

UPLOAD_DIR = Path("uploads")

# Ensure the upload directory exists
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    actor: dict = Depends(require_roles("admin", "manager")),
):
    """
    Upload a file (image or 3D model). Requires admin or manager role.
    Returns the URL to access the uploaded file.
    """
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file uploaded")
    
    # Extract file extension safely
    extension = os.path.splitext(file.filename)[1].lower()
    
    # Allowed extensions (basic security)
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".glb", ".gltf"}
    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail=f"File type {extension} not allowed. Supported types: {', '.join(allowed_extensions)}"
        )

    # Generate a unique filename to prevent collisions
    unique_filename = f"{uuid.uuid4().hex}{extension}"
    file_path = UPLOAD_DIR / unique_filename

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save file: {str(e)}"
        )
    
    # Return the URL path
    return {"url": f"/uploads/{unique_filename}"}
