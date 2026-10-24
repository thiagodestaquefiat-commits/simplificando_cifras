from ..database import db


class ProfileInstrument(db.Model):
    """Índice de instrumentos declarados no perfil, nunca de funções em eventos."""

    __tablename__ = "profile_instruments"
    user_id = db.Column(db.String(80), db.ForeignKey("collaboration_users.id", ondelete="CASCADE"), primary_key=True)
    instrument = db.Column(db.String(40), primary_key=True)
    __table_args__ = (db.Index("ix_profile_instruments_instrument_user", "instrument", "user_id"),)
