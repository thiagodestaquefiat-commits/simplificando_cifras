"""Regras temporais puras, com relógio injetável e eventos já autorizados."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable, Iterable
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class Event:
    id: int | str
    name: str
    starts_at: datetime

    def __post_init__(self):
        if self.starts_at.tzinfo is None or self.starts_at.utcoffset() is None:
            raise ValueError("O evento deve ter data/hora com fuso horário.")


class EventService:
    def __init__(self, events: Iterable[Event], *, timezone: str = "America/Sao_Paulo",
                 clock: Callable[[], datetime] | None = None):
        self.events = tuple(events)
        self.timezone = ZoneInfo(timezone)
        self.clock = clock or (lambda: datetime.now(self.timezone))

    def now(self) -> datetime:
        current = self.clock()
        if current.tzinfo is None or current.utcoffset() is None:
            raise ValueError("O relógio deve retornar data/hora com fuso horário.")
        return current.astimezone(self.timezone)

    @staticmethod
    def ordered(events: Iterable[Event]) -> list[Event]:
        return sorted(events, key=lambda event: (event.starts_at, str(event.id)))

    def next_events(self) -> list[Event]:
        current = self.now()
        upcoming = self.ordered(e for e in self.events if e.starts_at >= current)
        if not upcoming:
            return []
        # Se houver dois eventos na mesma hora, o usuário escolhe.
        first_date = upcoming[0].starts_at
        return [e for e in upcoming if e.starts_at == first_date]

    def on_day(self, offset: int) -> list[Event]:
        target = self.now().date() + timedelta(days=offset)
        return self.ordered(e for e in self.events
                            if e.starts_at.astimezone(self.timezone).date() == target)
