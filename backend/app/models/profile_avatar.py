from datetime import datetime, timezone

from ..database import db


class ProfileAvatar(db.Model):
    """Foto própria da conta; uma linha com data_url nulo significa remoção explícita."""
    __tablename__ = "profile_avatars"
    user_id = db.Column(db.String(80), db.ForeignKey("collaboration_users.id", ondelete="CASCADE"), primary_key=True)
    data_url = db.Column(db.Text, nullable=True)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
