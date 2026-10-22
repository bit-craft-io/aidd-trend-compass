# 機能A: 基盤+一覧画面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Docker上でReact+FastAPI+MySQLが動き、一覧画面から株式コードの取得・一覧表示・更新・削除ができるMVPを構築する。

**Architecture:** Docker Compose 3コンテナ(frontend/backend/db)。backendがyfinance呼出と`trend`テーブルのソフトデリート管理を担い、frontendはREST APIのみを叩く。詳細画面は本機能ではプレースホルダーのみ実装する。

**Tech Stack:** React + Vite + TypeScript + react-router-dom + vitest/React Testing Library(frontend)、Python + FastAPI + SQLAlchemy + PyMySQL + yfinance + pytest(backend)、MySQL 8(db)

**Spec:** projects/trend-compass/docs/design/01-watchlist-foundation.md

## Global Constraints

- UI文言は断定調を避け、数字を先に示し控えめな言葉を添える型を徹底する(例: 「前回取得比+1.7%、上昇傾向の可能性」)
- 認証は実装しない(ローカルDocker環境での個人利用のみ想定)
- `trend`テーブルは物理削除しない。`deleted_at`によるソフトデリートのみ(更新時の旧データ化・削除ボタン押下時の両方で同じ意味として使う)
- 更新間隔は1/5/10/15分のみ許容し、リスト全体で共通1つ
- 詳細画面の内容(履歴チャート・市場分析・ニュース)は本プランの対象外。画面遷移(詳細ボタン/戻るリンク)のみプレースホルダーとして実装する
- 無効な銘柄コード・通信エラーは、一覧画面の入力欄直下にインラインで表示する(トースト等は使わない)

---

## File Structure

```
projects/trend-compass/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py            # FastAPIアプリ本体、/health
│   │   ├── db.py               # SQLAlchemy engine/session、get_db
│   │   ├── models.py           # Trend ORMモデル
│   │   ├── schemas.py          # Pydanticスキーマ
│   │   ├── yfinance_client.py  # yfinance呼出の薄いラッパー
│   │   ├── trend_service.py    # ソフトデリート込みの業務ロジック
│   │   ├── init_db.py          # テーブル作成スクリプト(コンテナ起動時実行)
│   │   └── routers/
│   │       ├── __init__.py
│   │       └── trends.py       # /trends 系エンドポイント
│   └── tests/
│       ├── conftest.py
│       ├── test_main.py
│       ├── test_yfinance_client.py
│       ├── test_trend_service.py
│       └── test_trends_api.py
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── App.test.tsx
        ├── setupTests.ts
        ├── types.ts
        ├── api/
        │   ├── client.ts
        │   ├── trends.ts
        │   └── trends.test.ts
        ├── hooks/
        │   ├── useWatchlist.ts
        │   └── useWatchlist.test.ts
        └── components/
            ├── CodeInput.tsx / .test.tsx
            ├── IntervalSelect.tsx / .test.tsx
            ├── WatchlistTable.tsx / .test.tsx
            ├── DetailPlaceholderPage.tsx / .test.tsx
            └── WatchlistPage.tsx / .test.tsx
```

---

### Task 1: Docker Compose 基盤 + MySQL

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

**Interfaces:**
- Produces: `db`サービス(MySQL 8、ポート3306、DB名`trend_compass`、ユーザー`trend`/パスワード`trend`、既定値は`.env`で上書き可能)

- [ ] **Step 1: docker-compose.yml と .env.example を作成**

`docker-compose.yml`:

```yaml
services:
  db:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: ${MYSQL_DATABASE:-trend_compass}
      MYSQL_USER: ${MYSQL_USER:-trend}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:-trend}
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-root}
    ports:
      - "3306:3306"
    volumes:
      - db_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  db_data:
```

`.env.example`:

```
MYSQL_DATABASE=trend_compass
MYSQL_USER=trend
MYSQL_PASSWORD=trend
MYSQL_ROOT_PASSWORD=root
```

- [ ] **Step 2: 設定ファイルの妥当性を確認**

Run: `docker compose config`
Expected: エラー無くマージ済み設定がYAMLで出力される

- [ ] **Step 3: db コンテナを起動して疎通確認**

Run:
```bash
docker compose up -d db
docker compose exec db mysqladmin ping -h localhost -u trend -ptrend
```
Expected: `mysqld is alive`

- [ ] **Step 4: コンテナを停止**

Run: `docker compose down`

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "$(cat <<'EOF'
chore(infra): add docker-compose with MySQL service

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: バックエンド骨格(FastAPI起動 + DB接続設定 + ヘルスチェック)

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/db.py`
- Create: `backend/app/models.py`
- Create: `backend/app/init_db.py`
- Create: `backend/app/main.py`
- Test: `backend/tests/test_main.py`

**Interfaces:**
- Produces: `app.db.Base`(declarative base), `app.db.engine`, `app.db.get_db()`(FastAPI依存、Sessionを返すジェネレータ)
- Produces: `app.models.Trend`(列: id, code, name, opinion, detail, price_at_fetch, created_at, updated_at, deleted_at)
- Produces: `app.main.app`(FastAPIインスタンス)、`GET /health` → `{"status": "ok"}`

- [ ] **Step 1: 依存関係ファイルを作成し、インストール**

`backend/requirements.txt`:
```
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy==2.0.35
pymysql==1.1.1
yfinance==0.2.43
pydantic==2.9.2
pytest==8.3.3
httpx==0.27.2
```

Run:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

- [ ] **Step 2: ヘルスチェックの失敗するテストを書く**

`backend/app/__init__.py`(空ファイル):
```python
```

`backend/tests/test_main.py`:
```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 3: 実行して失敗を確認**

Run: `cd backend && python -m pytest tests/test_main.py -v`
Expected: FAIL(`ModuleNotFoundError: No module named 'app.main'`)

- [ ] **Step 4: db.py / models.py / init_db.py / main.py を実装**

`backend/app/db.py`:
```python
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "mysql+pymysql://trend:trend@db:3306/trend_compass"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

`backend/app/models.py`:
```python
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, JSON, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Trend(Base):
    __tablename__ = "trend"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    opinion: Mapped[str] = mapped_column(String(255), nullable=False)
    detail: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    price_at_fetch: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )
```

`backend/app/init_db.py`(コンテナ起動時に一度だけ実行し、テーブルを作成する。importするだけでDB接続する`main.py`とは分離し、テスト時に実DBへ接続されないようにする):
```python
from . import models  # noqa: F401  Trendをメタデータに登録するため
from .db import Base, engine


def main():
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    main()
```

`backend/app/main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="株価羅針盤 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: 実行して成功を確認**

