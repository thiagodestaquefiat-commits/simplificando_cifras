from ..database import db


class EventAudio(db.Model):
    __tablename__ = "event_audio"
    message_id = db.Column(db.String(80), db.ForeignKey("event_messages.id", ondelete="CASCADE"), primary_key=True)
    data = db.Column(db.LargeBinary, nullable=False)
