# 銘柄名の一元管理(trend_code_name) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** コード→銘柄名の情報を新設の`trend_code_name`テーブル1か所へ集約し、`trend.name`・`trend.nick_name`・`trend_candidate.name`の3列を廃止する。

**Architecture:** 新規`trend_code_name`(code UNIQUE・name NULL許容・ソフトデリート付き)と、書き込み専用の`trend_code_name_service`(`fill_names`=未設定時のみ一括で埋める、`set_name`=手入力で上書き)、読み出し専用の`get_names`を追加する。銘柄取得・発掘スキャンは`fill_names`、一覧画面の手入力は`PATCH /trends/{code}/name`→`set_name`を通す。読み出しは`get_names`で名前を引き、ORMオブジェクトへ属性として付与する(既存の`_attach_price_fields`と同じ方式)。

**Tech Stack:** FastAPI, SQLAlchemy 2.0, MySQL(本番)/SQLite(pytest) / React, TypeScript, Vite, vitest

**Spec:** [docs/design/08-trend-code-name.md](../../design/08-trend-code-name.md)

## Global Constraints

- `trend_code_name`の列: `id`(PK, auto increment)、`code`(String(16), UNIQUE, FK制約なし)、`name`(String(255), NULL許容)、`created_at`、`updated_at`、`deleted_at`
- `trend.name`・`trend.nick_name`・`trend_candidate.name`の3列を削除する。マイグレーション機構は無く、手元DBは`docker compose down -v`で作り直す前提
- `fill_names`は既存の`name`を上書きしない。手入力(`set_name`) > 既存の値 > 取得元(yfinance / J-Quants)
- `fill_names`は`code IN (…)`の1回のSELECT(ソフトデリート済みを含む)+1回のbulk INSERT+差分のみUPDATEで、銘柄数によらず発行クエリ数が一定であること
- `set_name`は前後の空白を除去し、結果が空文字なら`name`をNULLに戻す。ソフトデリート済みなら復活させる
- 名前が未設定(行なし、または`name`がNULL)の銘柄は、APIが`name`を空文字で返す。一覧から漏れさせない
- 名前の翻訳はしない(yfinanceの名前はそのまま保存)。名前の履歴は持たない
- `PATCH /trends/{code}/nick_name`は廃止し、`PATCH /trends/{code}/name`へ置き換える。`nick_name`フィールドはAPIと`Trend`型から除去する
- 名前更新の失敗は、該当行の直下にインラインで赤字エラーを出す(専用トーストは導入しない)
- `fill_names`の失敗は呼び出し元(銘柄取得・発掘スキャン)本体の失敗として扱い、名前だけ欠けた状態で成功扱いにしない
- 全テーブルに`created_at`/`updated_at`/`deleted_at`を持たせ、既存モデルと同じく`default=now_jst`/`onupdate=now_jst`を使う
- DBスキーマは`Base.metadata.create_all`のみで管理する
- コミットメッセージ末尾のtrailerは次の2行:
  `Co-Authored-By: Claude Code <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ`
- J-Quantsのキーをコミット・出力しない

## 設計判断(Ruling)

doc-specが定めていない点について、計画段階で次のとおり決めた。実装者はこれに従う。

1. **commitの責務**: `fill_names`/`set_name`は`flush`まで行い、`commit`しない。呼び出し側がcommitする(発掘スキャンの入れ替えや`trend`挿入と同一トランザクションにするため)。`trend_service.update_name`は自身でcommitする。
2. **空の名前**: `fill_names`は空文字・空白のみの名前を無視する(NULL=未設定として扱う)。
3. **ソフトデリート済み行**: `fill_names`でも`set_name`でも`deleted_at=None`に戻して復活させる。`fill_names`は復活させた行の`name`がNULLのときだけ埋める。
4. **発掘スキャン**: 名前を渡すのは実際に保存できた銘柄(`saved_rows`)のみ。日足取得に失敗した銘柄は渡さない。
5. **読み出し方式**: リテラルなLEFT JOINではなく、`get_names(db, codes) -> dict[str, str]`(1回のSELECT、ソフトデリート済み・NULLの行は除外)で引いてPython側で付与する。未設定は空文字。挙動はLEFT JOINと同一。
6. **付与漏れを検知可能にする**: `Trend`にクラスレベルの`name`既定値は持たせない。付与し忘れた経路はpydanticの検証で即座に失敗する。`create_trend`/`list_watchlist`/`update_name`/`refresh_trends`/詳細ルート/発掘結果/候補チャートの全戻り経路で必ず付与する。
7. **PATCHの仕様**: 保存するのは空白除去後の値。`TrendOut`を返す。アクティブな`trend`が無ければ404。リクエストは`name: str = Field(max_length=255)`。
8. **フロントの状態同期**: `useWatchlist.saveName`は成功時、レスポンスの`name`でローカルの`watchlist`を更新する(グループ絞込の切替で行が再マウントされても古い名前に戻らないため)。再読込はしない。
9. **行コンポーネントのeffect**: `WatchlistRow`の位置情報リセット用`useEffect`の依存を`[trend]`から各プリミティブ(`trend_group_id`/`buy_category`/`buy_price`/`buy_quantity`)へ変更する。名前保存でtrendオブジェクトが差し替わっても、入力途中の購入金額等が巻き戻らないようにするため。名前用は別の`useEffect([trend.name])`とする。
10. **入力欄のクラス名**: `nick-name-input`は`name-input`へ改名する(CSSと1か所の使用箇所のみ)。

## ファイル構成

- Create: `backend/app/trend_code_name_service.py` — `fill_names`/`set_name`/`get_names`
- Create: `backend/tests/test_trend_code_name_service.py`
- Modify: `backend/app/models.py` — `TrendCodeName`追加、3列削除
- Modify: `backend/app/trend_service.py` — 名前の付与・`fill_names`呼出し・`update_name`
- Modify: `backend/app/routers/trends.py`、`backend/app/schemas.py` — `nick_name`廃止、`PATCH /trends/{code}/name`
- Modify: `backend/app/trend_candidate_service.py`、`backend/app/trend_candidate_result_service.py`、`backend/app/routers/screening.py`
- Modify: `frontend/src/types.ts`、`api/trends.ts`、`hooks/useWatchlist.ts`、`components/WatchlistRow.tsx`、`WatchlistTable.tsx`、`WatchlistPage.tsx`、`index.css` と各テスト
- Modify: `docs/design/06-position-grouping.md`、`01`/`07`の該当記述、`CLAUDE.md`

作業ディレクトリはリポジトリルート(`projects/trend-compass/`)。バックエンドのテストは `cd backend && source .venv/bin/activate && python -m pytest tests/ -v`、フロントは `cd frontend && npx vitest run` と `npx tsc --noEmit`。