Run: `cd backend && python -m pytest tests/test_main.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/app/__init__.py backend/app/db.py backend/app/models.py backend/app/init_db.py backend/app/main.py backend/tests/test_main.py
git commit -m "$(cat <<'EOF'
feat(backend): add FastAPI skeleton with health endpoint and Trend model

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: yfinance クライアント

**Files:**
- Create: `backend/app/yfinance_client.py`
- Test: `backend/tests/test_yfinance_client.py`

**Interfaces:**
- Consumes: `yfinance`パッケージ
- Produces: `app.yfinance_client.get_quote(code: str) -> dict`(`{"name": str, "price": float}`を返す)、`app.yfinance_client.InvalidCodeError`

- [ ] **Step 1: 失敗するテストを書く**

`backend/tests/test_yfinance_client.py`:
```python
import pytest

from app import yfinance_client


class FakeTicker:
    def __init__(self, info):
        self.info = info


def test_get_quote_returns_name_and_price(monkeypatch):
    monkeypatch.setattr(
        yfinance_client.yf,
        "Ticker",
        lambda symbol: FakeTicker({"longName": "トヨタ自動車", "currentPrice": 2914.0}),
    )

    quote = yfinance_client.get_quote("7203")

    assert quote == {"name": "トヨタ自動車", "price": 2914.0}


def test_get_quote_uses_tokyo_suffix_for_numeric_codes(monkeypatch):
    seen = {}

    def fake_ticker(symbol):
        seen["symbol"] = symbol
        return FakeTicker({"longName": "テスト", "currentPrice": 100.0})

    monkeypatch.setattr(yfinance_client.yf, "Ticker", fake_ticker)
    yfinance_client.get_quote("7203")

    assert seen["symbol"] == "7203.T"


def test_get_quote_raises_when_price_missing(monkeypatch):
    monkeypatch.setattr(
        yfinance_client.yf,
        "Ticker",
        lambda symbol: FakeTicker({"longName": "テスト"}),
    )

    with pytest.raises(yfinance_client.InvalidCodeError):
        yfinance_client.get_quote("9999")
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `cd backend && python -m pytest tests/test_yfinance_client.py -v`
Expected: FAIL(`ModuleNotFoundError: No module named 'app.yfinance_client'`)

- [ ] **Step 3: 実装**

`backend/app/yfinance_client.py`:
```python
import yfinance as yf


class InvalidCodeError(Exception):
    pass


def get_quote(code: str) -> dict:
    symbol = _to_yf_symbol(code)
    ticker = yf.Ticker(symbol)
    info = ticker.info
    price = info.get("currentPrice") or info.get("regularMarketPrice")
    name = info.get("longName") or info.get("shortName")
    if price is None or name is None:
        raise InvalidCodeError(code)
    return {"name": name, "price": float(price)}


def _to_yf_symbol(code: str) -> str:
    return f"{code}.T" if code.isdigit() else code
```

- [ ] **Step 4: 実行して成功を確認**

Run: `cd backend && python -m pytest tests/test_yfinance_client.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/yfinance_client.py backend/tests/test_yfinance_client.py
git commit -m "$(cat <<'EOF'
feat(backend): add yfinance client wrapper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: trend_service — 取得と一覧取得

**Files:**
- Create: `backend/app/trend_service.py`
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_trend_service.py`

**Interfaces:**
- Consumes: `app.models.Trend`、`app.yfinance_client.get_quote`、`InvalidCodeError`
- Produces: `app.trend_service.get_active_trend(db, code: str) -> Trend | None`、`create_trend(db, code: str) -> Trend`、`list_active_trends(db) -> list[Trend]`

- [ ] **Step 1: テスト用DBフィクスチャと失敗するテストを書く**

`backend/tests/conftest.py`:
```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models  # noqa: F401  Trendをメタデータに登録するため
from app.db import Base


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
```

`backend/tests/test_trend_service.py`:
```python
from app import trend_service


def test_create_trend_first_time(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.code == "7203"
    assert trend.name == "トヨタ自動車"
    assert trend.opinion == "初回取得、履歴データ無し"
    assert float(trend.price_at_fetch) == 2900.0


def test_create_trend_second_time_shows_diff_opinion(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2950.0}
    )
    second = trend_service.create_trend(db_session, "7203")

    assert "上昇傾向" in second.opinion
    assert "+1.7%" in second.opinion


def test_list_active_trends_returns_only_undeleted(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "テスト", "price": 100.0}
    )
    trend_service.create_trend(db_session, "0001")

    active = trend_service.list_active_trends(db_session)

    assert len(active) == 1
    assert active[0].code == "0001"
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `cd backend && python -m pytest tests/test_trend_service.py -v`
Expected: FAIL(`ModuleNotFoundError: No module named 'app.trend_service'`)

- [ ] **Step 3: 実装**

`backend/app/trend_service.py`:
```python
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .yfinance_client import get_quote


def get_active_trend(db: Session, code: str) -> models.Trend | None:
    stmt = (
        select(models.Trend)
        .where(models.Trend.code == code, models.Trend.deleted_at.is_(None))
        .order_by(models.Trend.created_at.desc())
    )
    return db.execute(stmt).scalars().first()


