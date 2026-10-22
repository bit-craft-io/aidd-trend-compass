# ポジション管理+グルーピング(機能A拡張) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一覧画面に、保有ポジション(預かり区分・購入金額・購入株数・損益)の入力/表示と、銘柄をグループ単位で整理する機能(作成・選択・絞込)を追加し、会社名をニックネーム(日本語名等)で表示できるようにする。

**Architecture:** 新規`trend_group`/`trend_price`テーブルを追加し、`trend`テーブルへ`nick_name`列を追加する。`trend_price`は`code`にUNIQUE制約を持ち、値変更は既存行へのUPDATEで行う(履歴保持しない)。損益はクライアント側で即時計算し、購入金額・購入株数・預かり区分・グループはblur/Enterで確定保存する。

**Tech Stack:** FastAPI, SQLAlchemy(backend) / React, TypeScript(frontend)

**Spec:** [docs/design/06-position-grouping.md](../../design/06-position-grouping.md)

## Global Constraints

- `trend_price`は`code`にUNIQUE制約。値の変更は既存行へのUPDATEで行い、`trend`テーブルのような履歴保持(行複製)はしない
- `trend_group`/`trend_price`はいずれもソフトデリート(`deleted_at`)。物理削除しない
- グループ削除時、紐付く`trend_price.trend_group_id`はデータ操作しない。一覧表示でグループが解決できない(ソフトデリート済み)場合はフロント側で「グループを選択」表示にフォールバックする
- `trend.nick_name`はyfinance等からの自動取得を実装しない(信頼できる情報源が無いため)。新規銘柄作成時は空文字、再取得(既存アクティブ銘柄の再POST)・更新(`/trends/refresh`)時は直前の値を引き継ぐ
- `trend_group_id`/`buy_category`等はFK制約を持たない。整合性はアプリ側で管理する
- DBスキーマはSQLAlchemyの`Base.metadata.create_all`のみで管理する(マイグレーションツール未導入)。既存の`trend`テーブルへの列追加は自動では反映されないため、ローカル環境は`docker compose down -v`でボリュームごと作り直す(個人用ローカル環境のため許容)
- コミットメッセージ末尾のtrailerは`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`の1行のみ

---

### Task 1: モデル追加(`trend.nick_name` / `TrendGroup` / `TrendPrice`)

**Files:**
- Modify: `backend/app/models.py`
- Test: `backend/tests/test_models.py`

**Interfaces:**
- Produces: `models.Trend.nick_name: str`(default `""`)、`models.TrendGroup`(`id`, `name`, `created_at`, `updated_at`, `deleted_at`)、`models.TrendPrice`(`id`, `code`(UNIQUE), `trend_group_id`, `buy_category`, `buy_price`, `buy_quantity`, `created_at`, `updated_at`, `deleted_at`)

- [ ] **Step 1: 失敗するテストを書く**

`backend/tests/test_models.py`を新規作成:

```python
from datetime import datetime

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_trend_nick_name_defaults_to_empty_string(db_session):
    trend = models.Trend(
        code="7203",
        name="Toyota Motor Corp",
        opinion="初回取得、履歴データ無し",
        detail={},
        price_at_fetch=2900.0,
    )
    db_session.add(trend)
    db_session.commit()
    db_session.refresh(trend)

    assert trend.nick_name == ""


def test_trend_group_soft_delete_round_trip(db_session):
    group = models.TrendGroup(name="成長株")
    db_session.add(group)
    db_session.commit()
    db_session.refresh(group)
    assert group.deleted_at is None

    group.deleted_at = datetime.utcnow()
    db_session.commit()
    db_session.refresh(group)
    assert group.deleted_at is not None


def test_trend_price_defaults(db_session):
    price = models.TrendPrice(code="7203")
    db_session.add(price)
    db_session.commit()
    db_session.refresh(price)

    assert price.trend_group_id is None
    assert price.buy_category == 0
    assert price.buy_price is None
    assert price.buy_quantity is None
    assert price.deleted_at is None


def test_trend_price_code_is_unique(db_session):
    db_session.add(models.TrendPrice(code="7203"))
    db_session.commit()

    db_session.add(models.TrendPrice(code="7203"))
    with pytest.raises(IntegrityError):
        db_session.commit()
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_models.py -v`
Expected: FAIL(`nick_name`未定義属性、`TrendGroup`/`TrendPrice`未定義)

- [ ] **Step 3: 実装**

`backend/app/models.py`の`Trend`クラス、`opinion`列の直後へ1行追加:

```python
    opinion: Mapped[str] = mapped_column(String(255), nullable=False)
    nick_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
```

同ファイルの末尾へ以下2クラスを追加:

```python
class TrendGroup(Base):
    __tablename__ = "trend_group"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )


class TrendPrice(Base):
    __tablename__ = "trend_price"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    trend_group_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, default=None)
    buy_category: Mapped[int] = mapped_column(nullable=False, default=0)
    buy_price: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True, default=None)
    buy_quantity: Mapped[int | None] = mapped_column(nullable=True, default=None)
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

- [ ] **Step 4: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_models.py -v`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd backend && git add app/models.py tests/test_models.py
git commit -m "feat(backend): add nick_name to Trend and add TrendGroup/TrendPrice models"
```

---

### Task 2: `trend_group_service.py` + `trend_price_service.py`(新規)

**Files:**
- Create: `backend/app/trend_group_service.py`
- Create: `backend/app/trend_price_service.py`
- Test: `backend/tests/test_trend_group_service.py`
- Test: `backend/tests/test_trend_price_service.py`

**Interfaces:**
- Produces(`trend_group_service`): `create_group(db, name: str) -> TrendGroup`、`list_active_groups(db) -> list[TrendGroup]`、`soft_delete_group(db, group_id: int) -> bool`
- Produces(`trend_price_service`): `get_price_row(db, code: str) -> TrendPrice | None`(deleted_at問わず)、`get_active_price(db, code: str) -> TrendPrice | None`(deleted_at IS NULLのみ)、`list_active_prices(db) -> list[TrendPrice]`、`upsert_price(db, code, *, trend_group_id, buy_category, buy_price, buy_quantity) -> TrendPrice`、`soft_delete_price(db, code: str) -> None`、`restore_price_if_exists(db, code: str) -> None`

- [ ] **Step 1: 失敗するテストを書く**

`backend/tests/test_trend_group_service.py`を新規作成:

```python
from app import trend_group_service


def test_create_group(db_session):
    group = trend_group_service.create_group(db_session, "成長株")

    assert group.id is not None
    assert group.name == "成長株"
    assert group.deleted_at is None


def test_list_active_groups_excludes_soft_deleted(db_session):
    trend_group_service.create_group(db_session, "成長株")
    to_delete = trend_group_service.create_group(db_session, "配当株")
    trend_group_service.soft_delete_group(db_session, to_delete.id)

    active = trend_group_service.list_active_groups(db_session)

    assert [g.name for g in active] == ["成長株"]


def test_soft_delete_group_returns_false_when_not_found(db_session):
    assert trend_group_service.soft_delete_group(db_session, 9999) is False


def test_soft_delete_group_returns_true_and_sets_deleted_at(db_session):
    group = trend_group_service.create_group(db_session, "成長株")

    result = trend_group_service.soft_delete_group(db_session, group.id)

    db_session.refresh(group)
    assert result is True
    assert group.deleted_at is not None
```

`backend/tests/test_trend_price_service.py`を新規作成:

```python
from app import trend_price_service


def test_upsert_price_creates_row_when_missing(db_session):
    price = trend_price_service.upsert_price(
        db_session,
        "7203",
        trend_group_id=None,
        buy_category=1,
        buy_price=2900.0,
        buy_quantity=100,
    )

    assert price.code == "7203"
    assert price.buy_category == 1
    assert float(price.buy_price) == 2900.0
    assert price.buy_quantity == 100


def test_upsert_price_updates_existing_row_without_creating_new_one(db_session):
    trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=None, buy_category=1, buy_price=2900.0, buy_quantity=100
    )

    updated = trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=None, buy_category=2, buy_price=3000.0, buy_quantity=50
    )

    all_rows = trend_price_service.list_active_prices(db_session)
    assert len(all_rows) == 1
    assert updated.buy_category == 2
    assert updated.buy_quantity == 50


def test_soft_delete_price_then_restore_reuses_same_row(db_session):
    created = trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=None, buy_category=1, buy_price=2900.0, buy_quantity=100
    )

    trend_price_service.soft_delete_price(db_session, "7203")
    assert trend_price_service.get_active_price(db_session, "7203") is None

    trend_price_service.restore_price_if_exists(db_session, "7203")
    restored = trend_price_service.get_active_price(db_session, "7203")

    assert restored is not None
    assert restored.id == created.id
    assert restored.buy_quantity == 100