---

### Task 1: `TrendCodeName`モデルと`trend_code_name_service`

既存列にはまだ触れない(このタスクは追加のみ。既存テストはそのまま通る)。

**Files:**
- Modify: `backend/app/models.py`(末尾へ`TrendCodeName`追加)
- Create: `backend/app/trend_code_name_service.py`
- Create: `backend/tests/test_trend_code_name_service.py`
- Modify: `backend/tests/test_models.py`(モデルの基本テスト追加)

**Interfaces:**
- Produces:
  - `models.TrendCodeName(id, code, name: str | None, created_at, updated_at, deleted_at)`
  - `fill_names(db: Session, names: dict[str, str]) -> None`(flushのみ)
  - `set_name(db: Session, code: str, name: str) -> models.TrendCodeName`(flushのみ)
  - `get_names(db: Session, codes: list[str]) -> dict[str, str]`

- [ ] **Step 1: モデルの失敗テストを書く**

`backend/tests/test_models.py`の末尾へ追加:

```python
def test_trend_code_name_defaults(db_session):
    row = models.TrendCodeName(code="7203")
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)

    assert row.name is None
    assert row.deleted_at is None
    assert row.created_at is not None
    assert row.updated_at is not None


def test_trend_code_name_code_is_unique(db_session):
    db_session.add(models.TrendCodeName(code="7203", name="トヨタ自動車"))
    db_session.commit()

    db_session.add(models.TrendCodeName(code="7203", name="重複"))
    with pytest.raises(IntegrityError):
        db_session.commit()
```

- [ ] **Step 2: 失敗を確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_models.py -v -k trend_code_name`
Expected: FAIL(`AttributeError: module 'app.models' has no attribute 'TrendCodeName'`)

- [ ] **Step 3: モデルを追加**

`backend/app/models.py`の末尾へ追加(`UniqueConstraint`は`unique=True`で足りるため不要):

```python
class TrendCodeName(Base):
    __tablename__ = "trend_code_name"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=now_jst, onupdate=now_jst
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )
```

- [ ] **Step 4: モデルのテストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_models.py -v`
Expected: PASS

- [ ] **Step 5: サービスの失敗テストを書く**

`backend/tests/test_trend_code_name_service.py`を新規作成:

```python
from sqlalchemy import event, select

from app import models, trend_code_name_service


def _row(db, code):
    return db.execute(
        select(models.TrendCodeName).where(models.TrendCodeName.code == code)
    ).scalars().first()


def test_fill_names_inserts_new_codes(db_session):
    trend_code_name_service.fill_names(db_session, {"7203": "トヨタ自動車", "6758": "ソニーグループ"})
    db_session.commit()

    assert _row(db_session, "7203").name == "トヨタ自動車"
    assert _row(db_session, "6758").name == "ソニーグループ"


def test_fill_names_fills_row_whose_name_is_null(db_session):
    db_session.add(models.TrendCodeName(code="7203", name=None))
    db_session.commit()

    trend_code_name_service.fill_names(db_session, {"7203": "トヨタ自動車"})
    db_session.commit()

    assert _row(db_session, "7203").name == "トヨタ自動車"


def test_fill_names_never_overwrites_existing_name(db_session):
    db_session.add(models.TrendCodeName(code="7203", name="手入力のトヨタ"))
    db_session.commit()

    trend_code_name_service.fill_names(db_session, {"7203": "Toyota Motor Corp"})
    db_session.commit()

    assert _row(db_session, "7203").name == "手入力のトヨタ"


def test_fill_names_resurrects_soft_deleted_row_and_fills_null_name(db_session):
    from app.clock import now_jst

    db_session.add(models.TrendCodeName(code="7203", name=None, deleted_at=now_jst()))
    db_session.commit()

    trend_code_name_service.fill_names(db_session, {"7203": "トヨタ自動車"})
    db_session.commit()

    row = _row(db_session, "7203")
    assert row.deleted_at is None
    assert row.name == "トヨタ自動車"
    assert db_session.execute(select(models.TrendCodeName)).scalars().all() == [row]


def test_fill_names_resurrects_soft_deleted_row_but_keeps_existing_name(db_session):
    from app.clock import now_jst

    db_session.add(models.TrendCodeName(code="7203", name="残す名前", deleted_at=now_jst()))
    db_session.commit()

    trend_code_name_service.fill_names(db_session, {"7203": "上書きしない"})
    db_session.commit()

    row = _row(db_session, "7203")
    assert row.deleted_at is None
    assert row.name == "残す名前"


def test_fill_names_ignores_empty_and_blank_names(db_session):
    trend_code_name_service.fill_names(db_session, {"7203": "", "6758": "   "})
    db_session.commit()

    assert _row(db_session, "7203") is None
    assert _row(db_session, "6758") is None


def test_fill_names_with_empty_input_issues_no_statement(db_session):
    statements = []
    event.listen(
        db_session.get_bind(), "before_cursor_execute",
        lambda conn, cursor, statement, params, context, executemany: statements.append(statement),
    )

    trend_code_name_service.fill_names(db_session, {})

    assert statements == []


def _count_statements(db, fn):
    statements = []

    def listener(conn, cursor, statement, params, context, executemany):
        statements.append(statement)

    engine = db.get_bind()
    event.listen(engine, "before_cursor_execute", listener)
    try:
        fn()
    finally:
        event.remove(engine, "before_cursor_execute", listener)
    return len(statements)


def test_fill_names_statement_count_is_constant_regardless_of_number_of_names(db_session):
    one = _count_statements(
        db_session,
        lambda: trend_code_name_service.fill_names(db_session, {"1000": "銘柄1"}),
    )
    many = _count_statements(
        db_session,
        lambda: trend_code_name_service.fill_names(
            db_session, {str(2000 + i): f"銘柄{i}" for i in range(500)}
        ),
    )

    assert one == many


def test_set_name_creates_row(db_session):
    trend_code_name_service.set_name(db_session, "7203", "トヨタ")
    db_session.commit()

    assert _row(db_session, "7203").name == "トヨタ"


def test_set_name_overwrites_existing_name(db_session):
    db_session.add(models.TrendCodeName(code="7203", name="Toyota Motor Corp"))
    db_session.commit()

    trend_code_name_service.set_name(db_session, "7203", "トヨタ")
    db_session.commit()

    assert _row(db_session, "7203").name == "トヨタ"


def test_set_name_strips_whitespace(db_session):
    trend_code_name_service.set_name(db_session, "7203", "  トヨタ  ")
    db_session.commit()

    assert _row(db_session, "7203").name == "トヨタ"


def test_set_name_with_blank_resets_name_to_null(db_session):
    db_session.add(models.TrendCodeName(code="7203", name="トヨタ"))
    db_session.commit()

    trend_code_name_service.set_name(db_session, "7203", "   ")
    db_session.commit()

    assert _row(db_session, "7203").name is None


def test_set_name_resurrects_soft_deleted_row(db_session):
    from app.clock import now_jst

    db_session.add(models.TrendCodeName(code="7203", name="古い", deleted_at=now_jst()))
    db_session.commit()

    trend_code_name_service.set_name(db_session, "7203", "トヨタ")
    db_session.commit()

    row = _row(db_session, "7203")
    assert row.deleted_at is None
    assert row.name == "トヨタ"


def test_get_names_returns_only_active_rows_with_a_name(db_session):
    from app.clock import now_jst

    db_session.add_all(
        [
            models.TrendCodeName(code="7203", name="トヨタ"),
            models.TrendCodeName(code="6758", name=None),
            models.TrendCodeName(code="9984", name="削除済み", deleted_at=now_jst()),
        ]
    )
    db_session.commit()

    names = trend_code_name_service.get_names(db_session, ["7203", "6758", "9984", "1111"])

    assert names == {"7203": "トヨタ"}


def test_get_names_with_empty_codes_issues_no_statement(db_session):
    count = _count_statements(
        db_session, lambda: trend_code_name_service.get_names(db_session, [])
    )

    assert count == 0
```