def list_active_trends(db: Session) -> list[models.Trend]:
    stmt = (
        select(models.Trend)
        .where(models.Trend.deleted_at.is_(None))
        .order_by(models.Trend.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def create_trend(db: Session, code: str) -> models.Trend:
    previous = get_active_trend(db, code)
    quote = get_quote(code)
    trend = models.Trend(
        code=code,
        name=quote["name"],
        opinion=_build_opinion(previous, quote["price"]),
        detail={},
        price_at_fetch=quote["price"],
    )
    db.add(trend)
    db.commit()
    db.refresh(trend)
    return trend


def _build_opinion(previous: models.Trend | None, price: float) -> str:
    if previous is None:
        return "初回取得、履歴データ無し"

    prev_price = float(previous.price_at_fetch)
    diff = price - prev_price
    pct = (diff / prev_price * 100) if prev_price else 0.0
    sign = "+" if diff >= 0 else ""

    if diff > 0:
        trend_word = "上昇傾向"
    elif diff < 0:
        trend_word = "下落傾向"
    else:
        trend_word = "横ばい"

    return f"前回取得比{sign}{pct:.1f}%、{trend_word}の可能性"
```

- [ ] **Step 4: 実行して成功を確認**

Run: `cd backend && python -m pytest tests/test_trend_service.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/trend_service.py backend/tests/conftest.py backend/tests/test_trend_service.py
git commit -m "$(cat <<'EOF'
feat(backend): add trend_service create/list with in-memory-friendly opinion text

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: trend_service — 更新間隔判定によるリフレッシュ

**Files:**
- Modify: `backend/app/trend_service.py`
- Test: `backend/tests/test_trend_service.py`

**Interfaces:**
- Consumes: Task4の`get_active_trend`
- Produces: `app.trend_service.INTERVAL_MINUTES: set[int]`(`{1, 5, 10, 15}`)、`refresh_trends(db, codes: list[str], interval_minutes: int) -> list[Trend]`(`ValueError`を無効なintervalで発生)

- [ ] **Step 1: 失敗するテストを追記**

`backend/tests/test_trend_service.py` に追記:
```python
from datetime import datetime, timedelta

import pytest


def test_refresh_skips_when_within_interval(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "テスト", "price": 100.0}
    )
    trend_service.create_trend(db_session, "0001")

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "テスト", "price": 200.0}
    )
    updated = trend_service.refresh_trends(db_session, ["0001"], 5)

    assert updated == []


def test_refresh_updates_when_interval_exceeded(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "テスト", "price": 100.0}
    )
    original = trend_service.create_trend(db_session, "0001")
    original.created_at = datetime.utcnow() - timedelta(minutes=10)
    db_session.commit()

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "テスト", "price": 120.0}
    )
    updated = trend_service.refresh_trends(db_session, ["0001"], 5)

    assert len(updated) == 1
    assert float(updated[0].price_at_fetch) == 120.0
    active = trend_service.list_active_trends(db_session)
    assert len(active) == 1
    assert float(active[0].price_at_fetch) == 120.0


def test_refresh_raises_on_invalid_interval(db_session):
    with pytest.raises(ValueError):
        trend_service.refresh_trends(db_session, [], 3)
```

(`from app import trend_service` は既存のimportをそのまま使う)

- [ ] **Step 2: 実行して失敗を確認**

Run: `cd backend && python -m pytest tests/test_trend_service.py -v`
Expected: FAIL(`AttributeError: module 'app.trend_service' has no attribute 'refresh_trends'`)

- [ ] **Step 3: 実装を追記**

`backend/app/trend_service.py` に追記(importに`datetime`, `timedelta`を追加):
```python
from datetime import datetime, timedelta

INTERVAL_MINUTES = {1, 5, 10, 15}


def refresh_trends(db: Session, codes: list[str], interval_minutes: int) -> list[models.Trend]:
    if interval_minutes not in INTERVAL_MINUTES:
        raise ValueError(f"invalid interval: {interval_minutes}")

    threshold = datetime.utcnow() - timedelta(minutes=interval_minutes)
    updated = []

    for code in codes:
        current = get_active_trend(db, code)
        if current is None or current.created_at > threshold:
            continue

        quote = get_quote(code)
        new_trend = models.Trend(
            code=code,
            name=quote["name"],
            opinion=_build_opinion(current, quote["price"]),
            detail={},
            price_at_fetch=quote["price"],
        )
        current.deleted_at = datetime.utcnow()
        db.add(new_trend)
        updated.append(new_trend)

    db.commit()
    for trend in updated:
        db.refresh(trend)
    return updated
```

- [ ] **Step 4: 実行して成功を確認**

Run: `cd backend && python -m pytest tests/test_trend_service.py -v`
Expected: PASS(6件全て)

- [ ] **Step 5: Commit**

```bash
git add backend/app/trend_service.py backend/tests/test_trend_service.py
git commit -m "$(cat <<'EOF'
feat(backend): add refresh_trends with interval-exceeded soft delete

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: trend_service — 削除(ソフトデリート)

**Files:**
- Modify: `backend/app/trend_service.py`
- Test: `backend/tests/test_trend_service.py`

**Interfaces:**
- Consumes: Task4の`get_active_trend`
- Produces: `app.trend_service.delete_trend(db, code: str) -> bool`

- [ ] **Step 1: 失敗するテストを追記**

`backend/tests/test_trend_service.py` に追記:
```python
def test_delete_trend_soft_deletes_active_row(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "テスト", "price": 100.0}
    )
    trend_service.create_trend(db_session, "0001")

    deleted = trend_service.delete_trend(db_session, "0001")

    assert deleted is True
    assert trend_service.list_active_trends(db_session) == []


def test_delete_trend_returns_false_when_not_found(db_session):
    assert trend_service.delete_trend(db_session, "9999") is False


def test_recreating_after_delete_shows_again(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "テスト", "price": 100.0}
    )
    trend_service.create_trend(db_session, "0001")
    trend_service.delete_trend(db_session, "0001")

    trend_service.create_trend(db_session, "0001")

    assert len(trend_service.list_active_trends(db_session)) == 1
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `cd backend && python -m pytest tests/test_trend_service.py -v`
Expected: FAIL(`AttributeError: module 'app.trend_service' has no attribute 'delete_trend'`)

- [ ] **Step 3: 実装を追記**

`backend/app/trend_service.py` に追記:
```python
def delete_trend(db: Session, code: str) -> bool:
    trend = get_active_trend(db, code)
    if trend is None:
        return False
    trend.deleted_at = datetime.utcnow()
    db.commit()
    return True
```

- [ ] **Step 4: 実行して成功を確認**

Run: `cd backend && python -m pytest tests/test_trend_service.py -v`
Expected: PASS(9件全て)

- [ ] **Step 5: Commit**

```bash
git add backend/app/trend_service.py backend/tests/test_trend_service.py
git commit -m "$(cat <<'EOF'
feat(backend): add delete_trend soft delete + recreate-after-delete coverage

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: API層(スキーマ + ルーター)

**Files:**
- Create: `backend/app/schemas.py`
- Create: `backend/app/routers/__init__.py`
- Create: `backend/app/routers/trends.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_trends_api.py`

**Interfaces:**
- Consumes: Task4〜6の`trend_service`関数群、`app.yfinance_client.InvalidCodeError`
- Produces: `GET /trends`、`POST /trends`(body: `{"code": str}`)、`POST /trends/refresh`(body: `{"codes": [str], "interval_minutes": int}`)、`DELETE /trends/{code}`

- [ ] **Step 1: 失敗するAPIテストを書く**

`backend/tests/test_trends_api.py`:
```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models, trend_service  # noqa: F401
from app.db import Base, get_db
from app.main import app
from app.yfinance_client import InvalidCodeError


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    test_session_local = sessionmaker(bind=engine)

    def override_get_db():
        db = test_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_add_trend_success(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )

    response = client.post("/trends", json={"code": "7203"})

    assert response.status_code == 201
    body = response.json()
    assert body["code"] == "7203"
    assert body["name"] == "トヨタ自動車"


