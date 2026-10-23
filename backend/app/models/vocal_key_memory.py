from ..database import db


class VocalKeyMemory(db.Model):
    """Último tom oficial usado pelo vocalista; independe da cópia da playlist."""

    __tablename__ = "vocal_key_memories"
    vocalist_id = db.Column(db.String(80), db.ForeignKey("collaboration_users.id", ondelete="CASCADE"), primary_key=True)
    song_identity = db.Column(db.String(64), primary_key=True)
    song_key = db.Column(db.String(32), nullable=False)
    performed_at = db.Column(db.DateTime(timezone=True), nullable=False)
    # Proveniência sem FK: excluir o evento não apaga a memória musical da pessoa.
    source_event_id = db.Column(db.String(80), nullable=False)
    source_position = db.Column(db.Integer, nullable=False, default=0)
