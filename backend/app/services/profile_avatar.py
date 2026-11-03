import base64
import binascii
import io
import re
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError

from ..errors import ApiError


def normalize_avatar(value, *, max_bytes=200_000, max_side=256):
    # MANUTENÇÃO: a foto fica no banco da aplicação, nunca no token/JWT do login.
    if value is None:
        return None
    if not isinstance(value, str) or len(value) > (max_bytes * 4 // 3 + 100):
        raise ApiError("foto_invalida", f"Escolha uma foto válida de até {max_bytes // 1000} KB após o recorte.", 400)
    match = re.fullmatch(r"data:image/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)", value)
    if not match:
        raise ApiError("foto_invalida", "Selecione uma imagem pelo editor de foto.", 400)
    try:
        raw = base64.b64decode(match.group(1), validate=True)
        if len(raw) > max_bytes:
            raise ValueError("size")
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as image:
                if image.width > 2048 or image.height > 2048:
                    raise ValueError("dimensions")
                clean = ImageOps.exif_transpose(image).convert("RGB")
                clean.thumbnail((max_side, max_side))
                output = io.BytesIO()
                clean.save(output, format="JPEG", quality=86)
        return "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode("ascii")
    except (ValueError, binascii.Error, OSError, UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ApiError("foto_invalida", "Não foi possível validar a imagem do perfil.", 400) from None