def test_add_trend_invalid_code_returns_404(client, monkeypatch):
    def raise_invalid(code):
        raise InvalidCodeError(code)

    monkeypatch.setattr(trend_service, "get_quote", raise_invalid)

    response = client.post("/trends", json={"code": "0000"})

    assert response.status_code == 404
    assert "0000" in response.json()["detail"]


def test_list_trends_returns_active_only(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends")

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_delete_trend_not_found_returns_404(client):
    response = client.delete("/trends/9999")

    assert response.status_code == 404


def test_refresh_invalid_interval_returns_422(client):
    response = client.post("/trends/refresh", json={"codes": [], "interval_minutes": 3})

    assert response.status_code == 422
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `cd backend && python -m pytest tests/test_trends_api.py -v`
Expected: FAIL(`ModuleNotFoundError: No module named 'app.schemas'`)

- [ ] **Step 3: 実装**

`backend/app/schemas.py`:
```python
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TrendCreateRequest(BaseModel):
    code: str


class TrendOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    opinion: str
    price_at_fetch: float
    created_at: datetime


class RefreshRequest(BaseModel):
    codes: list[str]
    interval_minutes: int


class DeleteResponse(BaseModel):
    deleted: bool
```

`backend/app/routers/__init__.py`(空ファイル):
```python
```

`backend/app/routers/trends.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import trend_service
from ..db import get_db
from ..schemas import DeleteResponse, RefreshRequest, TrendCreateRequest, TrendOut
from ..yfinance_client import InvalidCodeError

router = APIRouter(prefix="/trends", tags=["trends"])


@router.get("", response_model=list[TrendOut])
def list_trends(db: Session = Depends(get_db)):
    return trend_service.list_active_trends(db)


@router.post("", response_model=TrendOut, status_code=201)
def add_trend(body: TrendCreateRequest, db: Session = Depends(get_db)):
    try:
        return trend_service.create_trend(db, body.code)
    except InvalidCodeError:
        raise HTTPException(
            status_code=404,
            detail=f"銘柄コード {body.code} のデータを取得できませんでした",
        )


@router.post("/refresh", response_model=list[TrendOut])
def refresh_trends(body: RefreshRequest, db: Session = Depends(get_db)):
    try:
        return trend_service.refresh_trends(db, body.codes, body.interval_minutes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.delete("/{code}", response_model=DeleteResponse)
def delete_trend(code: str, db: Session = Depends(get_db)):
    deleted = trend_service.delete_trend(db, code)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"銘柄コード {code} は見つかりません")
    return DeleteResponse(deleted=True)
```

`backend/app/main.py` を更新(ルーター登録を追加):
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import trends

app = FastAPI(title="株価羅針盤 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(trends.router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 4: 実行して成功を確認**

Run: `cd backend && python -m pytest tests/ -v`
Expected: PASS(全テスト)

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas.py backend/app/routers backend/app/main.py backend/tests/test_trends_api.py
git commit -m "$(cat <<'EOF'
feat(backend): wire trends API router (list/add/refresh/delete)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: バックエンドDockerfile + compose統合

**Files:**
- Create: `backend/Dockerfile`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: Task1の`db`サービス、Task2の`init_db.py`、Task7の`app.main.app`
- Produces: `backend`サービス(ポート8000、`/health`が200を返す)

- [ ] **Step 1: Dockerfileを作成**

`backend/Dockerfile`:
```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

CMD ["sh", "-c", "python -m app.init_db && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
```

- [ ] **Step 2: docker-compose.yml に backend サービスを追記**

`docker-compose.yml` の `services:` に追記:
```yaml
  backend:
    build: ./backend
    restart: unless-stopped
    environment:
      DATABASE_URL: mysql+pymysql://${MYSQL_USER:-trend}:${MYSQL_PASSWORD:-trend}@db:3306/${MYSQL_DATABASE:-trend_compass}
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
```

- [ ] **Step 3: 起動して疎通確認**

Run:
```bash
docker compose up -d --build db backend
curl -sf http://localhost:8000/health
```
Expected: `{"status":"ok"}`

- [ ] **Step 4: 銘柄取得の疎通確認(実際のyfinance呼出)**

Run: `curl -sf -X POST http://localhost:8000/trends -H "Content-Type: application/json" -d '{"code": "7203"}'`
Expected: 会社名・価格を含むJSONが返る(ネットワーク接続が必要)

- [ ] **Step 5: コンテナを停止**

Run: `docker compose down`

- [ ] **Step 6: Commit**

```bash
git add backend/Dockerfile docker-compose.yml
git commit -m "$(cat <<'EOF'
feat(infra): add backend Dockerfile and wire into docker-compose

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: フロントエンド骨格(Vite + React + TypeScript + vitest)

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/App.test.tsx`
- Create: `frontend/src/setupTests.ts`
- Create: `frontend/src/types.ts`
- Create: `frontend/Dockerfile`
- Modify: `docker-compose.yml`

**Interfaces:**
- Produces: `src/types.ts: Trend`インターフェース、`src/App.tsx`(最小のルーティング済みApp、後続タスクで拡張)、vitestの実行環境

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/App.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the app title", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "株価羅針盤" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 依存関係・設定ファイルを作成**

`frontend/package.json`:
```json
{
  "name": "trend-compass-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.9",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.2",
    "vite": "^5.4.7",
    "vitest": "^2.1.1"
  }
}
```

`frontend/vite.config.ts`:
```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    globals: true,
  },
});
```

`frontend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
```

`frontend/index.html`:
```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>株価羅針盤</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`frontend/src/setupTests.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

`frontend/src/types.ts`:
```ts
export interface Trend {
  id: number;
  code: string;
  name: string;
  opinion: string;
  price_at_fetch: number;
  created_at: string;
}
```

`frontend/src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

`frontend/src/App.tsx`(最小実装。一覧画面本体はTask14で組み込む):
```tsx
export default function App() {
  return (
    <main>
      <h1>株価羅針盤</h1>
    </main>
  );
}
```

- [ ] **Step 3: インストールしてテスト失敗を確認**

Run:
```bash
cd frontend
npm install
npx vitest run src/App.test.tsx
```
Expected: この時点ではPASSする(Appは既に最小実装済みのため)。もし依存関係インストール前に実行してエラーになった場合は`npm install`未実行が原因なので再実行する

- [ ] **Step 4: テスト実行**

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Dockerfileとcompose統合**

`frontend/Dockerfile`:
```dockerfile
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

`docker-compose.yml` の `services:` に追記:
```yaml
  frontend:
    build: ./frontend
    restart: unless-stopped
    environment:
      VITE_API_BASE_URL: http://localhost:8000
    ports:
      - "5173:5173"
    depends_on:
      - backend
```

- [ ] **Step 6: Commit**

```bash
git add frontend docker-compose.yml
git commit -m "$(cat <<'EOF'
feat(frontend): scaffold Vite/React/TypeScript app with vitest

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: APIクライアント

**Files:**
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/trends.ts`
- Test: `frontend/src/api/trends.test.ts`

**Interfaces:**
- Consumes: `src/types.ts: Trend`
- Produces: `apiRequest<T>(path, options) -> Promise<T>`、`fetchTrends() -> Promise<Trend[]>`、`addTrend(code: string) -> Promise<Trend>`、`refreshTrends(codes: string[], intervalMinutes: number) -> Promise<Trend[]>`、`deleteTrend(code: string) -> Promise<{deleted: boolean}>`

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/api/trends.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addTrend, deleteTrend, fetchTrends, refreshTrends } from "./trends";

describe("trends api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchTrends returns parsed list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 1,
            code: "7203",
            name: "トヨタ自動車",
            opinion: "初回取得、履歴データ無し",
            price_at_fetch: 2900,
            created_at: "2026-09-17T00:00:00Z",
          },
        ],
      })
    );

    const result = await fetchTrends();

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("7203");
  });

  it("addTrend posts code and returns created trend", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 1,
        code: "7203",
        name: "トヨタ自動車",
        opinion: "初回取得、履歴データ無し",
        price_at_fetch: 2900,
        created_at: "2026-09-17T00:00:00Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await addTrend("7203");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/trends"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: "7203" }),
      })
    );
  });

  it("throws with server detail message when request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: "銘柄コード 0000 のデータを取得できませんでした" }),
      })
    );

    await expect(addTrend("0000")).rejects.toThrow(
      "銘柄コード 0000 のデータを取得できませんでした"
    );
  });

  it("refreshTrends posts codes and interval", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await refreshTrends(["7203"], 5);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/trends/refresh"),
      expect.objectContaining({
        body: JSON.stringify({ codes: ["7203"], interval_minutes: 5 }),
      })
    );
  });

  it("deleteTrend sends DELETE to code endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ deleted: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deleteTrend("7203");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/trends/7203"),
      expect.objectContaining({ method: "DELETE" })
    );
    expect(result.deleted).toBe(true);
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `cd frontend && npx vitest run src/api/trends.test.ts`
Expected: FAIL(モジュールが存在しない)