def test_restore_price_if_exists_is_noop_when_no_row(db_session):
    trend_price_service.restore_price_if_exists(db_session, "9999")

    assert trend_price_service.get_active_price(db_session, "9999") is None


def test_soft_delete_price_is_noop_when_no_row(db_session):
    trend_price_service.soft_delete_price(db_session, "9999")

    assert trend_price_service.get_price_row(db_session, "9999") is None
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trend_group_service.py tests/test_trend_price_service.py -v`
Expected: FAIL(モジュール未定義)

- [ ] **Step 3: 実装**

`backend/app/trend_group_service.py`を新規作成:

```python
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models


def create_group(db: Session, name: str) -> models.TrendGroup:
    group = models.TrendGroup(name=name)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


def list_active_groups(db: Session) -> list[models.TrendGroup]:
    stmt = (
        select(models.TrendGroup)
        .where(models.TrendGroup.deleted_at.is_(None))
        .order_by(models.TrendGroup.created_at)
    )
    return list(db.execute(stmt).scalars().all())


def soft_delete_group(db: Session, group_id: int) -> bool:
    stmt = select(models.TrendGroup).where(
        models.TrendGroup.id == group_id, models.TrendGroup.deleted_at.is_(None)
    )
    group = db.execute(stmt).scalars().first()
    if group is None:
        return False
    group.deleted_at = datetime.utcnow()
    db.commit()
    return True
```

`backend/app/trend_price_service.py`を新規作成:

```python
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models


def get_price_row(db: Session, code: str) -> models.TrendPrice | None:
    stmt = select(models.TrendPrice).where(models.TrendPrice.code == code)
    return db.execute(stmt).scalars().first()


def get_active_price(db: Session, code: str) -> models.TrendPrice | None:
    stmt = select(models.TrendPrice).where(
        models.TrendPrice.code == code, models.TrendPrice.deleted_at.is_(None)
    )
    return db.execute(stmt).scalars().first()


def list_active_prices(db: Session) -> list[models.TrendPrice]:
    stmt = select(models.TrendPrice).where(models.TrendPrice.deleted_at.is_(None))
    return list(db.execute(stmt).scalars().all())


def upsert_price(
    db: Session,
    code: str,
    *,
    trend_group_id: int | None,
    buy_category: int,
    buy_price: float | None,
    buy_quantity: int | None,
) -> models.TrendPrice:
    price = get_price_row(db, code)
    if price is None:
        price = models.TrendPrice(code=code)
        db.add(price)
    price.trend_group_id = trend_group_id
    price.buy_category = buy_category
    price.buy_price = buy_price
    price.buy_quantity = buy_quantity
    price.deleted_at = None
    db.commit()
    db.refresh(price)
    return price


def soft_delete_price(db: Session, code: str) -> None:
    price = get_price_row(db, code)
    if price is None or price.deleted_at is not None:
        return
    price.deleted_at = datetime.utcnow()
    db.commit()


def restore_price_if_exists(db: Session, code: str) -> None:
    price = get_price_row(db, code)
    if price is None or price.deleted_at is None:
        return
    price.deleted_at = None
    db.commit()
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trend_group_service.py tests/test_trend_price_service.py -v`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd backend && git add app/trend_group_service.py app/trend_price_service.py tests/test_trend_group_service.py tests/test_trend_price_service.py
git commit -m "feat(backend): add trend_group_service and trend_price_service"
```

---

### Task 3: `trend_service.py`統合(ポジション情報の付加・delete/create連動)

**Files:**
- Modify: `backend/app/trend_service.py`
- Modify: `backend/tests/test_trend_service.py`

**Interfaces:**
- Consumes: `trend_price_service`(Task2)の全関数
- Produces: `list_watchlist(db) -> list[Trend]`(各`Trend`インスタンスへ`trend_group_id`/`buy_category`/`buy_price`/`buy_quantity`属性を付加)、`update_nick_name(db, code, nick_name) -> Trend | None`。既存`create_trend`/`delete_trend`/`refresh_trends`のシグネチャは無変更

- [ ] **Step 1: 失敗するテストを書く**

以下を`backend/tests/test_trend_service.py`の末尾へ追記する(ファイル冒頭は`from app import trend_service`・`import pytest`が既にある前提):

```python
def test_create_trend_carries_over_nick_name_when_recreating_active_code(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    first = trend_service.create_trend(db_session, "7203")
    first.nick_name = "トヨタ"
    db_session.commit()

    second = trend_service.create_trend(db_session, "7203")

    assert second.nick_name == "トヨタ"


def test_create_trend_restores_soft_deleted_trend_price(db_session, monkeypatch):
    from app import trend_price_service

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")
    trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=None, buy_category=1, buy_price=2900.0, buy_quantity=100
    )
    trend_service.delete_trend(db_session, "7203")
    assert trend_price_service.get_active_price(db_session, "7203") is None

    recreated = trend_service.create_trend(db_session, "7203")

    assert recreated.buy_quantity == 100
    assert trend_price_service.get_active_price(db_session, "7203") is not None


def test_delete_trend_soft_deletes_trend_price(db_session, monkeypatch):
    from app import trend_price_service

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")
    trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=None, buy_category=1, buy_price=2900.0, buy_quantity=100
    )

    trend_service.delete_trend(db_session, "7203")

    assert trend_price_service.get_active_price(db_session, "7203") is None
    assert trend_price_service.get_price_row(db_session, "7203") is not None


def test_list_watchlist_attaches_position_fields(db_session, monkeypatch):
    from app import trend_price_service

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")
    trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=5, buy_category=1, buy_price=2900.0, buy_quantity=100
    )

    watchlist = trend_service.list_watchlist(db_session)

    assert watchlist[0].trend_group_id == 5
    assert watchlist[0].buy_category == 1
    assert float(watchlist[0].buy_price) == 2900.0
    assert watchlist[0].buy_quantity == 100


def test_list_watchlist_defaults_position_fields_when_no_price_row(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")

    watchlist = trend_service.list_watchlist(db_session)

    assert watchlist[0].trend_group_id is None
    assert watchlist[0].buy_category == 0
    assert watchlist[0].buy_price is None
    assert watchlist[0].buy_quantity is None


def test_update_nick_name_updates_active_trend(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")

    updated = trend_service.update_nick_name(db_session, "7203", "トヨタ")

    assert updated.nick_name == "トヨタ"


def test_update_nick_name_returns_none_when_not_found(db_session):
    assert trend_service.update_nick_name(db_session, "9999", "x") is None
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trend_service.py -v`
Expected: FAIL(`list_watchlist`/`update_nick_name`未定義、nick_name引継ぎ未実装)

- [ ] **Step 3: 実装**

`backend/app/trend_service.py`のimport文に1行追加(`from .news_service import summarize_and_analyze`の直後):

```python
from . import trend_price_service
```

`create_trend`関数を以下で置き換える:

```python
def create_trend(db: Session, code: str) -> models.Trend:
    previous = get_active_trend(db, code)
    quote = get_quote(code)
    trend = models.Trend(
        code=code,
        name=quote["name"],
        nick_name=previous.nick_name if previous else "",
        opinion=_build_opinion(previous, quote["price"]),
        detail=_build_detail(code),
        price_at_fetch=quote["price"],
    )
    if previous is not None:
        previous.deleted_at = datetime.utcnow()
    db.add(trend)
    db.commit()
    db.refresh(trend)
    trend_price_service.restore_price_if_exists(db, code)
    price = trend_price_service.get_active_price(db, code)
    return _attach_price_fields(trend, price)
```

`_build_detail`関数の直前に以下のヘルパーを追加:

```python
def _attach_price_fields(trend: models.Trend, price: models.TrendPrice | None) -> models.Trend:
    trend.trend_group_id = price.trend_group_id if price else None
    trend.buy_category = price.buy_category if price else 0
    trend.buy_price = float(price.buy_price) if price and price.buy_price is not None else None
    trend.buy_quantity = price.buy_quantity if price else None
    return trend


def list_watchlist(db: Session) -> list[models.Trend]:
    trends = list_active_trends(db)
    prices_by_code = {p.code: p for p in trend_price_service.list_active_prices(db)}
    for trend in trends:
        _attach_price_fields(trend, prices_by_code.get(trend.code))
    return trends


def update_nick_name(db: Session, code: str, nick_name: str) -> models.Trend | None:
    trend = get_active_trend(db, code)
    if trend is None:
        return None
    trend.nick_name = nick_name
    db.commit()
    db.refresh(trend)
    price = trend_price_service.get_active_price(db, code)
    return _attach_price_fields(trend, price)
```

`refresh_trends`関数内、`new_trend = models.Trend(...)`のブロックを以下で置き換える:

```python
        new_trend = models.Trend(
            code=code,
            name=quote["name"],
            nick_name=current.nick_name,
            opinion=_build_opinion(current, quote["price"]),
            detail=detail or current.detail,
            price_at_fetch=quote["price"],
        )
        current.deleted_at = datetime.utcnow()
        price = trend_price_service.get_active_price(db, code)
        _attach_price_fields(new_trend, price)
```

`delete_trend`関数を以下で置き換える:

```python
def delete_trend(db: Session, code: str) -> bool:
    trend = get_active_trend(db, code)
    if trend is None:
        return False
    trend.deleted_at = datetime.utcnow()
    db.commit()
    trend_price_service.soft_delete_price(db, code)
    return True
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trend_service.py -v`
Expected: PASS

- [ ] **Step 5: バックエンド全テストを実行**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/ -v`
Expected: 全件PASS

- [ ] **Step 6: コミット**

```bash
cd backend && git add app/trend_service.py tests/test_trend_service.py
git commit -m "feat(backend): attach position fields to trends and wire trend_price to create/delete"
```

---

### Task 4: schemas.py + ルーター(nick_name更新・trend-groups・trend-prices)

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/trends.py`
- Create: `backend/app/routers/trend_groups.py`
- Create: `backend/app/routers/trend_prices.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_trends_api.py`
- Test: `backend/tests/test_trend_groups_api.py`
- Test: `backend/tests/test_trend_prices_api.py`

**Interfaces:**
- Consumes: `trend_service.list_watchlist`/`update_nick_name`(Task3)、`trend_group_service`/`trend_price_service`(Task2)
- Produces: `GET /trends`(拡張フィールド含む)、`PATCH /trends/{code}/nick_name`、`GET/POST /trend-groups`、`DELETE /trend-groups/{id}`、`PATCH /trend-prices/{code}`

- [ ] **Step 1: `schemas.py`を更新**

`TrendOut`クラスを以下で置き換える:

```python
class TrendOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    nick_name: str
    opinion: str
    price_at_fetch: float
    created_at: datetime
    trend_group_id: int | None = None
    buy_category: int = 0
    buy_price: float | None = None
    buy_quantity: int | None = None
```

`DeleteResponse`クラスの直後へ以下を追加:

```python
class NickNameUpdateRequest(BaseModel):
    nick_name: str


class TrendGroupCreateRequest(BaseModel):
    name: str


class TrendGroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class TrendPriceUpdateRequest(BaseModel):
    trend_group_id: int | None = None
    buy_category: int = 0
    buy_price: float | None = None
    buy_quantity: int | None = None


class TrendPriceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    trend_group_id: int | None
    buy_category: int
    buy_price: float | None
    buy_quantity: int | None
```

- [ ] **Step 2: `routers/trends.py`を更新**

`list_trends`関数を以下で置き換える:

```python
@router.get("", response_model=list[TrendOut])
def list_trends(db: Session = Depends(get_db)):
    return trend_service.list_watchlist(db)
```

`get_trend_detail`関数内の`TrendDetailOut(...)`呼び出しへ`nick_name=trend.nick_name,`を追加:

```python
    return TrendDetailOut(
        id=trend.id,
        code=trend.code,
        name=trend.name,
        nick_name=trend.nick_name,
        opinion=trend.opinion,
        price_at_fetch=trend.price_at_fetch,
        created_at=trend.created_at,
        detail=detail,
    )
```

import文を以下で置き換える:

```python
from ..schemas import (
    DeleteResponse,
    NickNameUpdateRequest,
    RefreshRequest,
    TrendCreateRequest,
    TrendDetailOut,
    TrendOut,
)
```

ファイル末尾へ以下を追加:

```python
@router.patch("/{code}/nick_name", response_model=TrendOut)
def update_trend_nick_name(
    code: str, body: NickNameUpdateRequest, db: Session = Depends(get_db)
):
    trend = trend_service.update_nick_name(db, code, body.nick_name)
    if trend is None:
        raise HTTPException(status_code=404, detail=f"銘柄コード {code} は見つかりません")
    return trend
```

- [ ] **Step 3: `routers/trend_groups.py`を新規作成**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import trend_group_service
from ..db import get_db
from ..schemas import DeleteResponse, TrendGroupCreateRequest, TrendGroupOut

router = APIRouter(prefix="/trend-groups", tags=["trend-groups"])


@router.get("", response_model=list[TrendGroupOut])
def list_trend_groups(db: Session = Depends(get_db)):
    return trend_group_service.list_active_groups(db)


@router.post("", response_model=TrendGroupOut, status_code=201)
def add_trend_group(body: TrendGroupCreateRequest, db: Session = Depends(get_db)):
    return trend_group_service.create_group(db, body.name)


@router.delete("/{group_id}", response_model=DeleteResponse)
def delete_trend_group(group_id: int, db: Session = Depends(get_db)):
    deleted = trend_group_service.soft_delete_group(db, group_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"グループID {group_id} は見つかりません")
    return DeleteResponse(deleted=True)
```

- [ ] **Step 4: `routers/trend_prices.py`を新規作成**

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import trend_price_service
from ..db import get_db
from ..schemas import TrendPriceOut, TrendPriceUpdateRequest

router = APIRouter(prefix="/trend-prices", tags=["trend-prices"])


@router.patch("/{code}", response_model=TrendPriceOut)
def update_trend_price(
    code: str, body: TrendPriceUpdateRequest, db: Session = Depends(get_db)
):
    return trend_price_service.upsert_price(
        db,
        code,
        trend_group_id=body.trend_group_id,
        buy_category=body.buy_category,
        buy_price=body.buy_price,
        buy_quantity=body.buy_quantity,
    )
```

- [ ] **Step 5: `main.py`を更新**

```python
from .routers import trend_groups, trend_prices, trends
```

`app.include_router(trends.router)`の直後へ追加:

```python
app.include_router(trend_groups.router)
app.include_router(trend_prices.router)
```

- [ ] **Step 6: 失敗するテストを書く**

以下を`backend/tests/test_trends_api.py`の末尾へ追記する:

```python
def test_list_trends_includes_position_fields(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends")

    body = response.json()[0]
    assert body["nick_name"] == ""
    assert body["trend_group_id"] is None
    assert body["buy_category"] == 0
    assert body["buy_price"] is None
    assert body["buy_quantity"] is None


def test_update_nick_name_success(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.patch("/trends/7203/nick_name", json={"nick_name": "トヨタ"})

    assert response.status_code == 200
    assert response.json()["nick_name"] == "トヨタ"


def test_update_nick_name_not_found_returns_404(client):
    response = client.patch("/trends/9999/nick_name", json={"nick_name": "x"})

    assert response.status_code == 404


def test_list_trends_still_returns_trend_after_its_group_is_soft_deleted(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})
    group_response = client.post("/trend-groups", json={"name": "成長株"})
    group_id = group_response.json()["id"]
    client.patch("/trend-prices/7203", json={"trend_group_id": group_id, "buy_category": 0, "buy_price": None, "buy_quantity": None})

    client.delete(f"/trend-groups/{group_id}")

    response = client.get("/trends")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["code"] == "7203"
    assert body[0]["trend_group_id"] == group_id  # データ自体は操作しない。フロント側で表示フォールバックする
```

`backend/tests/test_trend_groups_api.py`を新規作成:

```python
from app import trend_service


def test_create_and_list_trend_groups(client):
    create_response = client.post("/trend-groups", json={"name": "成長株"})
    assert create_response.status_code == 201

    list_response = client.get("/trend-groups")
    assert list_response.status_code == 200
    assert [g["name"] for g in list_response.json()] == ["成長株"]


def test_delete_trend_group_removes_from_active_list(client):
    create_response = client.post("/trend-groups", json={"name": "成長株"})
    group_id = create_response.json()["id"]

    delete_response = client.delete(f"/trend-groups/{group_id}")
    assert delete_response.status_code == 200
    assert delete_response.json() == {"deleted": True}

    list_response = client.get("/trend-groups")
    assert list_response.json() == []


def test_delete_trend_group_not_found_returns_404(client):
    response = client.delete("/trend-groups/9999")

    assert response.status_code == 404
```

`backend/tests/test_trend_prices_api.py`を新規作成:

```python
from app import trend_service


def test_update_trend_price_creates_row_when_missing(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.patch(
        "/trend-prices/7203",
        json={"trend_group_id": None, "buy_category": 1, "buy_price": 2900.0, "buy_quantity": 100},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == "7203"
    assert body["buy_category"] == 1
    assert float(body["buy_price"]) == 2900.0
    assert body["buy_quantity"] == 100


def test_update_trend_price_reflected_in_list_trends(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})
    client.patch(
        "/trend-prices/7203",
        json={"trend_group_id": None, "buy_category": 2, "buy_price": 2800.0, "buy_quantity": 10},
    )

    response = client.get("/trends")

    body = response.json()[0]
    assert body["buy_category"] == 2
    assert body["buy_quantity"] == 10
```