- [ ] **Step 6: 失敗を確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trend_code_name_service.py -v`
Expected: FAIL(`ImportError: cannot import name 'trend_code_name_service'`)

- [ ] **Step 7: サービスを実装**

`backend/app/trend_code_name_service.py`を新規作成:

```python
from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from . import models


def fill_names(db: Session, names: dict[str, str]) -> None:
    candidates = {code: name.strip() for code, name in names.items() if name and name.strip()}
    if not candidates:
        return

    existing = {
        row.code: row
        for row in db.execute(
            select(models.TrendCodeName).where(
                models.TrendCodeName.code.in_(list(candidates))
            )
        ).scalars()
    }

    new_rows = []
    for code, name in candidates.items():
        row = existing.get(code)
        if row is None:
            new_rows.append({"code": code, "name": name})
            continue
        if row.deleted_at is not None:
            row.deleted_at = None
        if row.name is None:
            row.name = name

    if new_rows:
        db.execute(insert(models.TrendCodeName), new_rows)
    db.flush()


def set_name(db: Session, code: str, name: str) -> models.TrendCodeName:
    value = name.strip() or None
    row = db.execute(
        select(models.TrendCodeName).where(models.TrendCodeName.code == code)
    ).scalars().first()
    if row is None:
        row = models.TrendCodeName(code=code, name=value)
        db.add(row)
    else:
        row.name = value
        row.deleted_at = None
    db.flush()
    return row


def get_names(db: Session, codes: list[str]) -> dict[str, str]:
    if not codes:
        return {}
    rows = db.execute(
        select(models.TrendCodeName).where(
            models.TrendCodeName.code.in_(codes),
            models.TrendCodeName.deleted_at.is_(None),
            models.TrendCodeName.name.is_not(None),
        )
    ).scalars()
    return {row.code: row.name for row in rows}
```

- [ ] **Step 8: 全テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/ -v`
Expected: PASS(新規テストを含め全件)。`test_fill_names_statement_count_is_constant...`が落ちる場合は、bulk INSERTが行数分のINSERTに展開されていないか(`db.execute(insert(Model), list)`になっているか)を確認する。

- [ ] **Step 9: Commit**

```bash
git add backend/app/models.py backend/app/trend_code_name_service.py backend/tests/test_models.py backend/tests/test_trend_code_name_service.py
git commit -m "$(cat <<'EOF'
feat(code-name): add trend_code_name table and fill/set/get service

Co-Authored-By: Claude Code <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ
EOF
)"
```

---

### Task 2: 銘柄取得・一覧・詳細を`trend_code_name`経由へ切替(`trend.name`/`nick_name`の廃止)

**Files:**
- Modify: `backend/app/models.py`(`Trend.name`・`Trend.nick_name`を削除)
- Modify: `backend/app/trend_service.py`
- Modify: `backend/app/schemas.py`(`nick_name`廃止、`NameUpdateRequest`)
- Modify: `backend/app/routers/trends.py`
- Test: `backend/tests/test_models.py`、`backend/tests/test_trend_service.py`、`backend/tests/test_trends_api.py`

**Interfaces:**
- Consumes: `trend_code_name_service.fill_names/set_name/get_names`(Task 1)
- Produces:
  - `trend_service.update_name(db, code: str, name: str) -> models.Trend | None`(`update_nick_name`の置き換え。commitする。`name`付与済みのTrendを返す)
  - `trend_service._attach_name(trend, names: dict[str, str]) -> models.Trend`
  - `PATCH /trends/{code}/name`(body `{"name": str}`、`TrendOut`を返す、無ければ404)
  - `TrendOut.name`は`trend_code_name`由来(未設定は`""`)、`nick_name`フィールドは無し

- [ ] **Step 1: 既存テストを新仕様へ書き換える(失敗させる)**

`backend/tests/test_models.py`: `test_trend_nick_name_defaults_to_empty_string`(10〜22行目)を次で置き換える。

```python
def test_trend_has_no_name_or_nick_name_columns(db_session):
    trend = models.Trend(
        code="7203",
        opinion="初回取得、履歴データ無し",
        detail={},
        price_at_fetch=2900.0,
    )
    db_session.add(trend)
    db_session.commit()
    db_session.refresh(trend)

    assert not hasattr(models.Trend, "name")
    assert not hasattr(models.Trend, "nick_name")
```

`backend/tests/test_trend_service.py`:

- 16行目`assert trend.name == "トヨタ自動車"`はそのまま(`create_trend`が名前を付与して返すため)。190行目も同様にそのまま。
- `test_create_trend_carries_over_nick_name_when_recreating_active_code`(約444行目)を次で置き換える。

```python
def test_create_trend_does_not_overwrite_manually_set_name(db_session, monkeypatch):
    from app import trend_code_name_service

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "Toyota Motor Corp", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")
    trend_code_name_service.set_name(db_session, "7203", "トヨタ")
    db_session.commit()

    second = trend_service.create_trend(db_session, "7203")

    assert second.name == "トヨタ"


def test_create_trend_saves_quote_name_via_fill_names(db_session, monkeypatch):
    from app import trend_code_name_service

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "Toyota Motor Corp", "price": 2900.0}
    )

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.name == "Toyota Motor Corp"
    assert trend_code_name_service.get_names(db_session, ["7203"]) == {"7203": "Toyota Motor Corp"}
```