- [ ] **Step 3: 実装**

`frontend/src/api/client.ts`:
```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.detail ?? `リクエストに失敗しました(status: ${response.status})`
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
```

`frontend/src/api/trends.ts`:
```ts
import type { Trend } from "../types";
import { apiRequest } from "./client";

export function fetchTrends(): Promise<Trend[]> {
  return apiRequest<Trend[]>("/trends");
}

export function addTrend(code: string): Promise<Trend> {
  return apiRequest<Trend>("/trends", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function refreshTrends(
  codes: string[],
  intervalMinutes: number
): Promise<Trend[]> {
  return apiRequest<Trend[]>("/trends/refresh", {
    method: "POST",
    body: JSON.stringify({ codes, interval_minutes: intervalMinutes }),
  });
}

export function deleteTrend(code: string): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(`/trends/${code}`, {
    method: "DELETE",
  });
}
```

- [ ] **Step 4: 実行して成功を確認**

Run: `cd frontend && npx vitest run src/api/trends.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api
git commit -m "$(cat <<'EOF'
feat(frontend): add trends API client

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: useWatchlist フック

**Files:**
- Create: `frontend/src/hooks/useWatchlist.ts`
- Test: `frontend/src/hooks/useWatchlist.test.ts`

**Interfaces:**
- Consumes: Task10の`fetchTrends/addTrend/refreshTrends/deleteTrend`、`Trend`型
- Produces: `INTERVAL_OPTIONS: readonly [1,5,10,15]`、`IntervalMinutes`型、`useWatchlist()`が返す`{ watchlist, selectedCodes, interval, error, setInterval, add, remove, refresh, toggleCode, toggleAll }`

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/hooks/useWatchlist.test.ts`:
```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as trendsApi from "../api/trends";
import { useWatchlist } from "./useWatchlist";

vi.mock("../api/trends");

const sampleTrend = {
  id: 1,
  code: "7203",
  name: "トヨタ自動車",
  opinion: "初回取得、履歴データ無し",
  price_at_fetch: 2900,
  created_at: "2026-09-17T00:00:00Z",
};

describe("useWatchlist", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([sampleTrend]);
  });

  it("loads watchlist on mount", async () => {
    const { result } = renderHook(() => useWatchlist());

    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));
    expect(result.current.watchlist[0].code).toBe("7203");
  });

  it("toggleCode adds and removes code from selection", async () => {
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    act(() => result.current.toggleCode("7203"));
    expect(result.current.selectedCodes.has("7203")).toBe(true);

    act(() => result.current.toggleCode("7203"));
    expect(result.current.selectedCodes.has("7203")).toBe(false);
  });

  it("toggleAll selects all then clears", async () => {
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    act(() => result.current.toggleAll());
    expect(result.current.selectedCodes.size).toBe(1);

    act(() => result.current.toggleAll());
    expect(result.current.selectedCodes.size).toBe(0);
  });

  it("add calls api and reloads watchlist", async () => {
    vi.mocked(trendsApi.addTrend).mockResolvedValue(sampleTrend);
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    await act(async () => {
      await result.current.add("7203");
    });

    expect(trendsApi.addTrend).toHaveBeenCalledWith("7203");
    expect(trendsApi.fetchTrends).toHaveBeenCalledTimes(2);
  });

  it("add sets error message on failure", async () => {
    vi.mocked(trendsApi.addTrend).mockRejectedValue(
      new Error("銘柄コード 0000 のデータを取得できませんでした")
    );
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    await act(async () => {
      await result.current.add("0000");
    });

    expect(result.current.error).toBe("銘柄コード 0000 のデータを取得できませんでした");
  });

  it("refresh sends selected codes and interval", async () => {
    vi.mocked(trendsApi.refreshTrends).mockResolvedValue([sampleTrend]);
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    act(() => result.current.toggleCode("7203"));
    await act(async () => {
      await result.current.refresh();
    });

    expect(trendsApi.refreshTrends).toHaveBeenCalledWith(["7203"], 1);
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `cd frontend && npx vitest run src/hooks/useWatchlist.test.ts`
Expected: FAIL(モジュールが存在しない)

- [ ] **Step 3: 実装**

`frontend/src/hooks/useWatchlist.ts`:
```ts
import { useCallback, useEffect, useState } from "react";
import { addTrend, deleteTrend, fetchTrends, refreshTrends } from "../api/trends";
import type { Trend } from "../types";