- [ ] **Step 7: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trends_api.py tests/test_trend_groups_api.py tests/test_trend_prices_api.py -v`
Expected: FAIL(実装前)

- [ ] **Step 8: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trends_api.py tests/test_trend_groups_api.py tests/test_trend_prices_api.py -v`
Expected: PASS

- [ ] **Step 9: バックエンド全テストを実行**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/ -v`
Expected: 全件PASS

- [ ] **Step 10: コミット**

```bash
cd backend && git add app/schemas.py app/routers/trends.py app/routers/trend_groups.py app/routers/trend_prices.py app/main.py tests/test_trends_api.py tests/test_trend_groups_api.py tests/test_trend_prices_api.py
git commit -m "feat(backend): add nick_name/trend-groups/trend-prices endpoints"
```

---

### Task 5: frontend `types.ts`更新 + 既存テストの型追従

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/components/DetailPage.test.tsx`

**Interfaces:**
- Produces: `Trend`(拡張: `nick_name`, `trend_group_id`, `buy_category`, `buy_price`, `buy_quantity`)、`TrendGroup`、`PositionInput`、`TrendPrice`

- [ ] **Step 1: `types.ts`を更新**

`Trend`インターフェースを以下で置き換える:

```typescript
export interface Trend {
  id: number;
  code: string;
  name: string;
  nick_name: string;
  opinion: string;
  price_at_fetch: number;
  created_at: string;
  trend_group_id: number | null;
  buy_category: number;
  buy_price: number | null;
  buy_quantity: number | null;
}

export interface TrendGroup {
  id: number;
  name: string;
}

export interface PositionInput {
  trend_group_id: number | null;
  buy_category: number;
  buy_price: number | null;
  buy_quantity: number | null;
}

export interface TrendPrice extends PositionInput {
  code: string;
}
```

- [ ] **Step 2: `App.test.tsx`のサンプルオブジェクトを更新**

`fetchTrendDetail`のモック戻り値オブジェクトへ以下5フィールドを追加する(既存の`opinion`行の直後、`detail: {}`の直前):

```typescript
      nick_name: "",
      trend_group_id: null,
      buy_category: 0,
      buy_price: null,
      buy_quantity: null,
```

- [ ] **Step 3: `DetailPage.test.tsx`の`sampleDetail`を更新**

`sampleDetail`オブジェクトの`opinion`行の直後へ同じ5フィールドを追加する:

```typescript
  nick_name: "",
  trend_group_id: null,
  buy_category: 0,
  buy_price: null,
  buy_quantity: null,
```

- [ ] **Step 4: 型チェック**

Run: `cd frontend && npx tsc --noEmit`
Expected: `WatchlistTable.test.tsx`/`WatchlistPage.test.tsx`/`useWatchlist.test.ts`はTask10/9で対応するため、この時点ではそれらのファイルでエラーが出ていてよい。`App.test.tsx`/`DetailPage.test.tsx`/`types.ts`自体にはエラーが無いことを確認する

- [ ] **Step 5: コミット**

```bash
cd frontend && git add src/types.ts src/App.test.tsx src/components/DetailPage.test.tsx
git commit -m "feat(frontend): extend Trend type with nick_name and position fields"
```

---

### Task 6: frontend API クライアント(`updateNickName` / `trendGroups.ts` / `trendPrices.ts`)

**Files:**
- Modify: `frontend/src/api/trends.ts`
- Create: `frontend/src/api/trendGroups.ts`
- Create: `frontend/src/api/trendPrices.ts`
- Test: `frontend/src/api/trendGroups.test.ts`
- Test: `frontend/src/api/trendPrices.test.ts`
- Modify: `frontend/src/api/trends.test.ts`

**Interfaces:**
- Consumes: `PositionInput`/`TrendGroup`/`TrendPrice`(Task5)
- Produces: `updateNickName(code, nickName) -> Promise<Trend>`、`fetchTrendGroups() -> Promise<TrendGroup[]>`、`createTrendGroup(name) -> Promise<TrendGroup>`、`deleteTrendGroup(id) -> Promise<{deleted: boolean}>`、`updateTrendPrice(code, position) -> Promise<TrendPrice>`

- [ ] **Step 1: 失敗するテストを書く**

以下を`frontend/src/api/trends.test.ts`の末尾(`describe`ブロックの閉じ括弧の直前)へ追記する:

```typescript
  it("updateNickName sends PATCH with nick_name", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 1, code: "7203", nick_name: "トヨタ" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateNickName("7203", "トヨタ");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/trends/7203/nick_name"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ nick_name: "トヨタ" }),
      })
    );
  });
```

インポート文を以下で置き換える:

```typescript
import { addTrend, deleteTrend, fetchTrendDetail, fetchTrends, refreshTrends, updateNickName } from "./trends";
```

`frontend/src/api/trendGroups.test.ts`を新規作成:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTrendGroup, deleteTrendGroup, fetchTrendGroups } from "./trendGroups";

describe("trendGroups api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchTrendGroups returns parsed list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [{ id: 1, name: "成長株" }],
      })
    );

    const result = await fetchTrendGroups();

    expect(result).toEqual([{ id: 1, name: "成長株" }]);
  });

  it("createTrendGroup posts name", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 1, name: "成長株" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createTrendGroup("成長株");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/trend-groups"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "成長株" }) })
    );
  });

  it("deleteTrendGroup sends DELETE to id endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ deleted: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deleteTrendGroup(1);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/trend-groups/1"),
      expect.objectContaining({ method: "DELETE" })
    );
    expect(result.deleted).toBe(true);
  });
});
```

`frontend/src/api/trendPrices.test.ts`を新規作成:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateTrendPrice } from "./trendPrices";

describe("trendPrices api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("updateTrendPrice sends PATCH with position payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: "7203", trend_group_id: null, buy_category: 1, buy_price: 2900, buy_quantity: 100 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateTrendPrice("7203", {
      trend_group_id: null,
      buy_category: 1,
      buy_price: 2900,
      buy_quantity: 100,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/trend-prices/7203"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ trend_group_id: null, buy_category: 1, buy_price: 2900, buy_quantity: 100 }),
      })
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/api/trends.test.ts src/api/trendGroups.test.ts src/api/trendPrices.test.ts`
Expected: FAIL(`updateNickName`/モジュール未定義)

- [ ] **Step 3: 実装**

`frontend/src/api/trends.ts`の末尾へ追加:

```typescript
export function updateNickName(code: string, nickName: string): Promise<Trend> {
  return apiRequest<Trend>(`/trends/${code}/nick_name`, {
    method: "PATCH",
    body: JSON.stringify({ nick_name: nickName }),
  });
}
```

`frontend/src/api/trendGroups.ts`を新規作成:

```typescript
import type { TrendGroup } from "../types";
import { apiRequest } from "./client";

export function fetchTrendGroups(): Promise<TrendGroup[]> {
  return apiRequest<TrendGroup[]>("/trend-groups");
}

export function createTrendGroup(name: string): Promise<TrendGroup> {
  return apiRequest<TrendGroup>("/trend-groups", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function deleteTrendGroup(groupId: number): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(`/trend-groups/${groupId}`, {
    method: "DELETE",
  });
}
```

`frontend/src/api/trendPrices.ts`を新規作成:

```typescript
import type { PositionInput, TrendPrice } from "../types";
import { apiRequest } from "./client";

export function updateTrendPrice(code: string, position: PositionInput): Promise<TrendPrice> {
  return apiRequest<TrendPrice>(`/trend-prices/${code}`, {
    method: "PATCH",
    body: JSON.stringify(position),
  });
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd frontend && npx vitest run src/api/trends.test.ts src/api/trendGroups.test.ts src/api/trendPrices.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd frontend && git add src/api/trends.ts src/api/trends.test.ts src/api/trendGroups.ts src/api/trendGroups.test.ts src/api/trendPrices.ts src/api/trendPrices.test.ts
git commit -m "feat(frontend): add updateNickName, trendGroups and trendPrices api clients"
```

---

### Task 7: `index.css`トークン・クラス追加

**Files:**
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces: `.amount-input`, `.group-select`, `.nick-name-input`, `.pnl-plus`, `.pnl-minus`, `.opinion`, `.btn-outline-danger`

- [ ] **Step 1: `:root`ブロックへトークン追加**

`--pill-neutral-text: #55606e;`の直後へ追加:

```css
  --btn-outline-danger-border: #cf3d3d;
  --btn-outline-danger-text: #cf3d3d;
  --btn-outline-danger-hover-bg: #fbe7e7;
```

`:root[data-theme="dark"]`ブロックの`--pill-neutral-text: #9aa3b2;`の直後へ追加:

```css
  --btn-outline-danger-border: #ff8a8a;
  --btn-outline-danger-text: #ff8a8a;
  --btn-outline-danger-hover-bg: #3a1f22;
```

- [ ] **Step 2: クラス追加**

`.watchlist-table .actions-col { width: 90px; }`の直後へ追加:

```css
.amount-input {
  width: 100px;
  padding: 6px 8px;
  border: 1px solid var(--input-border);
  background: var(--input-bg);
  color: var(--text);
  border-radius: 4px;
  font-size: 13px;
  text-align: right;
}

.group-select {
  padding: 6px 8px;
  border: 1px solid var(--input-border);
  background: var(--input-bg);
  color: var(--text);
  border-radius: 4px;
  font-size: 13px;
  max-width: 140px;
}

.nick-name-input {
  width: 100%;
  min-width: 140px;
  padding: 6px 8px;
  border: 1px solid var(--input-border);
  background: var(--input-bg);
  color: var(--text);
  border-radius: 4px;
  font-size: 13px;
}

.pnl-plus {
  font-weight: 700;
  color: var(--pill-green-text);
}

.pnl-minus {
  font-weight: 700;
  color: var(--pill-red-text);
}

.opinion {
  color: var(--text-muted);
  margin-left: 6px;
  font-size: 12px;
}

.btn-outline-danger {
  background: transparent;
  border: 1px solid var(--btn-outline-danger-border);
  color: var(--btn-outline-danger-text);
}

.btn-outline-danger:hover {
  background: var(--btn-outline-danger-hover-bg);
}
```

- [ ] **Step 3: フロントエンド全テスト+型チェック**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: CSSのみの変更のため既存テスト結果に影響無し(Task5時点の既知の型エラーは残ったままでよい)

- [ ] **Step 4: コミット**

```bash
cd frontend && git add src/index.css
git commit -m "feat(frontend): add position/group UI tokens to index.css"
```

---

### Task 8: `useTrendGroups.ts`(新規)

**Files:**
- Create: `frontend/src/hooks/useTrendGroups.ts`
- Test: `frontend/src/hooks/useTrendGroups.test.ts`

**Interfaces:**
- Consumes: `fetchTrendGroups`/`createTrendGroup`/`deleteTrendGroup`(Task6)
- Produces: `useTrendGroups() -> { groups: TrendGroup[], error: string | null, create: (name: string) => Promise<void>, remove: (id: number) => Promise<void> }`

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/hooks/useTrendGroups.test.ts`を新規作成:

```typescript
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as trendGroupsApi from "../api/trendGroups";
import { useTrendGroups } from "./useTrendGroups";

vi.mock("../api/trendGroups");

const sampleGroup = { id: 1, name: "成長株" };