- `test_update_nick_name_updates_active_trend`(約526行目)を`test_update_name_updates_active_trend`へ改名し、次のとおり書き換える。

```python
def test_update_name_updates_active_trend(db_session, monkeypatch):
    from app import trend_price_service

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")
    trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=5, buy_category=1, buy_price=2900.0, buy_quantity=100
    )

    updated = trend_service.update_name(db_session, "7203", " トヨタ ")

    assert updated.name == "トヨタ"
    assert updated.trend_group_id == 5
    assert updated.buy_category == 1
    assert float(updated.buy_price) == 2900.0
    assert updated.buy_quantity == 100
```

- `test_update_nick_name_returns_none_when_not_found`を`test_update_name_returns_none_when_not_found`へ改名し、`trend_service.update_name(db_session, "9999", "x") is None`にする。
- `test_refresh_trends_carries_nick_name_and_attaches_price_fields`(約550行目)を次で置き換える。

```python
def test_refresh_trends_attaches_name_and_price_fields(db_session, monkeypatch):
    from app import trend_code_name_service, trend_price_service

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "Toyota Motor Corp", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")
    trend_code_name_service.set_name(db_session, "7203", "トヨタ")
    db_session.commit()

    trend_price_service.upsert_price(
        db_session, "7203", trend_group_id=None, buy_category=1, buy_price=2900.0, buy_quantity=100
    )

    row = trend_service.get_active_trend(db_session, "7203")
    row.created_at = now_jst() - timedelta(minutes=5)
    db_session.commit()

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "Toyota Motor Corp", "price": 2950.0}
    )
    updated = trend_service.refresh_trends(db_session, ["7203"], 1)

    assert len(updated) == 1
    assert updated[0].name == "トヨタ"
    assert updated[0].buy_category == 1
    assert float(updated[0].buy_price) == 2900.0
    assert updated[0].buy_quantity == 100
```

同ファイルの末尾へ追加(未設定の名前が空文字で返ること):

```python
def test_list_watchlist_returns_empty_name_when_name_is_unset(db_session, monkeypatch):
    from sqlalchemy import update

    from app import models

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    trend_service.create_trend(db_session, "7203")
    db_session.execute(update(models.TrendCodeName).values(name=None))
    db_session.commit()

    watchlist = trend_service.list_watchlist(db_session)

    assert [t.code for t in watchlist] == ["7203"]
    assert watchlist[0].name == ""


def test_list_watchlist_returns_empty_name_when_no_code_name_row(db_session):
    from app import models

    db_session.add(
        models.Trend(code="7203", opinion="x", detail={}, price_at_fetch=2900.0)
    )
    db_session.commit()

    watchlist = trend_service.list_watchlist(db_session)

    assert watchlist[0].name == ""
```

`backend/tests/test_trends_api.py`:

- `test_list_trends_includes_position_fields`(約282行目)の`assert body["nick_name"] == ""`を`assert "nick_name" not in body`へ変更。
- 289〜302行目の2テストを次で置き換える。

```python
def test_update_name_success(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "Toyota Motor Corp", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.patch("/trends/7203/name", json={"name": " トヨタ "})

    assert response.status_code == 200
    assert response.json()["name"] == "トヨタ"
    assert client.get("/trends").json()[0]["name"] == "トヨタ"
    assert client.get("/trends/7203").json()["name"] == "トヨタ"


def test_update_name_with_empty_string_resets_to_empty_name(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "Toyota Motor Corp", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.patch("/trends/7203/name", json={"name": ""})

    assert response.status_code == 200
    assert response.json()["name"] == ""
    assert client.get("/trends").json()[0]["name"] == ""


def test_update_name_not_found_returns_404(client):
    response = client.patch("/trends/9999/name", json={"name": "x"})

    assert response.status_code == 404


def test_update_name_rejects_name_over_255_chars(client, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.patch("/trends/7203/name", json={"name": "あ" * 256})

    assert response.status_code == 422


def test_old_nick_name_endpoint_is_gone(client):
    response = client.patch("/trends/7203/nick_name", json={"nick_name": "x"})

    assert response.status_code in (404, 405)
```

- [ ] **Step 2: 失敗を確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_models.py tests/test_trend_service.py tests/test_trends_api.py -v`
Expected: FAIL(`update_name`未定義、`Trend`に`name`列が残っている等)

- [ ] **Step 3: `Trend`から2列を削除**

`backend/app/models.py`の`Trend`から次の2行を削除する。

```python
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    nick_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
```

`Trend`には`name`のクラスレベル既定値を**追加しない**(Ruling 6)。

- [ ] **Step 4: `trend_service.py`を書き換える**

import部に追加:

```python
from . import trend_code_name_service, trend_price_service
```
(既存の`from . import trend_price_service`をこの1行へ置き換える。)

`create_trend`(54〜72行目)を次で置き換える。

```python
def create_trend(db: Session, code: str) -> models.Trend:
    previous = get_active_trend(db, code)
    quote = get_quote(code)
    trend = models.Trend(
        code=code,
        opinion=_build_opinion(previous, quote["price"]),
        detail=_build_detail(code),
        price_at_fetch=quote["price"],
    )
    if previous is not None:
        previous.deleted_at = now_jst()
    db.add(trend)
    trend_code_name_service.fill_names(db, {code: quote["name"]})
    db.commit()
    db.refresh(trend)
    trend_price_service.restore_price_if_exists(db, code)
    price = trend_price_service.get_active_price(db, code)
    _attach_price_fields(trend, price)
    return _attach_name(trend, trend_code_name_service.get_names(db, [code]))


def _attach_name(trend: models.Trend, names: dict[str, str]) -> models.Trend:
    trend.name = names.get(trend.code, "")
    return trend
```

`list_watchlist`(83〜88行目)を次で置き換える。

```python
def list_watchlist(db: Session) -> list[models.Trend]:
    trends = list_active_trends(db)
    prices_by_code = {p.code: p for p in trend_price_service.list_active_prices(db)}
    names = trend_code_name_service.get_names(db, [t.code for t in trends])
    for trend in trends:
        _attach_price_fields(trend, prices_by_code.get(trend.code))
        _attach_name(trend, names)
    return trends
```

`update_nick_name`(91〜99行目)を次で置き換える。

```python
def update_name(db: Session, code: str, name: str) -> models.Trend | None:
    trend = get_active_trend(db, code)
    if trend is None:
        return None
    trend_code_name_service.set_name(db, code, name)
    db.commit()
    db.refresh(trend)
    price = trend_price_service.get_active_price(db, code)
    _attach_price_fields(trend, price)
    return _attach_name(trend, trend_code_name_service.get_names(db, [code]))
