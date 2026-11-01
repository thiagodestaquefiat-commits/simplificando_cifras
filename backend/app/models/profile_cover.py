from datetime import datetime, timezone
from ..database import db


class ProfileCover(db.Model):
    """Account-owned header photo; null records an explicit removal."""
    __tablename__ = "profile_covers"
    user_id = db.Column(db.String(80), db.ForeignKey("collaboration_users.id", ondelete="CASCADE"), primary_key=True)
    data_url = db.Column(db.Text, nullable=True)
    x = db.Column(db.Float, nullable=False, default=50)
    y = db.Column(db.Float, nullable=False, default=38)
    version = db.Column(db.Integer, nullable=False, default=1)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