export const INTERVAL_OPTIONS = [1, 5, 10, 15] as const;
export type IntervalMinutes = (typeof INTERVAL_OPTIONS)[number];

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<Trend[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [interval, setInterval] = useState<IntervalMinutes>(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const trends = await fetchTrends();
    setWatchlist(trends);
  }, []);

  useEffect(() => {
    load().catch((err) => setError((err as Error).message));
  }, [load]);

  const add = useCallback(
    async (code: string) => {
      setError(null);
      try {
        await addTrend(code);
        await load();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [load]
  );

  const remove = useCallback(
    async (code: string) => {
      await deleteTrend(code);
      setSelectedCodes((prev) => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
      await load();
    },
    [load]
  );

  const refresh = useCallback(async () => {
    await refreshTrends(Array.from(selectedCodes), interval);
    await load();
  }, [selectedCodes, interval, load]);

  const toggleCode = useCallback((code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedCodes((prev) =>
      prev.size === watchlist.length ? new Set() : new Set(watchlist.map((t) => t.code))
    );
  }, [watchlist]);

  return {
    watchlist,
    selectedCodes,
    interval,
    error,
    setInterval,
    add,
    remove,
    refresh,
    toggleCode,
    toggleAll,
  };
}
```

- [ ] **Step 4: 実行して成功を確認**

Run: `cd frontend && npx vitest run src/hooks/useWatchlist.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks
git commit -m "$(cat <<'EOF'
feat(frontend): add useWatchlist hook for list/select/refresh/delete state

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: CodeInput / IntervalSelect コンポーネント

**Files:**
- Create: `frontend/src/components/CodeInput.tsx`
- Test: `frontend/src/components/CodeInput.test.tsx`
- Create: `frontend/src/components/IntervalSelect.tsx`
- Test: `frontend/src/components/IntervalSelect.test.tsx`

**Interfaces:**
- Consumes: Task11の`INTERVAL_OPTIONS`, `IntervalMinutes`
- Produces: `CodeInput({ onSubmit, error })`、`IntervalSelect({ interval, onChange, onRefresh })`

- [ ] **Step 1: 失敗するテストを書く(CodeInput)**

`frontend/src/components/CodeInput.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CodeInput } from "./CodeInput";

describe("CodeInput", () => {
  it("submits trimmed code and clears input", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CodeInput onSubmit={onSubmit} error={null} />);

    fireEvent.change(screen.getByLabelText("株式コード"), {
      target: { value: " 7203 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "取得" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("7203"));
    expect(screen.getByLabelText("株式コード")).toHaveValue("");
  });

  it("does not submit when code is empty", () => {
    const onSubmit = vi.fn();
    render(<CodeInput onSubmit={onSubmit} error={null} />);

    fireEvent.click(screen.getByRole("button", { name: "取得" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows inline error message under the input", () => {
    render(
      <CodeInput
        onSubmit={vi.fn()}
        error="銘柄コード 0000 のデータを取得できませんでした"
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "銘柄コード 0000 のデータを取得できませんでした"
    );
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `cd frontend && npx vitest run src/components/CodeInput.test.tsx`
Expected: FAIL(モジュールが存在しない)

- [ ] **Step 3: CodeInputを実装**

`frontend/src/components/CodeInput.tsx`:
```tsx
import { FormEvent, useState } from "react";

interface CodeInputProps {
  onSubmit: (code: string) => Promise<void>;
  error: string | null;
}

export function CodeInput({ onSubmit, error }: CodeInputProps) {
  const [code, setCode] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;
    await onSubmit(code.trim());
    setCode("");
  };

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="stock-code">株式コード</label>
      <input
        id="stock-code"
        value={code}
        placeholder="例: 7203"
        onChange={(e) => setCode(e.target.value)}
      />
      <button type="submit">取得</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: 実行して成功を確認**

Run: `cd frontend && npx vitest run src/components/CodeInput.test.tsx`
Expected: PASS

- [ ] **Step 5: 失敗するテストを書く(IntervalSelect)**

`frontend/src/components/IntervalSelect.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IntervalSelect } from "./IntervalSelect";

describe("IntervalSelect", () => {
  it("calls onChange with the selected interval as a number", () => {
    const onChange = vi.fn();
    render(<IntervalSelect interval={1} onChange={onChange} onRefresh={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("更新間隔"), { target: { value: "5" } });

    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("calls onRefresh when the update button is clicked", () => {
    const onRefresh = vi.fn();
    render(<IntervalSelect interval={1} onChange={vi.fn()} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole("button", { name: "更新" }));

    expect(onRefresh).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: 実行して失敗を確認**

Run: `cd frontend && npx vitest run src/components/IntervalSelect.test.tsx`
Expected: FAIL(モジュールが存在しない)

- [ ] **Step 7: IntervalSelectを実装**

`frontend/src/components/IntervalSelect.tsx`:
```tsx
import { INTERVAL_OPTIONS, IntervalMinutes } from "../hooks/useWatchlist";

interface IntervalSelectProps {
  interval: IntervalMinutes;
  onChange: (interval: IntervalMinutes) => void;
  onRefresh: () => void;
}

export function IntervalSelect({ interval, onChange, onRefresh }: IntervalSelectProps) {
  return (
    <div>
      <label htmlFor="refresh-interval">更新間隔</label>
      <select
        id="refresh-interval"
        value={interval}
        onChange={(e) => onChange(Number(e.target.value) as IntervalMinutes)}
      >
        {INTERVAL_OPTIONS.map((minutes) => (
          <option key={minutes} value={minutes}>
            {minutes}分
          </option>
        ))}
      </select>
      <button type="button" onClick={onRefresh}>
        更新
      </button>
    </div>
  );
}
```

- [ ] **Step 8: 実行して成功を確認**

Run: `cd frontend && npx vitest run src/components/CodeInput.test.tsx src/components/IntervalSelect.test.tsx`
Expected: PASS(両ファイル)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/CodeInput.tsx frontend/src/components/CodeInput.test.tsx frontend/src/components/IntervalSelect.tsx frontend/src/components/IntervalSelect.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): add CodeInput and IntervalSelect components

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: WatchlistTable / DetailPlaceholderPage + ルーティング

**Files:**
- Create: `frontend/src/components/WatchlistTable.tsx`
- Test: `frontend/src/components/WatchlistTable.test.tsx`
- Create: `frontend/src/components/DetailPlaceholderPage.tsx`
- Test: `frontend/src/components/DetailPlaceholderPage.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `Trend`型
- Produces: `WatchlistTable({ watchlist, selectedCodes, onToggleCode, onToggleAll, onDelete })`、`DetailPlaceholderPage`(ルートパラメータ`:code`を表示)、`App`のルート`/`と`/trends/:code`

- [ ] **Step 1: 失敗するテストを書く(WatchlistTable)**

`frontend/src/components/WatchlistTable.test.tsx`:
```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WatchlistTable } from "./WatchlistTable";

const trends = [
  {
    id: 1,
    code: "7203",
    name: "トヨタ自動車",
    opinion: "初回取得、履歴データ無し",
    price_at_fetch: 2900,
    created_at: "2026-09-17T00:00:00Z",
  },
  {
    id: 2,
    code: "6758",
    name: "ソニーグループ",
    opinion: "横ばい圏、方向感に乏しい",
    price_at_fetch: 3000,
    created_at: "2026-09-17T00:00:00Z",
  },
];

function renderTable(overrides = {}) {
  const props = {
    watchlist: trends,
    selectedCodes: new Set<string>(),
    onToggleCode: vi.fn(),
    onToggleAll: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <WatchlistTable {...props} />
    </MemoryRouter>
  );
  return props;
}

describe("WatchlistTable", () => {
  it("renders a row per trend with code, name, and opinion", () => {
    renderTable();

    expect(screen.getByText("7203")).toBeInTheDocument();
    expect(screen.getByText("トヨタ自動車")).toBeInTheDocument();
    expect(screen.getByText("初回取得、履歴データ無し")).toBeInTheDocument();
  });

  it("calls onToggleCode when a row checkbox is clicked", () => {
    const props = renderTable();

    fireEvent.click(screen.getByLabelText("7203を選択"));

    expect(props.onToggleCode).toHaveBeenCalledWith("7203");
  });

  it("calls onToggleAll when header checkbox is clicked", () => {
    const props = renderTable();

    fireEvent.click(screen.getByLabelText("全選択/全解除"));

    expect(props.onToggleAll).toHaveBeenCalled();
  });

  it("calls onDelete with the row's code", () => {
    const props = renderTable();

    fireEvent.click(screen.getAllByRole("button", { name: "削除" })[0]);

    expect(props.onDelete).toHaveBeenCalledWith("7203");
  });

  it("links the detail button to the trend's detail route", () => {
    renderTable();

    expect(screen.getAllByRole("link", { name: "詳細" })[0]).toHaveAttribute(
      "href",
      "/trends/7203"
    );
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `cd frontend && npx vitest run src/components/WatchlistTable.test.tsx`
Expected: FAIL(モジュールが存在しない)

- [ ] **Step 3: WatchlistTableを実装**

`frontend/src/components/WatchlistTable.tsx`:
```tsx
import { Link } from "react-router-dom";
import type { Trend } from "../types";

interface WatchlistTableProps {
  watchlist: Trend[];
  selectedCodes: Set<string>;
  onToggleCode: (code: string) => void;
  onToggleAll: () => void;
  onDelete: (code: string) => void;
}

export function WatchlistTable({
  watchlist,
  selectedCodes,
  onToggleCode,
  onToggleAll,
  onDelete,
}: WatchlistTableProps) {
  const allSelected = watchlist.length > 0 && selectedCodes.size === watchlist.length;

  return (
    <table>
      <thead>
        <tr>
          <th>
            <input
              type="checkbox"
              aria-label="全選択/全解除"
              checked={allSelected}
              onChange={onToggleAll}
            />
          </th>
          <th>株式コード</th>
          <th>会社名</th>
          <th>所見</th>
          <th />
          <th />
        </tr>
      </thead>
      <tbody>
        {watchlist.map((trend) => (
          <tr key={trend.code}>
            <td>
              <input
                type="checkbox"
                aria-label={`${trend.code}を選択`}
                checked={selectedCodes.has(trend.code)}
                onChange={() => onToggleCode(trend.code)}
              />
            </td>
            <td>{trend.code}</td>
            <td>{trend.name}</td>
            <td>{trend.opinion}</td>
            <td>
              <Link to={`/trends/${trend.code}`}>詳細</Link>
            </td>
            <td>
              <button type="button" onClick={() => onDelete(trend.code)}>
                削除
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: 実行して成功を確認**

Run: `cd frontend && npx vitest run src/components/WatchlistTable.test.tsx`
Expected: PASS

- [ ] **Step 5: 失敗するテストを書く(DetailPlaceholderPage)**

`frontend/src/components/DetailPlaceholderPage.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DetailPlaceholderPage } from "./DetailPlaceholderPage";

describe("DetailPlaceholderPage", () => {
  it("shows the code from the route and a back link", () => {
    render(
      <MemoryRouter initialEntries={["/trends/7203"]}>
        <Routes>
          <Route path="/trends/:code" element={<DetailPlaceholderPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "7203" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "一覧へ戻る" })).toHaveAttribute("href", "/");
  });
});
```

- [ ] **Step 6: 実行して失敗を確認**

Run: `cd frontend && npx vitest run src/components/DetailPlaceholderPage.test.tsx`
Expected: FAIL(モジュールが存在しない)

- [ ] **Step 7: DetailPlaceholderPageを実装**

`frontend/src/components/DetailPlaceholderPage.tsx`:
```tsx
import { Link, useParams } from "react-router-dom";

export function DetailPlaceholderPage() {
  const { code } = useParams<{ code: string }>();

  return (
    <main>
      <Link to="/">一覧へ戻る</Link>
      <h1>{code}</h1>
      <p>詳細画面は今後実装予定です。</p>
    </main>
  );
}
```

- [ ] **Step 8: 実行して成功を確認**

Run: `cd frontend && npx vitest run src/components/DetailPlaceholderPage.test.tsx`
Expected: PASS

- [ ] **Step 9: Appのルーティングを更新するテストを書く**

`frontend/src/App.test.tsx` を以下に置き換え:
```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import * as trendsApi from "./api/trends";

vi.mock("./api/trends");

describe("App routing", () => {
  it("renders the watchlist page at /", async () => {
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "株価羅針盤" })).toBeInTheDocument();
  });

  it("renders the detail placeholder at /trends/:code", () => {
    render(
      <MemoryRouter initialEntries={["/trends/7203"]}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "7203" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: 実行して失敗を確認**

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: FAIL(`/trends/:code`ルート未定義のため2件目が失敗)

- [ ] **Step 11: Appを更新**

`frontend/src/App.tsx`(WatchlistPageはTask14で作成するため、この時点では一時的に見出しのみのdivで代用しても良いが、Task14との整合のため先に import 文を書いておく):
```tsx
import { Route, Routes } from "react-router-dom";
import { DetailPlaceholderPage } from "./components/DetailPlaceholderPage";
import { WatchlistPage } from "./components/WatchlistPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WatchlistPage />} />
      <Route path="/trends/:code" element={<DetailPlaceholderPage />} />
    </Routes>
  );
}
```

Note: `./components/WatchlistPage` はTask14で作成する。このタスク単体ではimportエラーになるため、Step12はTask14完了後にまとめて確認する(Task13完了時点では`WatchlistTable`/`DetailPlaceholderPage`単体テストのPASSのみを完了条件とする)。

- [ ] **Step 12: Commit**

```bash
git add frontend/src/components/WatchlistTable.tsx frontend/src/components/WatchlistTable.test.tsx frontend/src/components/DetailPlaceholderPage.tsx frontend/src/components/DetailPlaceholderPage.test.tsx frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): add WatchlistTable, DetailPlaceholderPage, and route wiring

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: WatchlistPage 統合 + 最終疎通確認

**Files:**
- Create: `frontend/src/components/WatchlistPage.tsx`
- Test: `frontend/src/components/WatchlistPage.test.tsx`

**Interfaces:**
- Consumes: Task11の`useWatchlist`、Task12の`CodeInput`/`IntervalSelect`、Task13の`WatchlistTable`
- Produces: `WatchlistPage`(Task13で`App.tsx`に既に組み込み済み)

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/components/WatchlistPage.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as trendsApi from "../api/trends";
import { WatchlistPage } from "./WatchlistPage";

vi.mock("../api/trends");

const sampleTrend = {
  id: 1,
  code: "7203",
  name: "トヨタ自動車",
  opinion: "初回取得、履歴データ無し",
  price_at_fetch: 2900,
  created_at: "2026-09-17T00:00:00Z",
};

describe("WatchlistPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([]);
  });

  it("adds a code and shows it in the table", async () => {
    vi.mocked(trendsApi.addTrend).mockResolvedValue(sampleTrend);
    vi.mocked(trendsApi.fetchTrends)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([sampleTrend]);

    render(
      <MemoryRouter>
        <WatchlistPage />
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(screen.getByText("ウォッチリスト(0件)")).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText("株式コード"), {
      target: { value: "7203" },
    });
    fireEvent.click(screen.getByRole("button", { name: "取得" }));

    await waitFor(() => expect(screen.getByText("トヨタ自動車")).toBeInTheDocument());
    expect(trendsApi.addTrend).toHaveBeenCalledWith("7203");
  });

  it("shows inline error when adding an invalid code fails", async () => {
    vi.mocked(trendsApi.addTrend).mockRejectedValue(
      new Error("銘柄コード 0000 のデータを取得できませんでした")
    );

    render(
      <MemoryRouter>
        <WatchlistPage />
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(screen.getByText("ウォッチリスト(0件)")).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText("株式コード"), {
      target: { value: "0000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "取得" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "銘柄コード 0000 のデータを取得できませんでした"
      )
    );
  });

  it("deletes a trend and removes it from the table", async () => {
    vi.mocked(trendsApi.fetchTrends)
      .mockResolvedValueOnce([sampleTrend])
      .mockResolvedValueOnce([]);
    vi.mocked(trendsApi.deleteTrend).mockResolvedValue({ deleted: true });

    render(
      <MemoryRouter>
        <WatchlistPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("トヨタ自動車")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    await waitFor(() =>
      expect(screen.queryByText("トヨタ自動車")).not.toBeInTheDocument()
    );
    expect(trendsApi.deleteTrend).toHaveBeenCalledWith("7203");
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `cd frontend && npx vitest run src/components/WatchlistPage.test.tsx`
Expected: FAIL(モジュールが存在しない)

- [ ] **Step 3: WatchlistPageを実装**

`frontend/src/components/WatchlistPage.tsx`:
```tsx
import { useWatchlist } from "../hooks/useWatchlist";
import { CodeInput } from "./CodeInput";
import { IntervalSelect } from "./IntervalSelect";
import { WatchlistTable } from "./WatchlistTable";

export function WatchlistPage() {
  const {
    watchlist,
    selectedCodes,
    interval,
    error,
    setInterval,
    add,
    remove,
    refresh,
    toggleCode,
    toggleAll,
  } = useWatchlist();

  return (
    <main>
      <h1>株価羅針盤</h1>
      <CodeInput onSubmit={add} error={error} />
      <IntervalSelect interval={interval} onChange={setInterval} onRefresh={refresh} />
      <p>ウォッチリスト({watchlist.length}件)</p>
      <WatchlistTable
        watchlist={watchlist}
        selectedCodes={selectedCodes}
        onToggleCode={toggleCode}
        onToggleAll={toggleAll}
        onDelete={remove}
      />
    </main>
  );
}
```

- [ ] **Step 4: 実行して成功を確認**

Run: `cd frontend && npx vitest run src/components/WatchlistPage.test.tsx`
Expected: PASS

- [ ] **Step 5: フロントエンド全テストと、Task13で保留したApp.test.tsxを実行**

Run: `cd frontend && npx vitest run`
Expected: 全ファイルPASS(App.test.tsxもWatchlistPage実装完了により通るようになる)

- [ ] **Step 6: バックエンド全テストも再確認**

Run: `cd backend && python -m pytest tests/ -v`
Expected: 全件PASS

- [ ] **Step 7: docker composeで全体疎通確認(手動)**

Run:
```bash
docker compose up -d --build
curl -sf http://localhost:8000/health
```
その後ブラウザで `http://localhost:5173` を開き、以下を目視確認する:
- 株式コード(例: 7203)を入力して「取得」→一覧に会社名・所見が表示される
- チェックボックスを入れて「更新」→間隔未経過なら変化無し
- 「詳細」リンク→`/trends/7203`に遷移し「詳細画面は今後実装予定です。」が表示される
- 「一覧へ戻る」→一覧画面に戻る、チェック状態が保持されている
- 「削除」→一覧から消える。同コードを再度「取得」→復活する

完了後: `docker compose down`

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/WatchlistPage.tsx frontend/src/components/WatchlistPage.test.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): integrate WatchlistPage and complete watchlist MVP flow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** ゴール4項目(取得/一覧表示/更新/削除+復活)は各Task4・7・10-14で実装・テスト済み。対象外(詳細画面の内容・認証・テクニカル指標・ニュース)はTask13でプレースホルダーのみに留め、範囲を超えていない。
- **命名一貫性確認済み:** `get_active_trend` / `create_trend` / `list_active_trends` / `refresh_trends` / `delete_trend`(backend)、`fetchTrends` / `addTrend` / `refreshTrends` / `deleteTrend`(frontend)は全タスクで一致。`INTERVAL_MINUTES`(backend, 検証用set)と`INTERVAL_OPTIONS`(frontend, UI表示用tuple)は役割が異なるため意図的に別名。
- **プレースホルダー無し:** 各コード片は実際に動く内容で記述済み。