```

`refresh_trends`(197〜233行目)のループ内と末尾を次のとおり変更する(`models.Trend(...)`から`name=`・`nick_name=`を削除し、`fill_names`を追加し、commit後に名前を付与)。

```python
        detail = _build_detail(code, macro_cache)
        new_trend = models.Trend(
            code=code,
            opinion=_build_opinion(current, quote["price"]),
            detail=detail or current.detail,
            price_at_fetch=quote["price"],
        )
        current.deleted_at = now_jst()
        price = trend_price_service.get_active_price(db, code)
        _attach_price_fields(new_trend, price)
        db.add(new_trend)
        trend_code_name_service.fill_names(db, {code: quote["name"]})
        updated.append(new_trend)

    db.commit()
    for trend in updated:
        db.refresh(trend)
    names = trend_code_name_service.get_names(db, [t.code for t in updated])
    for trend in updated:
        _attach_name(trend, names)
    return updated
```

- [ ] **Step 5: スキーマとルーターを更新**

`backend/app/schemas.py`:`TrendOut`から`nick_name: str`の1行を削除。`NickNameUpdateRequest`(39〜40行目)を次で置き換える。

```python
class NameUpdateRequest(BaseModel):
    name: str = Field(max_length=255)
```

`backend/app/routers/trends.py`:importの`NickNameUpdateRequest`を`NameUpdateRequest`へ、`from .. import trend_service`を`from .. import trend_code_name_service, trend_service`へ変更。`get_trend_detail`の返却部を次にする。

```python
    names = trend_code_name_service.get_names(db, [trend.code])
    return TrendDetailOut(
        id=trend.id,
        code=trend.code,
        name=names.get(trend.code, ""),
        opinion=trend.opinion,
        price_at_fetch=trend.price_at_fetch,
        created_at=trend.created_at,
        detail=detail,
    )
```

末尾の`PATCH /{code}/nick_name`ルートを次で置き換える。

```python
@router.patch("/{code}/name", response_model=TrendOut)
def update_trend_name(code: str, body: NameUpdateRequest, db: Session = Depends(get_db)):
    trend = trend_service.update_name(db, code, body.name)
    if trend is None:
        raise HTTPException(status_code=404, detail=f"銘柄コード {code} は見つかりません")
    return trend
```

- [ ] **Step 6: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/ -v`
Expected: PASS。`TrendOut`の検証エラー(`name`が無い)が出る場合は、その戻り経路で`_attach_name`が漏れている。`test_trends_api.py`に`/trends/refresh`のAPIテストが有る場合もそこで確認する。

- [ ] **Step 7: Commit**

```bash
git add backend/app backend/tests
git commit -m "$(cat <<'EOF'
refactor(trends): read/write stock names via trend_code_name, drop trend.name and nick_name

Co-Authored-By: Claude Code <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ
EOF
)"
```

---

### Task 3: 発掘(スキャン・結果・候補チャート)を`trend_code_name`経由へ切替

**Files:**
- Modify: `backend/app/models.py`(`TrendCandidate.name`を削除)
- Modify: `backend/app/trend_candidate_service.py`
- Modify: `backend/app/trend_candidate_result_service.py`
- Modify: `backend/app/routers/screening.py`
- Test: `backend/tests/test_trend_candidate_service.py`、`test_trend_candidate_result_service.py`、`test_screening_candles_api.py`、`test_screening_results_register_api.py`、`test_models.py`

**Interfaces:**
- Consumes: `trend_code_name_service.fill_names/get_names`(Task 1)
- Produces: 発掘結果の`items[].name`・候補チャートの`name`は`trend_code_name`由来(未設定は`""`)。レスポンスの形は不変。

- [ ] **Step 1: テストを新仕様へ書き換える(失敗させる)**

機械的な変更: `TrendCandidate(...)`のシードから`name=...`引数を全て削除する。対象は次のとおり(`name=`を残すと`TypeError: 'name' is an invalid keyword argument`になるため、pytestの失敗箇所で漏れを検出できる)。

- `test_models.py`: `test_trend_candidate_defaults`(61行目付近)
- `test_screening_results_register_api.py`: 8行目・24行目付近の2か所
- `test_trend_candidate_service.py`: 37行目・116行目付近
- `test_trend_candidate_result_service.py`: 全シード(`matching`/`non_matching`ほか)
- `test_screening_candles_api.py`: `_seed`

名前を検証するテストは次のとおり変更する。

`test_trend_candidate_result_service.py`の`test_run_search_persists_results_tied_to_condition_id`(約49行目)を次で置き換える。

```python
def test_run_search_persists_results_tied_to_condition_id(db_session):
    from app import trend_code_name_service

    db_session.add(models.TrendCandidate(code="7203", detail={"history": [_bar()] * 30}))
    trend_code_name_service.set_name(db_session, "7203", "トヨタ自動車")
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, [])
    trend_candidate_result_service.run_search(db_session, condition)

    items, total = trend_candidate_result_service.get_cached_results(
        db_session, condition.id, page=1, page_size=20
    )

    assert total == 1
    assert items[0]["code"] == "7203"
    assert items[0]["name"] == "トヨタ自動車"
    assert items[0]["price"] == 1000.0


def test_get_cached_results_returns_empty_name_when_name_is_unset(db_session):
    db_session.add(models.TrendCandidate(code="7203", detail={"history": [_bar()] * 30}))
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, [])
    trend_candidate_result_service.run_search(db_session, condition)

    items, total = trend_candidate_result_service.get_cached_results(
        db_session, condition.id, page=1, page_size=20
    )

    assert total == 1
    assert items[0]["name"] == ""
```

`test_screening_candles_api.py`の`_seed`を次で置き換え、名前未設定のテストを追加する。

```python
def _seed(client, code="7203", name="トヨタ自動車", closes=(10, 20, 30, 40, 50, 60, 70), deleted=False):
    session = client.session_local()
    session.add(
        models.TrendCandidate(
            code=code,
            detail={"history": _history(list(closes))},
            deleted_at=now_jst() if deleted else None,
        )
    )
    if name is not None:
        session.add(models.TrendCodeName(code=code, name=name))
    session.commit()
    session.close()


def test_candles_returns_empty_name_when_name_is_unset(client):
    _seed(client, name=None)

    response = client.get("/screening/candidates/7203/candles")

    assert response.status_code == 200
    assert response.json()["name"] == ""
```

`test_trend_candidate_service.py`の`test_run_scan_truncates_and_reinserts_candidates`(約34行目)の`models.TrendCandidate(code="1111", name="旧", ...)`を`models.TrendCandidate(code="1111", detail={"history": []})`にし、末尾へ次のテストを追加する。

