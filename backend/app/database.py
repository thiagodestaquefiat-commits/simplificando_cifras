from __future__ import annotations

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


db = SQLAlchemy(model_class=Base)


ADDITIVE_COLLABORATION_COLUMNS = {
    "events": {
        "band_id": "VARCHAR(80)",
        "location_name": "VARCHAR(200) NOT NULL DEFAULT ''",
        "formatted_address": "VARCHAR(500) NOT NULL DEFAULT ''",
        "location_street": "VARCHAR(200) NOT NULL DEFAULT ''",
        "location_street_number": "VARCHAR(40) NOT NULL DEFAULT ''",
        "location_district": "VARCHAR(160) NOT NULL DEFAULT ''",
        "location_city": "VARCHAR(160) NOT NULL DEFAULT ''",
        "location_state": "VARCHAR(120) NOT NULL DEFAULT ''",
        "location_postal_code": "VARCHAR(40) NOT NULL DEFAULT ''",
        "location_country": "VARCHAR(120) NOT NULL DEFAULT ''",
        "latitude": "DOUBLE PRECISION",
        "longitude": "DOUBLE PRECISION",
        "location_place_id": "VARCHAR(240) NOT NULL DEFAULT ''",
        "location_provider": "VARCHAR(40) NOT NULL DEFAULT ''",
    },
    "event_repertoire_items": {
        "shared_title": "VARCHAR(160) NOT NULL DEFAULT ''",
        "shared_artist": "VARCHAR(160) NOT NULL DEFAULT ''",
        "shared_capo": "VARCHAR(20) NOT NULL DEFAULT ''",
        "shared_chord_sheet": "TEXT NOT NULL DEFAULT ''",
    },
    "personal_repertoire_overrides": {
        "personal_title": "VARCHAR(160) NOT NULL DEFAULT ''",
        "personal_artist": "VARCHAR(160) NOT NULL DEFAULT ''",
        "personal_capo": "VARCHAR(20) NOT NULL DEFAULT ''",
        "personal_chord_sheet": "TEXT NOT NULL DEFAULT ''",
    },
}


def ensure_additive_collaboration_columns() -> None:
    """Adiciona somente colunas novas; nunca remove ou renomeia dados existentes."""
    with db.engine.begin() as connection:
        inspector = inspect(connection)
        tables = set(inspector.get_table_names())
        for table_name, definitions in ADDITIVE_COLLABORATION_COLUMNS.items():
            if table_name not in tables:
                continue
            existing = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, definition in definitions.items():
                if column_name not in existing:
                    quote = connection.dialect.identifier_preparer.quote_identifier
                    if connection.dialect.name == "mysql" and definition.startswith("TEXT "):
                        definition = definition.replace("DEFAULT ''", "DEFAULT ('')")
                    connection.execute(text(f'ALTER TABLE {quote(table_name)} ADD COLUMN {quote(column_name)} {definition}'))


@event.listens_for(Engine, "connect")
def enable_sqlite_foreign_keys(connection, _record) -> None:
    if connection.__class__.__module__.startswith("sqlite3"):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
