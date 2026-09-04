from sqlalchemy.engine import make_url
from sqlalchemy.dialects import mysql
from sqlalchemy.schema import CreateTable

from app.config import _database_uri
from app.database import db, ensure_additive_collaboration_columns


def test_railway_mysql_uri_preserves_connection_and_uses_unicode():
    source = "mysql://test:test%40pass@mysql.railway.internal:3306/railway"
    result = make_url(_database_uri(source))
    assert result.drivername == "mysql+pymysql"
    assert result.password == "test@pass"
    assert result.host == "mysql.railway.internal"
    assert result.database == "railway"
    assert result.query["charset"] == "utf8mb4"
    assert _database_uri(_database_uri(source)) == _database_uri(source)


def test_existing_backends_preserved():
    assert _database_uri("sqlite:///:memory:") == "sqlite:///:memory:"
    assert _database_uri("postgres://test:test@db/app") == "postgresql+psycopg://test:test@db/app"
    assert make_url(_database_uri("mysql+pymysql://test:test@db/app?charset=utf8mb4&connect_timeout=10")).query["connect_timeout"] == "10"


def test_mysql_schema_compiles_and_additive_setup_is_idempotent(app):
    with app.app_context():
        for table in db.metadata.sorted_tables:
            ddl = str(CreateTable(table).compile(dialect=mysql.dialect()))
            assert "CREATE TABLE" in ddl
        ensure_additive_collaboration_columns()
        ensure_additive_collaboration_columns()