describe("useTrendGroups", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(trendGroupsApi.fetchTrendGroups).mockResolvedValue([sampleGroup]);
  });

  it("loads groups on mount", async () => {
    const { result } = renderHook(() => useTrendGroups());

    await waitFor(() => expect(result.current.groups).toHaveLength(1));
    expect(result.current.groups[0].name).toBe("成長株");
  });

  it("create calls api and reloads groups", async () => {
    vi.mocked(trendGroupsApi.createTrendGroup).mockResolvedValue(sampleGroup);
    const { result } = renderHook(() => useTrendGroups());
    await waitFor(() => expect(result.current.groups).toHaveLength(1));

    await act(async () => {
      await result.current.create("成長株");
    });

    expect(trendGroupsApi.createTrendGroup).toHaveBeenCalledWith("成長株");
    expect(trendGroupsApi.fetchTrendGroups).toHaveBeenCalledTimes(2);
  });

  it("remove calls api and reloads groups", async () => {
    vi.mocked(trendGroupsApi.deleteTrendGroup).mockResolvedValue({ deleted: true });
    const { result } = renderHook(() => useTrendGroups());
    await waitFor(() => expect(result.current.groups).toHaveLength(1));

    await act(async () => {
      await result.current.remove(1);
    });

    expect(trendGroupsApi.deleteTrendGroup).toHaveBeenCalledWith(1);
    expect(trendGroupsApi.fetchTrendGroups).toHaveBeenCalledTimes(2);
  });

  it("create sets error message on failure", async () => {
    vi.mocked(trendGroupsApi.createTrendGroup).mockRejectedValue(new Error("作成に失敗しました"));
    const { result } = renderHook(() => useTrendGroups());
    await waitFor(() => expect(result.current.groups).toHaveLength(1));

    await act(async () => {
      await result.current.create("x");
    });

    expect(result.current.error).toBe("作成に失敗しました");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/hooks/useTrendGroups.test.ts`
Expected: FAIL(モジュール未定義)

- [ ] **Step 3: 実装**

`frontend/src/hooks/useTrendGroups.ts`を新規作成:

```typescript
import { useCallback, useEffect, useState } from "react";
import { createTrendGroup, deleteTrendGroup, fetchTrendGroups } from "../api/trendGroups";
import type { TrendGroup } from "../types";

export function useTrendGroups() {
  const [groups, setGroups] = useState<TrendGroup[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchTrendGroups();
    setGroups(result);
  }, []);

  useEffect(() => {
    load().catch((err) => setError((err as Error).message));
  }, [load]);

  const create = useCallback(
    async (name: string) => {
      setError(null);
      try {
        await createTrendGroup(name);
        await load();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [load]
  );

  const remove = useCallback(
    async (groupId: number) => {
      setError(null);
      try {
        await deleteTrendGroup(groupId);
        await load();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [load]
  );

  return { groups, error, create, remove };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd frontend && npx vitest run src/hooks/useTrendGroups.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd frontend && git add src/hooks/useTrendGroups.ts src/hooks/useTrendGroups.test.ts
git commit -m "feat(frontend): add useTrendGroups hook"
```

---

### Task 9: `useWatchlist.ts`拡張(グループ絞込・ニックネーム/ポジション保存)

**Files:**
- Modify: `frontend/src/hooks/useWatchlist.ts`
- Modify: `frontend/src/hooks/useWatchlist.test.ts`

**Interfaces:**
- Consumes: `updateNickName`(Task6)、`updateTrendPrice`(Task6)
- Produces: 既存の戻り値に`groupFilter: number | null`、`setGroupFilter`、`saveNickName(code, nickName)`、`savePosition(code, position)`を追加。`watchlist`はグループ絞込後の配列を返す

- [ ] **Step 1: 既存`useWatchlist.test.ts`の`sampleTrend`を更新**

`sampleTrend`オブジェクトへ以下5フィールドを追加する(`opinion`行の直後):

```typescript
  nick_name: "",
  trend_group_id: null,
  buy_category: 0,
  buy_price: null,
  buy_quantity: null,
```

- [ ] **Step 2: 失敗するテストを書く**

以下を`frontend/src/hooks/useWatchlist.test.ts`の末尾(`describe`ブロックの閉じ括弧の直前)へ追記する。ファイル冒頭のimportを以下で置き換える:

```typescript
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as trendsApi from "../api/trends";
import * as trendPricesApi from "../api/trendPrices";
import { useWatchlist } from "./useWatchlist";

vi.mock("../api/trends");
vi.mock("../api/trendPrices");
```

追記するテスト:

```typescript
  it("saveNickName calls api and reloads watchlist", async () => {
    vi.mocked(trendsApi.updateNickName).mockResolvedValue({ ...sampleTrend, nick_name: "トヨタ" });
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    await act(async () => {
      await result.current.saveNickName("7203", "トヨタ");
    });

    expect(trendsApi.updateNickName).toHaveBeenCalledWith("7203", "トヨタ");
    expect(trendsApi.fetchTrends).toHaveBeenCalledTimes(2);
  });

  it("savePosition calls api and reloads watchlist", async () => {
    vi.mocked(trendPricesApi.updateTrendPrice).mockResolvedValue({
      code: "7203",
      trend_group_id: null,
      buy_category: 1,
      buy_price: 2900,
      buy_quantity: 100,
    });
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    await act(async () => {
      await result.current.savePosition("7203", {
        trend_group_id: null,
        buy_category: 1,
        buy_price: 2900,
        buy_quantity: 100,
      });
    });

    expect(trendPricesApi.updateTrendPrice).toHaveBeenCalledWith("7203", {
      trend_group_id: null,
      buy_category: 1,
      buy_price: 2900,
      buy_quantity: 100,
    });
    expect(trendsApi.fetchTrends).toHaveBeenCalledTimes(2);
  });

  it("setGroupFilter narrows watchlist to the matching group", async () => {
    const grouped = { ...sampleTrend, code: "6758", trend_group_id: 5 };
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([sampleTrend, grouped]);
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(2));

    act(() => result.current.setGroupFilter(5));

    expect(result.current.watchlist).toEqual([grouped]);
  });
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/hooks/useWatchlist.test.ts`
Expected: FAIL(`saveNickName`/`savePosition`/`setGroupFilter`未定義)

- [ ] **Step 4: 実装**

`frontend/src/hooks/useWatchlist.ts`のimport文を以下で置き換える:

```typescript
import { useCallback, useEffect, useState } from "react";
import { addTrend, deleteTrend, fetchTrends, refreshTrends, updateNickName } from "../api/trends";
import { updateTrendPrice } from "../api/trendPrices";
import type { PositionInput, Trend } from "../types";
```

`toggleAll`関数の直後、`return { ... }`の直前へ以下を追加:

```typescript
  const [groupFilter, setGroupFilter] = useState<number | null>(null);

  const saveNickName = useCallback(
    async (code: string, nickName: string) => {
      setError(null);
      try {
        await updateNickName(code, nickName);
        await load();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [load]
  );

  const savePosition = useCallback(
    async (code: string, position: PositionInput) => {
      setError(null);
      try {
        await updateTrendPrice(code, position);
        await load();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [load]
  );

  const filteredWatchlist =
    groupFilter === null ? watchlist : watchlist.filter((t) => t.trend_group_id === groupFilter);
```

`[groupFilter, setGroupFilter]`は`useState`呼び出し位置の都合上、既存の`const [error, setError] = useState<string | null>(null);`の直後に移動して定義する(上記コードのうち`const [groupFilter, ...] = useState(...)`行のみをその位置へ配置し、`saveNickName`以降はそのまま`toggleAll`の直後に置く)。

`return`文を以下で置き換える:

```typescript
  return {
    watchlist: filteredWatchlist,
    selectedCodes,
    interval,
    groupFilter,
    error,
    setInterval,
    setGroupFilter,
    add,
    remove,
    refresh,
    toggleCode,
    toggleAll,
    saveNickName,
    savePosition,
  };
```

- [ ] **Step 5: テストが通ることを確認**

Run: `cd frontend && npx vitest run src/hooks/useWatchlist.test.ts`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
cd frontend && git add src/hooks/useWatchlist.ts src/hooks/useWatchlist.test.ts
git commit -m "feat(frontend): add group filter and position/nick_name save to useWatchlist"
```

---

### Task 10: `WatchlistRow.tsx`(新規) + `WatchlistTable.tsx`書き換え

**Files:**
- Create: `frontend/src/components/WatchlistRow.tsx`
- Modify: `frontend/src/components/WatchlistTable.tsx`
- Modify: `frontend/src/components/WatchlistTable.test.tsx`

**Interfaces:**
- Consumes: `PositionInput`/`TrendGroup`(Task5)
- Produces: `<WatchlistRow trend groups selected onToggleCode onDelete onSaveNickName onSavePosition />`、`<WatchlistTable watchlist groups selectedCodes onToggleCode onToggleAll onDelete onSaveNickName onSavePosition />`

- [ ] **Step 1: `WatchlistTable.test.tsx`を書き換える**

ファイル全体を以下で置き換える:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WatchlistTable } from "./WatchlistTable";

const trends = [
  {
    id: 1,
    code: "7203",
    name: "Toyota Motor Corp",
    nick_name: "",
    opinion: "初回取得、履歴データ無し",
    price_at_fetch: 2900,
    created_at: "2026-09-17T00:00:00Z",
    trend_group_id: null,
    buy_category: 0,
    buy_price: null,
    buy_quantity: null,
  },
  {
    id: 2,
    code: "6758",
    name: "Sony Group Corp",
    nick_name: "ソニーグループ",
    opinion: "横ばい圏、方向感に乏しい",
    price_at_fetch: 3000,
    created_at: "2026-09-17T00:00:00Z",
    trend_group_id: 1,
    buy_category: 1,
    buy_price: 2530,
    buy_quantity: 50,
  },
];

const groups = [{ id: 1, name: "テック株" }];

function renderTable(overrides = {}) {
  const props = {
    watchlist: trends,
    groups,
    selectedCodes: new Set<string>(),
    onToggleCode: vi.fn(),
    onToggleAll: vi.fn(),
    onDelete: vi.fn(),
    onSaveNickName: vi.fn(),
    onSavePosition: vi.fn(),
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
  it("renders a row per trend with code, price, and opinion", () => {
    renderTable();

    expect(screen.getByText("7203")).toBeInTheDocument();
    expect(screen.getByText("¥2,900")).toBeInTheDocument();
    expect(screen.getByText("初回取得、履歴データ無し")).toBeInTheDocument();
  });

  it("shows nick_name as the company name input value, falling back to name as placeholder", () => {
    renderTable();

    expect(screen.getByLabelText("6758の会社名")).toHaveValue("ソニーグループ");
    expect(screen.getByLabelText("7203の会社名")).toHaveAttribute("placeholder", "Toyota Motor Corp");
  });

  it("calls onSaveNickName on blur when the value changed", () => {
    const props = renderTable();

    const input = screen.getByLabelText("7203の会社名");
    fireEvent.change(input, { target: { value: "トヨタ" } });
    fireEvent.blur(input);

    expect(props.onSaveNickName).toHaveBeenCalledWith("7203", "トヨタ");
  });

  it("does not call onSaveNickName on blur when the value is unchanged", () => {
    const props = renderTable();

    const input = screen.getByLabelText("6758の会社名");
    fireEvent.blur(input);

    expect(props.onSaveNickName).not.toHaveBeenCalled();
  });

  it("calls onSavePosition with full position payload when buy_price is edited", () => {
    const props = renderTable();

    const input = screen.getByLabelText("7203の購入金額");
    fireEvent.change(input, { target: { value: "2900" } });
    fireEvent.blur(input);

    expect(props.onSavePosition).toHaveBeenCalledWith("7203", {
      trend_group_id: null,
      buy_category: 0,
      buy_price: 2900,
      buy_quantity: null,
    });
  });

  it("Enter key on buy_quantity input triggers blur-save", () => {
    const props = renderTable();

    const input = screen.getByLabelText("7203の購入株数");
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onSavePosition).toHaveBeenCalledWith("7203", {
      trend_group_id: null,
      buy_category: 0,
      buy_price: null,
      buy_quantity: 100,
    });
  });

  it("computes and displays profit/loss when buy_price and buy_quantity are set", () => {
    renderTable();

    // (3000 - 2530) * 50 = 23500
    expect(screen.getByText("+¥23,500")).toBeInTheDocument();
  });

  it("falls back to the group placeholder when the row's group is not in the active group list", () => {
    const orphaned = [{ ...trends[1], trend_group_id: 999 }];
    renderTable({ watchlist: orphaned });

    expect(screen.getByLabelText("6758のグループ")).toHaveValue("");
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

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/components/WatchlistTable.test.tsx`
Expected: FAIL(新props未対応)

- [ ] **Step 3: `WatchlistRow.tsx`を新規作成**

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PositionInput, Trend, TrendGroup } from "../types";

interface WatchlistRowProps {
  trend: Trend;
  groups: TrendGroup[];
  selected: boolean;
  onToggleCode: (code: string) => void;
  onDelete: (code: string) => void;
  onSaveNickName: (code: string, nickName: string) => void;
  onSavePosition: (code: string, position: PositionInput) => void;
}

const BUY_CATEGORY_OPTIONS = [
  { value: 0, label: "未選択" },
  { value: 1, label: "特定" },
  { value: 2, label: "一般" },
  { value: 3, label: "NISA" },
];

function toPositionInput(trend: Trend): PositionInput {
  return {
    trend_group_id: trend.trend_group_id,
    buy_category: trend.buy_category,
    buy_price: trend.buy_price,
    buy_quantity: trend.buy_quantity,
  };
}

export function WatchlistRow({
  trend,
  groups,
  selected,
  onToggleCode,
  onDelete,
  onSaveNickName,
  onSavePosition,
}: WatchlistRowProps) {
  const [nickName, setNickName] = useState(trend.nick_name);
  const [position, setPosition] = useState<PositionInput>(toPositionInput(trend));
  const [buyPriceText, setBuyPriceText] = useState(trend.buy_price?.toString() ?? "");
  const [buyQuantityText, setBuyQuantityText] = useState(trend.buy_quantity?.toString() ?? "");

  useEffect(() => {
    setNickName(trend.nick_name);
    setPosition(toPositionInput(trend));
    setBuyPriceText(trend.buy_price?.toString() ?? "");
    setBuyQuantityText(trend.buy_quantity?.toString() ?? "");
  }, [trend]);

  const savePositionIfChanged = (next: PositionInput) => {
    const before = toPositionInput(trend);
    const changed =
      next.trend_group_id !== before.trend_group_id ||
      next.buy_category !== before.buy_category ||
      next.buy_price !== before.buy_price ||
      next.buy_quantity !== before.buy_quantity;
    setPosition(next);
    if (changed) onSavePosition(trend.code, next);
  };

  const handleGroupChange = (value: string) => {
    savePositionIfChanged({ ...position, trend_group_id: value === "" ? null : Number(value) });
  };

  const handleCategoryChange = (value: string) => {
    savePositionIfChanged({ ...position, buy_category: Number(value) });
  };

  const commitBuyPrice = () => {
    const parsed = buyPriceText.trim() === "" ? null : Number(buyPriceText);
    savePositionIfChanged({ ...position, buy_price: parsed !== null && Number.isNaN(parsed) ? null : parsed });
  };

  const commitBuyQuantity = () => {
    const parsed = buyQuantityText.trim() === "" ? null : Number(buyQuantityText);
    savePositionIfChanged({ ...position, buy_quantity: parsed !== null && Number.isNaN(parsed) ? null : parsed });
  };

  const commitNickName = () => {
    if (nickName !== trend.nick_name) onSaveNickName(trend.code, nickName);
  };

  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  const selectedGroupId = groups.some((g) => g.id === position.trend_group_id)
    ? String(position.trend_group_id)
    : "";

  const pnl =
    position.buy_price !== null && position.buy_quantity !== null
      ? (trend.price_at_fetch - position.buy_price) * position.buy_quantity
      : null;

  return (
    <tr>
      <td className="checkbox-col">
        <input
          type="checkbox"
          aria-label={`${trend.code}を選択`}
          checked={selected}
          onChange={() => onToggleCode(trend.code)}
        />
      </td>
      <td>
        <select
          className="group-select"
          aria-label={`${trend.code}のグループ`}
          value={selectedGroupId}
          onChange={(e) => handleGroupChange(e.target.value)}
        >
          <option value="">グループを選択</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </td>
      <td>{new Date(trend.created_at).toLocaleString("ja-JP")}</td>
      <td>{trend.code}</td>
      <td>
        <input
          className="nick-name-input"
          aria-label={`${trend.code}の会社名`}
          value={nickName}
          placeholder={trend.name}
          onChange={(e) => setNickName(e.target.value)}
          onBlur={commitNickName}
          onKeyDown={blurOnEnter}
        />
      </td>
      <td>¥{trend.price_at_fetch.toLocaleString()}</td>
      <td>
        <select
          className="group-select"
          aria-label={`${trend.code}の預かり区分`}
          value={position.buy_category}
          onChange={(e) => handleCategoryChange(e.target.value)}
        >
          {BUY_CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          className="amount-input"
          aria-label={`${trend.code}の購入金額`}
          value={buyPriceText}
          onChange={(e) => setBuyPriceText(e.target.value)}
          onBlur={commitBuyPrice}
          onKeyDown={blurOnEnter}
        />
      </td>
      <td>
        <input
          className="amount-input"
          aria-label={`${trend.code}の購入株数`}
          value={buyQuantityText}
          onChange={(e) => setBuyQuantityText(e.target.value)}
          onBlur={commitBuyQuantity}
          onKeyDown={blurOnEnter}
        />
      </td>
      <td>
        {pnl === null ? (
          "—"
        ) : (
          <span className={pnl >= 0 ? "pnl-plus" : "pnl-minus"}>
            {pnl >= 0 ? "+" : ""}¥{Math.round(pnl).toLocaleString()}
          </span>
        )}
        <span className="opinion">{trend.opinion}</span>
      </td>
      <td className="actions-col">
        <Link to={`/trends/${trend.code}`} className="btn-link">
          詳細
        </Link>
      </td>
      <td className="actions-col">
        <button type="button" className="btn btn-danger btn-link" onClick={() => onDelete(trend.code)}>
          削除
        </button>
      </td>
    </tr>
  );
}
```

- [ ] **Step 4: `WatchlistTable.tsx`を書き換える**

ファイル全体を以下で置き換える:

```tsx
import type { PositionInput, Trend, TrendGroup } from "../types";
import { WatchlistRow } from "./WatchlistRow";

interface WatchlistTableProps {
  watchlist: Trend[];
  groups: TrendGroup[];
  selectedCodes: Set<string>;
  onToggleCode: (code: string) => void;
  onToggleAll: () => void;
  onDelete: (code: string) => void;
  onSaveNickName: (code: string, nickName: string) => void;
  onSavePosition: (code: string, position: PositionInput) => void;
}

export function WatchlistTable({
  watchlist,
  groups,
  selectedCodes,
  onToggleCode,
  onToggleAll,
  onDelete,
  onSaveNickName,
  onSavePosition,
}: WatchlistTableProps) {
  const allSelected = watchlist.length > 0 && selectedCodes.size === watchlist.length;

  return (
    <table className="watchlist-table">
      <thead>
        <tr>
          <th className="checkbox-col">
            <input
              type="checkbox"
              aria-label="全選択/全解除"
              checked={allSelected}
              onChange={onToggleAll}
            />
          </th>
          <th>グループ</th>
          <th>更新日時</th>
          <th>株式コード</th>
          <th>会社名</th>
          <th>現在値</th>
          <th>預かり区分</th>
          <th>購入金額</th>
          <th>購入株数</th>
          <th>損益</th>
          <th className="actions-col" />
          <th className="actions-col" />
        </tr>
      </thead>
      <tbody>
        {watchlist.map((trend) => (
          <WatchlistRow
            key={trend.code}
            trend={trend}
            groups={groups}
            selected={selectedCodes.has(trend.code)}
            onToggleCode={onToggleCode}
            onDelete={onDelete}
            onSaveNickName={onSaveNickName}
            onSavePosition={onSavePosition}
          />
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `cd frontend && npx vitest run src/components/WatchlistTable.test.tsx`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
cd frontend && git add src/components/WatchlistRow.tsx src/components/WatchlistTable.tsx src/components/WatchlistTable.test.tsx
git commit -m "feat(frontend): add WatchlistRow with position/group editing and rewrite WatchlistTable"
```

---

### Task 11: `GroupControls.tsx`(新規)

**Files:**
- Create: `frontend/src/components/GroupControls.tsx`
- Test: `frontend/src/components/GroupControls.test.tsx`

**Interfaces:**
- Consumes: `TrendGroup`(Task5)
- Produces: `<GroupControls groups onCreate onDelete filterGroupId onApplyFilter />`

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/components/GroupControls.test.tsx`を新規作成:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroupControls } from "./GroupControls";

const groups = [
  { id: 1, name: "成長株" },
  { id: 2, name: "配当株" },
];

function renderControls(overrides = {}) {
  const props = {
    groups,
    onCreate: vi.fn(),
    onDelete: vi.fn(),
    filterGroupId: null,
    onApplyFilter: vi.fn(),
    ...overrides,
  };
  render(<GroupControls {...props} />);
  return props;
}

describe("GroupControls", () => {
  it("calls onCreate with the entered name and clears the input", () => {
    const props = renderControls();

    fireEvent.change(screen.getByLabelText("グループ名"), { target: { value: "テック株" } });
    fireEvent.click(screen.getByRole("button", { name: "作成" }));

    expect(props.onCreate).toHaveBeenCalledWith("テック株");
    expect(screen.getByLabelText("グループ名")).toHaveValue("");
  });

  it("does not call onCreate when the name is blank", () => {
    const props = renderControls();

    fireEvent.click(screen.getByRole("button", { name: "作成" }));

    expect(props.onCreate).not.toHaveBeenCalled();
  });

  it("calls onDelete with the selected group id", () => {
    const props = renderControls();

    fireEvent.change(screen.getByLabelText("削除対象グループ"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(props.onDelete).toHaveBeenCalledWith(2);
  });

  it("calls onApplyFilter with the selected group id when the filter button is clicked", () => {
    const props = renderControls();

    fireEvent.change(screen.getByLabelText("グループ絞込"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "絞込" }));

    expect(props.onApplyFilter).toHaveBeenCalledWith(1);
  });

  it("does not apply the filter just from changing the select, only the button click", () => {
    const props = renderControls();

    fireEvent.change(screen.getByLabelText("グループ絞込"), { target: { value: "1" } });

    expect(props.onApplyFilter).not.toHaveBeenCalled();
  });

  it("calls onApplyFilter with null when 'すべて' is selected", () => {
    const props = renderControls({ filterGroupId: 1 });

    fireEvent.change(screen.getByLabelText("グループ絞込"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "絞込" }));

    expect(props.onApplyFilter).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/components/GroupControls.test.tsx`
Expected: FAIL(モジュール未定義)

- [ ] **Step 3: 実装**

`frontend/src/components/GroupControls.tsx`を新規作成:

```tsx
import { useState } from "react";
import type { TrendGroup } from "../types";

interface GroupControlsProps {
  groups: TrendGroup[];
  onCreate: (name: string) => void;
  onDelete: (groupId: number) => void;
  filterGroupId: number | null;
  onApplyFilter: (groupId: number | null) => void;
}

export function GroupControls({
  groups,
  onCreate,
  onDelete,
  filterGroupId,
  onApplyFilter,
}: GroupControlsProps) {
  const [name, setName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState("");
  const [filterSelection, setFilterSelection] = useState(
    filterGroupId === null ? "" : String(filterGroupId)
  );

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim());
    setName("");
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    onDelete(Number(deleteTarget));
    setDeleteTarget("");
  };

  return (
    <div className="code-input">
      <div className="field">
        <label htmlFor="group-name">グループ名</label>
        <input
          id="group-name"
          className="code-text-input"
          value={name}
          placeholder="例: 成長株"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <button type="button" className="btn btn-primary" onClick={handleCreate}>
        作成
      </button>
      <div className="field">
        <label htmlFor="group-delete-select">削除対象グループ</label>
        <select
          id="group-delete-select"
          className="group-select"
          value={deleteTarget}
          onChange={(e) => setDeleteTarget(e.target.value)}
        >
          <option value="">選択してください</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="btn btn-outline-danger" onClick={handleDelete}>
        削除
      </button>
      <div className="field">
        <label htmlFor="group-filter-select">グループ絞込</label>
        <select
          id="group-filter-select"
          className="group-select"
          value={filterSelection}
          onChange={(e) => setFilterSelection(e.target.value)}
        >
          <option value="">すべて</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="btn btn-dark"
        onClick={() => onApplyFilter(filterSelection === "" ? null : Number(filterSelection))}
      >
        絞込
      </button>
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd frontend && npx vitest run src/components/GroupControls.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd frontend && git add src/components/GroupControls.tsx src/components/GroupControls.test.tsx
git commit -m "feat(frontend): add GroupControls component for group create/delete/filter"
```

---

### Task 12: `WatchlistPage.tsx`統合

**Files:**
- Modify: `frontend/src/components/WatchlistPage.tsx`
- Modify: `frontend/src/components/WatchlistPage.test.tsx`

**Interfaces:**
- Consumes: `useTrendGroups`(Task8)、`useWatchlist`拡張(Task9)、`GroupControls`(Task11)、`WatchlistTable`新props(Task10)

- [ ] **Step 1: 既存`WatchlistPage.test.tsx`を更新**

ファイル冒頭のimportを以下で置き換える:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as trendsApi from "../api/trends";
import * as trendGroupsApi from "../api/trendGroups";
import { ThemeProvider } from "../theme/ThemeContext";
import { WatchlistPage } from "./WatchlistPage";

vi.mock("../api/trends");
vi.mock("../api/trendGroups");
vi.mock("../api/trendPrices");
```

`sampleTrend`オブジェクトへ以下5フィールドを追加する(`opinion`行の直後):

```typescript
  nick_name: "",
  trend_group_id: null,
  buy_category: 0,
  buy_price: null,
  buy_quantity: null,
```

`beforeEach`ブロックを以下で置き換える:

```typescript
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([]);
    vi.mocked(trendGroupsApi.fetchTrendGroups).mockResolvedValue([]);
  });
```

- [ ] **Step 2: 失敗するテストを追加**

以下を`WatchlistPage.test.tsx`の末尾(`describe`ブロックの閉じ括弧の直前)へ追記する:

```typescript
  it("applies the group filter only after clicking the 絞込 button", async () => {
    const grouped = { ...sampleTrend, code: "6758", trend_group_id: 1 };
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([sampleTrend, grouped]);
    vi.mocked(trendGroupsApi.fetchTrendGroups).mockResolvedValue([{ id: 1, name: "テック株" }]);

    render(
      <ThemeProvider>
        <MemoryRouter>
          <WatchlistPage />
        </MemoryRouter>
      </ThemeProvider>
    );

    await waitFor(() =>
      expect(screen.getByText("ウォッチリスト(2件)")).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText("グループ絞込"), { target: { value: "1" } });
    expect(screen.getByText("ウォッチリスト(2件)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "絞込" }));

    await waitFor(() =>
      expect(screen.getByText("ウォッチリスト(1件)")).toBeInTheDocument()
    );
  });
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/components/WatchlistPage.test.tsx`
Expected: FAIL(`GroupControls`未配線)

- [ ] **Step 4: 実装**

`frontend/src/components/WatchlistPage.tsx`を以下で置き換える:

```tsx
import { useTrendGroups } from "../hooks/useTrendGroups";
import { useWatchlist } from "../hooks/useWatchlist";
import { CodeInput } from "./CodeInput";
import { GroupControls } from "./GroupControls";
import { IntervalSelect } from "./IntervalSelect";
import { SettingsMenu } from "./SettingsMenu";
import { WatchlistTable } from "./WatchlistTable";

export function WatchlistPage() {
  const {
    watchlist,
    selectedCodes,
    interval,
    groupFilter,
    error,
    setInterval,
    setGroupFilter,
    add,
    remove,
    refresh,
    toggleCode,
    toggleAll,
    saveNickName,
    savePosition,
  } = useWatchlist();
  const { groups, create: createGroup, remove: removeGroup } = useTrendGroups();

  return (
    <main>
      <header className="app-header">
        <h1>株価羅針盤</h1>
        <SettingsMenu />
      </header>
      <div className="app-body">
        <div className="controls-row">
          <CodeInput onSubmit={add} error={error} />
          <GroupControls
            groups={groups}
            onCreate={createGroup}
            onDelete={removeGroup}
            filterGroupId={groupFilter}
            onApplyFilter={setGroupFilter}
          />
          <IntervalSelect interval={interval} onChange={setInterval} onRefresh={refresh} />
        </div>
        <div className="controls-row watchlist-count">
          <p className="watchlist-count">ウォッチリスト({watchlist.length}件)</p>
        </div>
        <WatchlistTable
          watchlist={watchlist}
          groups={groups}
          selectedCodes={selectedCodes}
          onToggleCode={toggleCode}
          onToggleAll={toggleAll}
          onDelete={remove}
          onSaveNickName={saveNickName}
          onSavePosition={savePosition}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `cd frontend && npx vitest run src/components/WatchlistPage.test.tsx`
Expected: PASS

- [ ] **Step 6: フロントエンド全テスト+型チェック**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: 全件PASS、tscエラー無し

- [ ] **Step 7: コミット**

```bash
cd frontend && git add src/components/WatchlistPage.tsx src/components/WatchlistPage.test.tsx
git commit -m "feat(frontend): wire GroupControls and position editing into WatchlistPage"
```

---

### Task 13: 最終検証(コード変更無し)

**Files:** なし(検証のみ)

- [ ] **Step 1: バックエンド全テスト**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/ -v`
Expected: 全件PASS

- [ ] **Step 2: フロントエンド全テスト+型チェック**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: 全件PASS、tscエラー無し

- [ ] **Step 3: ローカルDBスキーマの作り直し**

新規テーブル・列はマイグレーションでは反映されないため、既存の`db_data`ボリュームを破棄して作り直す:

```bash
docker compose down -v && docker compose up -d --build
```

(個人用ローカル環境のため既存データの消失は許容する。本番相当の永続データがある場合は事前に確認すること)

- [ ] **Step 4: 手動確認(ブラウザ)**

`http://localhost:5173`を開き、以下を確認する:

- 株式コードを取得すると、購入金額・購入株数・預かり区分・グループ列が空の状態で表示される
- 会社名欄にプレースホルダーとして英語名(`name`)が表示され、入力してフォーカスを外す(blur)、またはEnterキーで確定するとニックネームとして保存され、リロード後も維持される
- 購入金額・購入株数を入力すると損益がその場で再計算・表示される。blur/Enterで保存され、未変更のままblurしてもAPI呼出しが発生しない(ネットワークタブで確認)
- グループを作成すると各行のグループセレクトの選択肢に反映される。行のグループを選択すると保存される
- グループを削除すると、そのグループが紐付いていた行は「グループを選択」表示に戻る(データは保持されたまま)
- グループ絞込セレクトを変更しただけでは一覧は変わらず、「絞込」ボタン押下で反映される
- 右上の歯車アイコンからダークテーマに切り替え、新規追加した列・入力欄・pillの配色が崩れずに追従することを確認する

この Task は verification のみでコード変更・コミットを行わない。