```python
def _stub_jquants(monkeypatch, stocks):
    monkeypatch.setattr(trend_candidate_service.jquants_client, "list_prime_stocks", lambda: stocks)
    monkeypatch.setattr(
        trend_candidate_service.jquants_client,
        "get_daily_bars",
        lambda code, days=90: [{"date": "2026-09-28", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1}],
    )
    monkeypatch.setattr(trend_candidate_service.jquants_client, "pace_requests", lambda: None)


def test_run_scan_saves_names_via_fill_names_without_overwriting(db_session, monkeypatch):
    from app import trend_code_name_service

    trend_code_name_service.set_name(db_session, "7203", "手入力のトヨタ")
    db_session.commit()
    _stub_jquants(
        monkeypatch,
        [{"code": "7203", "name": "トヨタ自動車"}, {"code": "6758", "name": "ソニーグループ"}],
    )

    trend_candidate_service.run_scan(db_session)

    assert trend_code_name_service.get_names(db_session, ["7203", "6758"]) == {
        "7203": "手入力のトヨタ",
        "6758": "ソニーグループ",
    }


def test_run_scan_does_not_save_names_for_stocks_whose_bars_failed(db_session, monkeypatch):
    from app import trend_code_name_service

    _stub_jquants(
        monkeypatch,
        [{"code": "7203", "name": "トヨタ自動車"}, {"code": "6758", "name": "ソニーグループ"}],
    )

    def fail_for_sony(code, days=90):
        if code == "6758":
            raise trend_candidate_service.jquants_client.JQuantsError("boom")
        return [{"date": "2026-09-28", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1}]

    monkeypatch.setattr(trend_candidate_service.jquants_client, "get_daily_bars", fail_for_sony)

    trend_candidate_service.run_scan(db_session)

    assert trend_code_name_service.get_names(db_session, ["7203", "6758"]) == {"7203": "トヨタ自動車"}


def test_run_scan_keeps_old_candidates_when_fill_names_fails(db_session, monkeypatch):
    from app import models

    db_session.add(models.TrendCandidate(code="1111", detail={"history": []}))
    db_session.commit()
    _stub_jquants(monkeypatch, [{"code": "7203", "name": "トヨタ自動車"}])

    def boom(db, names):
        raise RuntimeError("fill_names failed")

    monkeypatch.setattr(trend_candidate_service.trend_code_name_service, "fill_names", boom)

    import pytest

    with pytest.raises(RuntimeError):
        trend_candidate_service.run_scan(db_session)
    db_session.rollback()

    assert [c.code for c in trend_candidate_service.list_active_candidates(db_session)] == ["1111"]
```

- [ ] **Step 2: 失敗を確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/ -v`
Expected: FAIL(`TrendCandidate`に`name`列が残っている/`trend_code_name_service`未importなど)

- [ ] **Step 3: モデルから`TrendCandidate.name`を削除**

`backend/app/models.py`の`TrendCandidate`から次の1行を削除する。

```python
    name: Mapped[str] = mapped_column(String(255), nullable=False)
```

- [ ] **Step 4: `run_scan`を変更**

`backend/app/trend_candidate_service.py`のimportを`from . import jquants_client, models, trend_code_name_service, trend_system_service`にし、`run_scan`のループと入れ替え部を次にする。

```python
    stocks = jquants_client.list_prime_stocks()
    saved_rows = []
    saved_names: dict[str, str] = {}
    for stock in stocks:
        jquants_client.pace_requests()
        try:
            bars = jquants_client.get_daily_bars(stock["code"])
        except jquants_client.JQuantsError:
            logger.warning("failed to fetch daily bars for %s", stock["code"], exc_info=True)
            continue
        saved_rows.append(models.TrendCandidate(code=stock["code"], detail={"history": bars}))
        saved_names[stock["code"]] = stock["name"]

    if stocks and not saved_rows:
        logger.error(
            "screening scan fetched no daily bars for any of %d stocks; keeping existing data",
            len(stocks),
        )
        return 0

    db.execute(delete(models.TrendCandidate))
    db.execute(delete(models.TrendCandidateResult))
    for row in saved_rows:
        db.add(row)
    trend_code_name_service.fill_names(db, saved_names)
    db.commit()
    return len(saved_rows)
```

- [ ] **Step 5: 結果取得とチャートを`get_names`へ**

`backend/app/trend_candidate_result_service.py`:importを`from . import models, screening_signals, trend_candidate_service, trend_code_name_service`にし、`candidates_by_code`の直後へ`names = trend_code_name_service.get_names(db, codes_page)`を追加、`"name": candidate.name,`を`"name": names.get(code, ""),`に変更する。

`backend/app/routers/screening.py`:`from .. import (...)`に`trend_code_name_service`を追加し、`get_candidate_candles`の返却を次にする。

```python
    name = trend_code_name_service.get_names(db, [candidate.code]).get(candidate.code, "")
    return {"code": candidate.code, "name": name, "candles": candles, "sma5": sma5}
```

- [ ] **Step 6: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/ -v`
Expected: PASS(全件)

- [ ] **Step 7: Commit**

```bash
git add backend/app backend/tests
git commit -m "$(cat <<'EOF'
refactor(screening): store candidate names in trend_code_name, drop trend_candidate.name

Co-Authored-By: Claude Code <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ
EOF
)"
```

---

### Task 4: フロントエンド(`nick_name`廃止、名前入力欄を`PATCH /trends/{code}/name`へ)

**Files:**
- Modify: `frontend/src/types.ts`、`frontend/src/api/trends.ts`、`frontend/src/hooks/useWatchlist.ts`
- Modify: `frontend/src/components/WatchlistRow.tsx`、`WatchlistTable.tsx`、`WatchlistPage.tsx`、`frontend/src/index.css`
- Test: `frontend/src/api/trends.test.ts`、`hooks/useWatchlist.test.ts`、`components/WatchlistTable.test.tsx`、`WatchlistPage.test.tsx`、`DetailPage.test.tsx`、`App.test.tsx`

**Interfaces:**
- Consumes: `PATCH /trends/{code}/name`(body `{"name": string}`、`Trend`を返す)(Task 2)
- Produces:
  - `updateName(code: string, name: string): Promise<Trend>`(`updateNickName`の置き換え)
  - `useWatchlist().saveName(code: string, name: string): Promise<void>`(`saveNickName`の置き換え)
  - `WatchlistRow`/`WatchlistTable`のprop `onSaveName: (code: string, name: string) => void`(`onSaveNickName`の置き換え)

- [ ] **Step 1: テストを新仕様へ書き換える(失敗させる)**

`api/trends.test.ts`:1行目のimportの`updateNickName`を`updateName`へ変更し、130〜145行目のテストを次で置き換える。

