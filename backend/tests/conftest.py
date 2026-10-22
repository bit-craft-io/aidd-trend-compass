import pytest
from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, create_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import market_analysis_service, models, trend_service, trend_system_type_seeder  # noqa: F401  Trendをメタデータに登録するため
from app.db import Base, get_db
from app.main import app


@compiles(BigInteger, "sqlite")
def _big_integer_as_integer_on_sqlite(type_, compiler, **kw):
    return "INTEGER"


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    trend_system_type_seeder.reset(session)
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    test_session_local = sessionmaker(bind=engine)
    with test_session_local() as seed_session:
        trend_system_type_seeder.reset(seed_session)

    def override_get_db():
        db = test_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    test_client = TestClient(app)
    test_client.session_local = test_session_local
    yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _stub_price_history(monkeypatch):
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: [])
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: [])
    monkeypatch.setattr(trend_service, "get_news", lambda code: [])
    monkeypatch.setattr(trend_service, "summarize_and_analyze", lambda code, items: [])
