import io
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from .config import settings
from .models import User
from .security import require_user

router = APIRouter(tags=['图片素材'])


@router.post('/uploads/', status_code=201)
async def upload(file: UploadFile, user: User = Depends(require_user)):
    data = await file.read(2_000_001)
    if len(data) > 2_000_000:
        raise HTTPException(413, '图片不能超过 2 MB')
    try:
        image = Image.open(io.BytesIO(data))
        if image.format not in ['PNG', 'JPEG', 'WEBP'] or image.width > 4096 or image.height > 4096:
            raise ValueError()
        image.load()
        # Re-encode to remove metadata and prevent serving uploaded active content.
        image = image.convert('RGB')
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, '请选择不超过 4096 × 4096 的 PNG、JPG 或 WebP 图片')
    directory = Path(settings().storage_dir) / 'uploads'
    directory.mkdir(parents=True, exist_ok=True)
    name = uuid4().hex + '.webp'
    image.save(directory / name, format='WEBP', quality=90)
    return {'url': '/uploads/' + name}