```ts
  it("updateName sends PATCH with name", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 1, code: "7203", name: "トヨタ" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateName("7203", "トヨタ");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/trends/7203/name"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "トヨタ" }),
      })
    );
  });
```

`hooks/useWatchlist.test.ts`:`sampleTrend`から`nick_name: "",`の行を削除。`saveNickName`を検証する2テスト(約144行目・約189行目)を次で置き換える。

```ts
  it("saveName calls api, updates the local name and does not reload the watchlist on success", async () => {
    vi.mocked(trendsApi.updateName).mockResolvedValue({ ...sampleTrend, name: "トヨタ" });
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    await act(async () => {
      await result.current.saveName("7203", "トヨタ");
    });

    expect(trendsApi.updateName).toHaveBeenCalledWith("7203", "トヨタ");
    expect(result.current.watchlist[0].name).toBe("トヨタ");
    // 成功時に再読込すると、同じ行の他の入力欄の入力途中の値を巻き戻し得るため、再読込しない。
    expect(trendsApi.fetchTrends).toHaveBeenCalledTimes(1);
  });

  it("saveName sets a row-scoped error on failure without touching the shared error or the name", async () => {
    vi.mocked(trendsApi.updateName).mockRejectedValue(new Error("保存に失敗しました"));
    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.watchlist).toHaveLength(1));

    await act(async () => {
      await result.current.saveName("7203", "トヨタ");
    });

    expect(result.current.rowErrors["7203"]).toBe("保存に失敗しました");
    expect(result.current.error).toBeNull();
    expect(result.current.watchlist[0].name).toBe("トヨタ自動車");
  });
```

`components/WatchlistTable.test.tsx`:フィクスチャから`nick_name`を削除し、名前を次のとおり変更する(1件目`name: ""`、2件目`name: "ソニーグループ"`)。`renderTable`のpropsの`onSaveNickName: vi.fn(),`を`onSaveName: vi.fn(),`へ。66〜89行目の3テストを次で置き換え、追加テストを続ける。

```tsx
  it("shows name as the company name input value, falling back to the code as placeholder", () => {
    renderTable();

    expect(screen.getByLabelText("6758の会社名")).toHaveValue("ソニーグループ");
    expect(screen.getByLabelText("7203の会社名")).toHaveValue("");
    expect(screen.getByLabelText("7203の会社名")).toHaveAttribute("placeholder", "7203");
  });

  it("calls onSaveName on blur when the value changed", () => {
    const props = renderTable();

    const input = screen.getByLabelText("7203の会社名");
    fireEvent.change(input, { target: { value: "トヨタ" } });
    fireEvent.blur(input);

    expect(props.onSaveName).toHaveBeenCalledWith("7203", "トヨタ");
  });

  it("calls onSaveName when Enter is pressed after the value changed", () => {
    const props = renderTable();

    const input = screen.getByLabelText("7203の会社名");
    fireEvent.change(input, { target: { value: "トヨタ" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onSaveName).toHaveBeenCalledWith("7203", "トヨタ");
  });

  it("does not call onSaveName on blur when the value is unchanged", () => {
    const props = renderTable();

    const input = screen.getByLabelText("6758の会社名");
    fireEvent.blur(input);

    expect(props.onSaveName).not.toHaveBeenCalled();
  });

  it("sends an empty string when the name is cleared", () => {
    const props = renderTable();

    const input = screen.getByLabelText("6758の会社名");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(props.onSaveName).toHaveBeenCalledWith("6758", "");
  });

```

同ファイルへ、名前だけが変わっても入力途中の購入金額が巻き戻らないことを確認するテストを追加する(`rerender`で同じ行を再描画する)。

```tsx
  it("keeps in-progress buy_price text when only the name of the trend changes", () => {
    const props = {
      watchlist: trends,
      groups,
      selectedCodes: new Set<string>(),
      onToggleCode: vi.fn(),
      onToggleAll: vi.fn(),
      onDelete: vi.fn(),
      onSaveName: vi.fn(),
      onSavePosition: vi.fn(),
    };
    const { rerender } = render(
      <MemoryRouter>
        <WatchlistTable {...props} />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText("7203の購入金額"), { target: { value: "2950" } });

    const renamed = trends.map((t) => (t.code === "7203" ? { ...t, name: "トヨタ" } : t));
    rerender(
      <MemoryRouter>
        <WatchlistTable {...props} watchlist={renamed} />
      </MemoryRouter>
    );

    expect(screen.getByLabelText("7203の会社名")).toHaveValue("トヨタ");
    expect(screen.getByLabelText("7203の購入金額")).toHaveValue("2950");
  });
```


`WatchlistPage.test.tsx`(20行目)・`DetailPage.test.tsx`(25行目)・`App.test.tsx`(35行目)のフィクスチャから`nick_name: "",`の行を削除する。

- [ ] **Step 2: 失敗を確認**

Run: `cd frontend && npx vitest run`
Expected: FAIL(`updateName`未定義、`onSaveName`未実装 等)

- [ ] **Step 3: 型とAPIクライアントを変更**

`frontend/src/types.ts`:`Trend`から`nick_name: string;`の行を削除。

`frontend/src/api/trends.ts`:`updateNickName`を次で置き換える。

```ts
export function updateName(code: string, name: string): Promise<Trend> {
  return apiRequest<Trend>(`/trends/${code}/name`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}
```

- [ ] **Step 4: `useWatchlist`を変更**

`hooks/useWatchlist.ts`:importの`updateNickName`を`updateName`へ変更し、`saveNickName`(110〜120行目)を次で置き換える。戻り値オブジェクトの`saveNickName,`も`saveName,`へ。

```ts
  const saveName = useCallback(
    async (code: string, name: string) => {
      clearRowError(code);
      try {
        const updated = await updateName(code, name);
        setWatchlist((prev) =>
          prev.map((t) => (t.code === code ? { ...t, name: updated.name } : t))
        );
      } catch (err) {
        setRowError(code, (err as Error).message);
      }
    },
    [clearRowError, setRowError]
  );
```

- [ ] **Step 5: `WatchlistRow`/`Table`/`Page`を変更**

`WatchlistRow.tsx`:
- propsの型`onSaveNickName: (code: string, nickName: string) => void;`を`onSaveName: (code: string, name: string) => void;`へ、分割代入の`onSaveNickName`も`onSaveName`へ。
- 状態とeffect(42〜52行目付近)を次で置き換える。

