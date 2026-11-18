"""Bounded in-memory processing only. No file storage or public URLs."""
import io
import warnings
from threading import BoundedSemaphore
from PIL import Image, ImageOps, UnidentifiedImageError
from ..errors import ApiError

MAX_INPUT = 5 * 1024 * 1024
MAX_OUTPUT = 1024 * 1024
MAX_PIXELS = 16_000_000
_processing = BoundedSemaphore(1)

def normalize_image(raw):
    # One decode per worker. Total concurrency bounded by Gunicorn worker count.
    if not _processing.acquire(blocking=False):
        raise ApiError('anexo_ocupado', 'Há outro anexo sendo processado. Aguarde e tente novamente.', 429)
    try:
        return _normalize_image(raw)
    finally:
        _processing.release()

def _normalize_image(raw):
    if not raw or len(raw) > MAX_INPUT:
        raise ApiError('anexo_grande', 'Escolha uma imagem PNG ou JPEG de até 5 MB.', 413)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw), formats=['PNG', 'JPEG']) as probe:
                if probe.width * probe.height > MAX_PIXELS or max(probe.size) > 12000 or getattr(probe, 'n_frames', 1) != 1:
                    raise ValueError('dimensions')
                probe.verify()
            with Image.open(io.BytesIO(raw), formats=['PNG', 'JPEG']) as source:
                source.load()
                oriented = ImageOps.exif_transpose(source)
                oriented.thumbnail((2000, 2000), Image.Resampling.LANCZOS)
                # Fresh canvas deliberately drops EXIF, GPS, ICC, XMP and PNG text.
                clean = Image.new('RGB', oriented.size, 'white')
                if 'A' in oriented.getbands() or 'transparency' in oriented.info:
                    rgba = oriented.convert('RGBA'); clean.paste(rgba, mask=rgba.getchannel('A'))
                else:
                    clean.paste(oriented.convert('RGB'))
                output = io.BytesIO(); clean.save(output, 'PNG')
                if output.tell() <= MAX_OUTPUT:
                    return output.getvalue(), 'png'
                for quality in (90, 85, 75, 65):
                    output = io.BytesIO(); clean.save(output, 'JPEG', quality=quality, subsampling=0)
                    if output.tell() <= MAX_OUTPUT:
                        return output.getvalue(), 'jpg'
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ApiError('anexo_invalido', 'Imagem inválida ou muito grande. Use um print PNG/JPEG estático de até 16 milhões de pixels.', 400) from None
    raise ApiError('anexo_grande', 'Não foi possível reduzir a imagem com legibilidade. Recorte o print e tente novamente.', 413)
