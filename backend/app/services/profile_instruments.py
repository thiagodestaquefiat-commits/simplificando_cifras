"""Normalização exata: não confundir guitarra/violão ou vocal/backing vocal."""
import unicodedata

from ..database import db
from ..models import ProfileInstrument


def _key(value):
    return " ".join("".join(c for c in unicodedata.normalize("NFKD", value.casefold()) if not unicodedata.combining(c)).split())


_ALIASES = {
    "vocal": ("vocal", "vocalista"),
    "backing vocal": ("backing vocal",),
    "guitarra": ("guitarra", "guitarrista"),
    "violao": ("violao", "violonista"),
    "baixo": ("baixo", "contrabaixo", "baixista"),
    "bateria": ("bateria", "baterista"),
    "teclado": ("teclado", "tecladista"),
    "ukulele": ("ukulele", "ukelele"),
    "violino": ("violino", "violinista"),
    "percussao": ("percussao", "percussionista"),
    "outros": ("outros",),
}
_CANONICAL = {alias: instrument for instrument, aliases in _ALIASES.items() for alias in aliases}


def normalize_instrument(value):
    return _CANONICAL.get(_key(value)) if isinstance(value, str) and len(value) <= 80 else None


def sync_profile_instruments(user_id, metadata):
    # Só metadados da identidade autenticada. Ausência não é uma exclusão; [] é.
    values = metadata.get("instruments")
    if not isinstance(values, list):
        return
    wanted = {key for value in values[:20] if (key := normalize_instrument(value))}
    existing = ProfileInstrument.query.filter_by(user_id=user_id).all()
    present = {row.instrument for row in existing}
    for row in existing:
        if row.instrument not in wanted:
            db.session.delete(row)
    for instrument in wanted - present:
        db.session.add(ProfileInstrument(user_id=user_id, instrument=instrument))