```tsx
  const [name, setName] = useState(trend.name);
  const [position, setPosition] = useState<PositionInput>(toPositionInput(trend));
  const [buyPriceText, setBuyPriceText] = useState(trend.buy_price?.toString() ?? "");
  const [buyQuantityText, setBuyQuantityText] = useState(trend.buy_quantity?.toString() ?? "");

  useEffect(() => {
    setName(trend.name);
  }, [trend.name]);

  // 依存をtrendオブジェクトではなくプリミティブにする: 名前保存で行のオブジェクトが
  // 差し替わっても、入力途中の購入金額等を巻き戻さないため。
  useEffect(() => {
    setPosition(toPositionInput(trend));
    setBuyPriceText(trend.buy_price?.toString() ?? "");
    setBuyQuantityText(trend.buy_quantity?.toString() ?? "");
  }, [trend.trend_group_id, trend.buy_category, trend.buy_price, trend.buy_quantity]);
```

- `commitNickName`(83〜85行目)を次で置き換える。

```tsx
  const commitName = () => {
    if (name.trim() !== trend.name) onSaveName(trend.code, name);
  };
```

- 入力欄(141〜149行目)を次で置き換える。

```tsx
        <input
          className="name-input"
          aria-label={`${trend.code}の会社名`}
          value={name}
          placeholder={trend.code}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={blurOnEnter}
        />
```

`index.css`(359行目):`.nick-name-input {`を`.name-input {`へ改名(中身は変更しない)。

`WatchlistTable.tsx`:propsの`onSaveNickName`(12行目・24行目・64行目の受け渡し)を全て`onSaveName`へ。`WatchlistPage.tsx`:26行目`saveNickName,`を`saveName,`、69行目`onSaveNickName={saveNickName}`を`onSaveName={saveName}`へ。

- [ ] **Step 6: テスト・型チェックが通ることを確認**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS(vitest全件、tscエラー0)。取り残しの確認: `grep -rn "nick_name\|nickName\|NickName\|nick-name" frontend/src` が0件であること。

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "$(cat <<'EOF'
refactor(frontend): edit stock name via PATCH /trends/{code}/name, drop nick_name

Co-Authored-By: Claude Code <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ
EOF
)"
```

---

### Task 5: ドキュメント整合と実機スモークテスト

**Files:**
- Modify: `docs/design/06-position-grouping.md`(19・49・84・86・114行目付近の`nick_name`記述)
- Modify: `docs/design/01-watchlist-foundation.md`(52行目の`name`列)
- Modify: `docs/design/07-screening.md`(39行目・142行目の`trend_code_name`保留記述)
- Modify: `CLAUDE.md`(機能への分割にリンク追加、実機スモークテスト項目へ追記)

- [ ] **Step 1: 06のnick_name記述を置き換える**

各行を読んだうえで、`nick_name`を「`trend_code_name.name`(08で一元化)」へ書き換える。冒頭(見出し直下)に次の注記を1つ追加する。

```markdown
> **注記(08による置き換え)**: 本doc-specの`nick_name`(`trend.nick_name`列・`PATCH /trends/{code}/nick_name`)は、
> [08-trend-code-name.md](08-trend-code-name.md) により`trend_code_name.name`・`PATCH /trends/{code}/name`へ置き換えられた。
```

- [ ] **Step 2: 01・07の記述を更新**

- `01-watchlist-foundation.md`52行目の列挙から`name`を除き、直後に「銘柄名は`trend_code_name`で管理する(08参照)」を1行追記する。
- `07-screening.md`39行目の対象外記述に「(08で実施済み)」を追記し、142行目の`name`の説明を「銘柄名は`trend_code_name`で管理するため、本テーブルには持たない(08参照)」へ更新する。

- [ ] **Step 3: CLAUDE.mdを更新**

「機能への分割」の「発掘」項の後に次を追加する。

```markdown
- **銘柄名の一元管理(trend_code_name)** — コード→名前の情報を`trend_code_name`テーブルへ
  集約し、`trend.name`/`trend.nick_name`/`trend_candidate.name`を廃止する。銘柄取得・
  発掘スキャンは未設定時のみ自動で名前を埋め、一覧画面の入力欄で手入力できる。
  doc-spec: [docs/design/08-trend-code-name.md](docs/design/08-trend-code-name.md)
```

「実機スモークテスト」の最低限の導線リストの末尾へ次を追加する。

```markdown
- 名前の一元管理: 銘柄取得→名前の自動入力→一覧で名前を手入力→発掘スキャン後も
  手入力の名前が維持される(DBは`docker compose down -v`で作り直してから確認する)
```

- [ ] **Step 4: 全テストを実行**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/ -v` および `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: 全てPASS

- [ ] **Step 5: 実機スモークテスト(mainへのマージ前に必須)**

作業ブランチのworktreeで、既存のスタックが同ポート(3307/8000/5173)を使っていないことを確認してから実行する(`docker compose ls`)。

```bash
docker compose down -v
docker compose up -d --build
```

ブラウザで次を一通り確認し、画面のスクリーンショットを取る(ユーザーは画面のレイアウトと挙動の両方を確認したい)。

1. 銘柄コード(例: `7203`)を取得 → 会社名欄にyfinanceの名前が自動で入っていること
2. 会社名欄を「トヨタ」に書き換えて`Tab`で確定 → 一覧を再読込しても「トヨタ」のまま。`Enter`確定でも同様
3. 会社名欄を空にして確定 → 空欄になり、placeholderの銘柄コードが表示される。詳細画面の見出しは`7203`のみになる
4. 詳細画面へ遷移 → 見出しが`7203 トヨタ`(手入力した名前)になる
5. 発掘スキャン(`JQUANTS_MAX_STOCKS`が小さい設定でよい)を実行し、`7203`がスキャン対象に含まれる場合、スキャン後も手入力の名前が維持され、発掘結果の表・候補チャートの名前も同じ値になる
6. 名前が入っていない銘柄(空欄化した銘柄)が、一覧・詳細・発掘結果から漏れず、名前が空欄で表示される
7. 既存の導線: グループ作成→紐付け→絞込→対象グループ削除→絞込を「すべて」に戻す、購入金額・株数・預かり区分の入力保存(blur/Enter両方)、ダーク/ライト切替
8. 名前を編集した直後に購入金額へ入力し始めても、入力途中の値が巻き戻らないこと(Ruling 9)
9. 名前更新を失敗させる(backendコンテナを止める)と、該当行の直下に赤字のエラーが出ること

確認後、`docker compose down`(`-v`は付けない)で停止する。

- [ ] **Step 6: Commit**

```bash
git add docs CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: sync 06/01/07 specs and CLAUDE.md with trend_code_name

Co-Authored-By: Claude Code <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ
EOF
)"
```

---

## 実行後の扱い

- 作業は`main`から切った専用ブランチ/worktreeで行う。mainへのマージはスモークテスト合格後、ユーザーの承認を得てから行う(pushはしない)。
- 保留中の関連事項(本計画の対象外): 売却予定価格フィールド、07 doc-specの古い記述の追加整理。
