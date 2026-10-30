from ..database import db
from .collaboration import utcnow


class SongProfile(db.Model):
    """Perfil de recomendação de uma música do catálogo compartilhado (tabela nova e só aditiva).

    Fica fora de shared_songs.song_data porque aquele JSON segue o contrato rígido da resposta da IA.
    classification: gênero, subgênero, andamento, BPM aproximado, temas e se é sacra (IA, uma vez por música).
    bpm_votes: BPM que cada conta salvou na própria música, com o id em hash (nunca exposto).
    """

    __tablename__ = "shared_song_profiles"
    song_id = db.Column(db.String(36), db.ForeignKey("shared_songs.id", ondelete="CASCADE"), primary_key=True)
    classification = db.Column(db.JSON, nullable=True)
    bpm_votes = db.Column(db.JSON, nullable=True)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
