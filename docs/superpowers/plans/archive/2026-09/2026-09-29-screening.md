# 発掘(新規機能) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** J-Quants APIの日足データから技術シグナルを計算し、条件に合致した銘柄を提示、既存ウォッチリストへ登録できる「発掘」機能を追加する。

**Architecture:** 新規`trend_candidate`(スキャン結果の生OHLCV)/`trend_candidate_condition`(検索条件、自動保存)/`trend_candidate_result`(直近スキャン分の絞込結果キャッシュ)/`trend_system`(汎用key-value)の4テーブルを追加する。データ取得は新規`jquants_client.py`(既存`yfinance_client.py`とは独立)経由でJ-Quants API V2を叩く。シグナル計算は`screening_signals.py`の12個の純粋関数で行い、`trend_candidate.detail`に保存した生データに対して検索実行時に適用する(閾値は固定の既定値、UIには出さない)。

**Tech Stack:** FastAPI, SQLAlchemy(backend) / React, TypeScript(frontend)

**Spec:** [docs/design/07-screening.md](../../design/07-screening.md)

## Global Constraints

- `trend_candidate`はスキャン実行のたびにTRUNCATE→一括INSERTする。UPDATEは行わない
- `trend_candidate_result`は新規スキャンが走るたびに全件DELETEしてから、以後の検索結果をINSERTしていく
- `POST /screening/search`はフロントから数値パラメータを一切受け取らない。有効化されたシグナル項目(キーのリスト)のみを受け取り、バックエンド側が下記の既定値一覧を自動で適用して`trend_candidate_condition.condition`を生成する
- `trend_candidate_condition.name`は仮名として`YYYY-MM-DD_HHMM`形式(例: `2026-09-29_1432`)で自動生成し、後から「編集」ボタンでリネームできる
- J-Quants認証は`x-api-key`ヘッダーによるAPIキー単体(トークン発行フロー不要)。ベースURLは`JQUANTS_BASE_URL`(既定`https://api.jquants.com/v2`)。銘柄マスタは`/equities/master`、日足データは`/equities/bars/daily`
- レート制限は「64秒あたり」でペーシングする: `JQUANTS_RATE_LIMIT_PER_64S`(既定5)・`JQUANTS_MAX_STOCKS`(既定10)。Light契約後は60・1600に変更するだけでフルスキャンに移行できる
- `POST /screening/search`は同期処理として実装する(FastAPIの`def`エンドポイント。`async def`にしない。自動的にスレッドプールへオフロードされ、イベントループを専有しない)。`BackgroundTasks`によるポーリングは導入しない
- `POST /screening/scan`は非同期(`BackgroundTasks`)。バックグラウンド処理を起動する前に`trend_system`(`key = "screening_last_run_at"`)へ実行開始日時を書き込む(クールダウン判定・二重実行防止のため)
- 全テーブル(`trend_candidate`/`trend_candidate_condition`/`trend_candidate_result`/`trend_system`)に`created_at`/`updated_at`/`deleted_at`を持たせる。実際のアクセスパターン上使わない列(`trend_candidate.deleted_at`等)があっても例外を作らない
- `trend_group_id`等の既存の慣例に倣い、テーブル間にFK制約は持たせない。整合性はアプリ側で管理する
- 発掘機能は既存の`yfinance_client.py`(機能A/B/C)と相互依存させない。新規`jquants_client.py`は独立モジュールとする
- 発掘は日足による一次スクリーニングのみ。分足データ・期間指定条件は対象外(機能B拡張の詳細画面に委ねる)
- DBスキーマはSQLAlchemyの`Base.metadata.create_all`のみで管理する(マイグレーションツール未導入)。既存テーブルへの列追加ではなく新規テーブル追加のみのため、通常の`docker compose up -d --build`で反映される
- コミットメッセージ末尾のtrailerは`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`の1行のみ

**12シグナル項目のパラメータ既定値**(`trend_candidate_condition_service.py`で使用。doc-specより転記):

```json
{
  "ma_trend": {"enabled": false, "short_period": 5, "long_period": 25},
  "bullish_candle_ratio": {"enabled": false, "period_days": 5, "min_bullish_count": 3},
  "volume_surge": {"enabled": false, "period_days": 20, "multiplier": 1.5},
  "rebound_pct": {"enabled": false, "lookback_days": 20, "threshold_pct": 5},
  "bollinger_position": {"enabled": false, "period": 20, "std_dev": 2, "max_band_pct": 0.9},
  "golden_cross_recent": {"enabled": false, "short_period": 5, "long_period": 25, "recent_days": 5},
  "macd_golden_cross": {"enabled": false, "fast": 12, "slow": 26, "signal": 9},
  "rsi": {"enabled": false, "period_days": 14, "lower": 30, "upper": 70},
  "candle_quality": {"enabled": false, "body_ratio_min": 0.6},
  "high_break": {"enabled": false, "lookback_days": 20},
  "sector_relative_strength": {"enabled": false, "period_days": 20, "outperform_pct": 0},
  "ma_deviation": {"enabled": false, "period": 25, "max_deviation_pct": 10}
}
```

`trend_candidate.detail`のOHLCV履歴の形式(`jquants_client.get_daily_bars`の戻り値、`trend_candidate_service.run_scan`が保存する形式):

```json
{"history": [{"date": "2026-09-28", "o": 1200.0, "h": 1250.0, "l": 1190.0, "c": 1234.0, "v": 254000}, ...]}
```

`history`は日付昇順(古い→新しい)。`sector_relative_strength`はセクター指数データが本スコープに無いため、常に`{"met": False, "value": 0.0}`を返すドキュメント化されたスタブとして実装する(将来、業種指数データソースが用意され次第、正式実装に差し替える)。

---

### Task 1: モデル追加(`TrendCandidate` / `TrendCandidateCondition` / `TrendCandidateResult` / `TrendSystem`)

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/tests/test_models.py`

**Interfaces:**
- Produces: `models.TrendCandidate`(`id`, `code`, `name`, `detail`(JSON), `created_at`, `updated_at`, `deleted_at`)、`models.TrendCandidateCondition`(`id`, `name`, `condition`(JSON), `created_at`, `updated_at`, `deleted_at`)、`models.TrendCandidateResult`(`id`, `condition_id`, `code`, `created_at`, `updated_at`, `deleted_at`)、`models.TrendSystem`(`id`, `key`(UNIQUE), `value`, `created_at`, `updated_at`, `deleted_at`)

- [ ] **Step 1: 失敗するテストを書く**

以下を`backend/tests/test_models.py`の末尾へ追記する:

```python
def test_trend_candidate_defaults(db_session):
    candidate = models.TrendCandidate(code="7203", name="トヨタ自動車", detail={"history": []})
    db_session.add(candidate)
    db_session.commit()
    db_session.refresh(candidate)

    assert candidate.deleted_at is None
    assert candidate.detail == {"history": []}


def test_trend_candidate_condition_defaults(db_session):
    condition = models.TrendCandidateCondition(
        name="2026-09-29_1432", condition={"volume_surge": {"enabled": True}}
    )
    db_session.add(condition)
    db_session.commit()
    db_session.refresh(condition)

    assert condition.name == "2026-09-29_1432"
    assert condition.deleted_at is None


def test_trend_candidate_result_defaults(db_session):
    condition = models.TrendCandidateCondition(name="2026-09-29_1432", condition={})
    db_session.add(condition)
    db_session.commit()
    db_session.refresh(condition)

    result = models.TrendCandidateResult(condition_id=condition.id, code="7203")
    db_session.add(result)
    db_session.commit()
    db_session.refresh(result)

    assert result.condition_id == condition.id
    assert result.code == "7203"
    assert result.deleted_at is None


def test_trend_system_key_is_unique(db_session):
    db_session.add(models.TrendSystem(key="screening_last_run_at", value="2026-09-28T10:00:00"))
    db_session.commit()

    db_session.add(models.TrendSystem(key="screening_last_run_at", value="x"))
    with pytest.raises(IntegrityError):
        db_session.commit()
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_models.py -v`
Expected: FAIL(`TrendCandidate`等が未定義)

- [ ] **Step 3: 実装**

`backend/app/models.py`の末尾へ以下4クラスを追加する:

```python
class TrendCandidate(Base):
    __tablename__ = "trend_candidate"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    detail: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )


class TrendCandidateCondition(Base):
    __tablename__ = "trend_candidate_condition"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    condition: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )


class TrendCandidateResult(Base):
    __tablename__ = "trend_candidate_result"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    condition_id: Mapped[int] = mapped_column(BigInteger, index=True, nullable=False)
    code: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=None
    )


class TrendSystem(Base):
    __tablename__ = "trend_system"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    value: Mapped[str] = mapped_column(String(1000), nullable=False)
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
git commit -m "feat(backend): add TrendCandidate/TrendCandidateCondition/TrendCandidateResult/TrendSystem models"
```

---

### Task 2: `trend_system_service.py`(新規、汎用key-value)

**Files:**
- Create: `backend/app/trend_system_service.py`
- Create: `backend/tests/test_trend_system_service.py`

**Interfaces:**
- Produces: `get_value(db, key: str) -> str | None`、`set_value(db, key: str, value: str) -> models.TrendSystem`

- [ ] **Step 1: 失敗するテストを書く**

`backend/tests/test_trend_system_service.py`を新規作成:

```python
from app import trend_system_service


def test_get_value_returns_none_when_missing(db_session):
    assert trend_system_service.get_value(db_session, "screening_last_run_at") is None


def test_set_value_then_get_value_round_trip(db_session):
    trend_system_service.set_value(db_session, "screening_last_run_at", "2026-09-28T10:00:00")

    assert trend_system_service.get_value(db_session, "screening_last_run_at") == "2026-09-28T10:00:00"


def test_set_value_updates_existing_key_without_creating_new_row(db_session):
    trend_system_service.set_value(db_session, "screening_last_run_at", "2026-09-28T10:00:00")
    trend_system_service.set_value(db_session, "screening_last_run_at", "2026-09-29T10:00:00")

    from app import models
    from sqlalchemy import select

    rows = db_session.execute(
        select(models.TrendSystem).where(models.TrendSystem.key == "screening_last_run_at")
    ).scalars().all()

    assert len(rows) == 1
    assert rows[0].value == "2026-09-29T10:00:00"
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trend_system_service.py -v`
Expected: FAIL(モジュール未定義)

- [ ] **Step 3: 実装**

`backend/app/trend_system_service.py`を新規作成:

```python
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models


def get_value(db: Session, key: str) -> str | None:
    stmt = select(models.TrendSystem).where(
        models.TrendSystem.key == key, models.TrendSystem.deleted_at.is_(None)
    )
    row = db.execute(stmt).scalars().first()
    return row.value if row else None


def set_value(db: Session, key: str, value: str) -> models.TrendSystem:
    stmt = select(models.TrendSystem).where(models.TrendSystem.key == key)
    row = db.execute(stmt).scalars().first()
    if row is None:
        row = models.TrendSystem(key=key, value=value)
        db.add(row)
    else:
        row.value = value
        row.deleted_at = None
    db.commit()
    db.refresh(row)
    return row
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trend_system_service.py -v`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd backend && git add app/trend_system_service.py tests/test_trend_system_service.py
git commit -m "feat(backend): add trend_system_service generic key-value store"
```

---

### Task 3: `screening_signals.py`(新規、12シグナル計算関数)

**Files:**
- Create: `backend/app/screening_signals.py`
- Create: `backend/tests/test_screening_signals.py`

**Interfaces:**
- Produces: `SIGNAL_FUNCTIONS: dict[str, Callable[[list[dict], dict], dict]]`(12キー、`ma_trend`/`bullish_candle_ratio`/`volume_surge`/`rebound_pct`/`bollinger_position`/`golden_cross_recent`/`macd_golden_cross`/`rsi`/`candle_quality`/`high_break`/`sector_relative_strength`/`ma_deviation`)。各関数のシグネチャは`(history: list[dict], params: dict) -> dict`(戻り値`{"met": bool, "value": float}`)。`history`の各要素は`{"date": str, "o": float, "h": float, "l": float, "c": float, "v": int}`、日付昇順

- [ ] **Step 1: 失敗するテストを書く**

`backend/tests/test_screening_signals.py`を新規作成:

```python
from app import screening_signals


def _bar(date, o, h, l, c, v):
    return {"date": date, "o": o, "h": h, "l": l, "c": c, "v": v}


def _flat_history(days, price=1000.0, volume=100000):
    return [_bar(f"2026-01-{i + 1:02d}", price, price, price, price, volume) for i in range(days)]


def test_ma_trend_met_when_short_ma_above_long_ma_and_rising():
    history = _flat_history(25, price=1000.0)
    # Last 6 bars trend upward so the 5-day MA is above the 25-day MA and rising.
    for i, price in enumerate([1010, 1020, 1030, 1040, 1050, 1060]):
        history.append(_bar(f"2026-02-{i + 1:02d}", price, price, price, price, 100000))

    result = screening_signals.SIGNAL_FUNCTIONS["ma_trend"](
        history, {"short_period": 5, "long_period": 25}
    )

    assert result["met"] is True


def test_ma_trend_not_met_with_flat_history():
    history = _flat_history(30)

    result = screening_signals.SIGNAL_FUNCTIONS["ma_trend"](
        history, {"short_period": 5, "long_period": 25}
    )

    assert result["met"] is False


def test_bullish_candle_ratio_met_when_enough_bullish_days():
    history = _flat_history(2)
    for i in range(5):
        history.append(_bar(f"2026-02-{i + 1:02d}", 1000, 1010, 995, 1005, 100000))

    result = screening_signals.SIGNAL_FUNCTIONS["bullish_candle_ratio"](
        history, {"period_days": 5, "min_bullish_count": 3}
    )

    assert result["met"] is True
    assert result["value"] == 5


def test_volume_surge_met_when_today_volume_exceeds_multiplier():
    history = _flat_history(20, volume=100000)
    history.append(_bar("2026-02-01", 1000, 1010, 995, 1005, 200000))

    result = screening_signals.SIGNAL_FUNCTIONS["volume_surge"](
        history, {"period_days": 20, "multiplier": 1.5}
    )

    assert result["met"] is True
    assert result["value"] == 2.0


def test_rebound_pct_met_when_recovered_from_recent_low():
    history = [_bar("2026-01-01", 1000, 1000, 900, 950, 100000)]
    for i in range(19):
        history.append(_bar(f"2026-01-{i + 2:02d}", 950, 950, 940, 945, 100000))
    history.append(_bar("2026-02-01", 990, 1000, 985, 1000, 100000))

    result = screening_signals.SIGNAL_FUNCTIONS["rebound_pct"](
        history, {"lookback_days": 20, "threshold_pct": 5}
    )

    assert result["met"] is True


def test_bollinger_position_met_when_above_mid_band_not_overheated():
    history = _flat_history(19, price=1000.0)
    history.append(_bar("2026-02-01", 1010, 1015, 1005, 1010, 100000))

    result = screening_signals.SIGNAL_FUNCTIONS["bollinger_position"](
        history, {"period": 20, "std_dev": 2, "max_band_pct": 0.9}
    )

    assert result["met"] is True


def test_golden_cross_recent_met_when_cross_happened_within_window():
    history = _flat_history(25, price=1000.0)
    for i, price in enumerate([1005, 1015, 1030, 1050, 1080]):
        history.append(_bar(f"2026-02-{i + 1:02d}", price, price, price, price, 100000))

    result = screening_signals.SIGNAL_FUNCTIONS["golden_cross_recent"](
        history, {"short_period": 5, "long_period": 25, "recent_days": 5}
    )

    assert result["met"] is True


def test_macd_golden_cross_not_met_on_flat_history():
    history = _flat_history(40)

    result = screening_signals.SIGNAL_FUNCTIONS["macd_golden_cross"](
        history, {"fast": 12, "slow": 26, "signal": 9}
    )

    assert result["met"] is False


def test_rsi_met_when_within_neutral_band():
    history = _flat_history(2, price=1000.0)
    for i in range(14):
        history.append(_bar(f"2026-02-{i + 1:02d}", 1000 + i, 1005 + i, 995 + i, 1000 + i, 100000))

    result = screening_signals.SIGNAL_FUNCTIONS["rsi"](
        history, {"period_days": 14, "lower": 30, "upper": 70}
    )

    assert 0 <= result["value"] <= 100


def test_candle_quality_met_when_body_is_large_and_bullish():
    history = _flat_history(2)
    history.append(_bar("2026-02-01", 1000, 1105, 995, 1100, 100000))

    result = screening_signals.SIGNAL_FUNCTIONS["candle_quality"](
        history, {"body_ratio_min": 0.6}
    )

    assert result["met"] is True


def test_candle_quality_not_met_when_bearish():
    history = _flat_history(2)
    history.append(_bar("2026-02-01", 1100, 1105, 995, 1000, 100000))

    result = screening_signals.SIGNAL_FUNCTIONS["candle_quality"](
        history, {"body_ratio_min": 0.6}
    )

    assert result["met"] is False


def test_high_break_met_when_close_exceeds_recent_high():
    history = _flat_history(20, price=1000.0)
    history.append(_bar("2026-02-01", 1010, 1020, 1005, 1015, 100000))

    result = screening_signals.SIGNAL_FUNCTIONS["high_break"](history, {"lookback_days": 20})

    assert result["met"] is True


def test_sector_relative_strength_is_always_a_stub():
    history = _flat_history(20)

    result = screening_signals.SIGNAL_FUNCTIONS["sector_relative_strength"](
        history, {"period_days": 20, "outperform_pct": 0}
    )

    assert result == {"met": False, "value": 0.0}


def test_ma_deviation_met_when_within_max_deviation():
    history = _flat_history(25, price=1000.0)

    result = screening_signals.SIGNAL_FUNCTIONS["ma_deviation"](
        history, {"period": 25, "max_deviation_pct": 10}
    )

    assert result["met"] is True


def test_all_signals_return_not_met_with_insufficient_history():
    history = _flat_history(2)

    for name, fn in screening_signals.SIGNAL_FUNCTIONS.items():
        params = {
            "ma_trend": {"short_period": 5, "long_period": 25},
            "bullish_candle_ratio": {"period_days": 5, "min_bullish_count": 3},
            "volume_surge": {"period_days": 20, "multiplier": 1.5},
            "rebound_pct": {"lookback_days": 20, "threshold_pct": 5},
            "bollinger_position": {"period": 20, "std_dev": 2, "max_band_pct": 0.9},
            "golden_cross_recent": {"short_period": 5, "long_period": 25, "recent_days": 5},
            "macd_golden_cross": {"fast": 12, "slow": 26, "signal": 9},
            "rsi": {"period_days": 14, "lower": 30, "upper": 70},
            "candle_quality": {"body_ratio_min": 0.6},
            "high_break": {"lookback_days": 20},
            "sector_relative_strength": {"period_days": 20, "outperform_pct": 0},
            "ma_deviation": {"period": 25, "max_deviation_pct": 10},
        }[name]

        result = fn(history, params)

        assert result["met"] is False, f"{name} should not be met with insufficient history"
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_screening_signals.py -v`
Expected: FAIL(モジュール未定義)

- [ ] **Step 3: 実装**

`backend/app/screening_signals.py`を新規作成:

```python
def _closes(history: list[dict]) -> list[float]:
    return [bar["c"] for bar in history]


def _sma(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def ma_trend(history: list[dict], params: dict) -> dict:
    short_period = params["short_period"]
    long_period = params["long_period"]
    closes = _closes(history)
    if len(closes) < long_period + 1:
        return {"met": False, "value": 0.0}

    short_now = _sma(closes, short_period)
    long_now = _sma(closes, long_period)
    short_prev = _sma(closes[:-1], short_period)
    if short_now is None or long_now is None or short_prev is None:
        return {"met": False, "value": 0.0}

    met = short_now > long_now and short_now > short_prev
    return {"met": met, "value": short_now - long_now}


def bullish_candle_ratio(history: list[dict], params: dict) -> dict:
    period_days = params["period_days"]
    min_bullish_count = params["min_bullish_count"]
    if len(history) < period_days:
        return {"met": False, "value": 0.0}

    recent = history[-period_days:]
    bullish_count = sum(1 for bar in recent if bar["c"] > bar["o"])
    return {"met": bullish_count >= min_bullish_count, "value": float(bullish_count)}


def volume_surge(history: list[dict], params: dict) -> dict:
    period_days = params["period_days"]
    multiplier = params["multiplier"]
    if len(history) < period_days + 1:
        return {"met": False, "value": 0.0}

    baseline = history[-(period_days + 1):-1]
    avg_volume = sum(bar["v"] for bar in baseline) / period_days
    if avg_volume == 0:
        return {"met": False, "value": 0.0}

    today_volume = history[-1]["v"]
    ratio = today_volume / avg_volume
    return {"met": ratio >= multiplier, "value": ratio}


def rebound_pct(history: list[dict], params: dict) -> dict:
    lookback_days = params["lookback_days"]
    threshold_pct = params["threshold_pct"]
    if len(history) < lookback_days + 1:
        return {"met": False, "value": 0.0}

    window = history[-(lookback_days + 1):]
    lowest = min(bar["l"] for bar in window)
    if lowest == 0:
        return {"met": False, "value": 0.0}

    latest_close = history[-1]["c"]
    rebound = (latest_close - lowest) / lowest * 100
    return {"met": rebound >= threshold_pct, "value": rebound}


def bollinger_position(history: list[dict], params: dict) -> dict:
    period = params["period"]
    std_dev = params["std_dev"]
    max_band_pct = params["max_band_pct"]
    closes = _closes(history)
    if len(closes) < period:
        return {"met": False, "value": 0.0}

    window = closes[-period:]
    mean = sum(window) / period
    variance = sum((x - mean) ** 2 for x in window) / period
    stdev = variance**0.5
    upper = mean + std_dev * stdev
    latest_close = closes[-1]

    if latest_close <= mean or upper == mean:
        return {"met": False, "value": 0.0}

    position = (latest_close - mean) / (upper - mean)
    return {"met": position < max_band_pct, "value": position}


def golden_cross_recent(history: list[dict], params: dict) -> dict:
    short_period = params["short_period"]
    long_period = params["long_period"]
    recent_days = params["recent_days"]
    closes = _closes(history)
    if len(closes) < long_period + recent_days + 1:
        return {"met": False, "value": -1.0}

    for offset in range(recent_days):
        end = len(closes) - offset
        short_now = _sma(closes[:end], short_period)
        long_now = _sma(closes[:end], long_period)
        short_prev = _sma(closes[: end - 1], short_period)
        long_prev = _sma(closes[: end - 1], long_period)
        if None in (short_now, long_now, short_prev, long_prev):
            continue
        if short_prev <= long_prev and short_now > long_now:
            return {"met": True, "value": float(offset)}

    return {"met": False, "value": -1.0}


def _ema_series(values: list[float], period: int) -> list[float]:
    if len(values) < period:
        return []
    multiplier = 2 / (period + 1)
    ema = [sum(values[:period]) / period]
    for value in values[period:]:
        ema.append((value - ema[-1]) * multiplier + ema[-1])
    return ema


def macd_golden_cross(history: list[dict], params: dict) -> dict:
    fast = params["fast"]
    slow = params["slow"]
    signal_period = params["signal"]
    closes = _closes(history)
    if len(closes) < slow + signal_period + 2:
        return {"met": False, "value": 0.0}

    fast_ema = _ema_series(closes, fast)
    slow_ema = _ema_series(closes, slow)
    offset = len(fast_ema) - len(slow_ema)
    macd_line = [f - s for f, s in zip(fast_ema[offset:], slow_ema)]
    signal_line = _ema_series(macd_line, signal_period)
    if len(signal_line) < 2:
        return {"met": False, "value": 0.0}

    macd_aligned = macd_line[-len(signal_line):]
    met = macd_aligned[-2] <= signal_line[-2] and macd_aligned[-1] > signal_line[-1]
    return {"met": met, "value": macd_aligned[-1] - signal_line[-1]}


def rsi(history: list[dict], params: dict) -> dict:
    period_days = params["period_days"]
    lower = params["lower"]
    upper = params["upper"]
    closes = _closes(history)
    if len(closes) < period_days + 1:
        return {"met": False, "value": 0.0}

    window = closes[-(period_days + 1):]
    gains = [max(window[i] - window[i - 1], 0) for i in range(1, len(window))]
    losses = [max(window[i - 1] - window[i], 0) for i in range(1, len(window))]
    avg_gain = sum(gains) / period_days
    avg_loss = sum(losses) / period_days

    if avg_loss == 0:
        value = 100.0
    else:
        rs = avg_gain / avg_loss
        value = 100 - (100 / (1 + rs))

    return {"met": lower < value < upper, "value": value}


def candle_quality(history: list[dict], params: dict) -> dict:
    body_ratio_min = params["body_ratio_min"]
    if not history:
        return {"met": False, "value": 0.0}

    bar = history[-1]
    candle_range = bar["h"] - bar["l"]
    if candle_range <= 0:
        return {"met": False, "value": 0.0}

    body = abs(bar["c"] - bar["o"])
    ratio = body / candle_range
    met = ratio >= body_ratio_min and bar["c"] > bar["o"]
    return {"met": met, "value": ratio}


def high_break(history: list[dict], params: dict) -> dict:
    lookback_days = params["lookback_days"]
    if len(history) < lookback_days + 1:
        return {"met": False, "value": 0.0}

    window = history[-(lookback_days + 1):-1]
    recent_high = max(bar["h"] for bar in window)
    if recent_high == 0:
        return {"met": False, "value": 0.0}

    latest_close = history[-1]["c"]
    met = latest_close > recent_high
    return {"met": met, "value": (latest_close - recent_high) / recent_high * 100}


def sector_relative_strength(history: list[dict], params: dict) -> dict:
    # Sector-average index data is not wired up in this scope (no data
    # source decided yet -- see spec's 対象外 section). Always returns
    # not-met rather than inventing a fake comparison.
    return {"met": False, "value": 0.0}


def ma_deviation(history: list[dict], params: dict) -> dict:
    period = params["period"]
    max_deviation_pct = params["max_deviation_pct"]
    closes = _closes(history)
    if len(closes) < period:
        return {"met": False, "value": 0.0}

    mean = _sma(closes, period)
    if mean is None or mean == 0:
        return {"met": False, "value": 0.0}

    deviation_pct = (closes[-1] - mean) / mean * 100
    return {"met": abs(deviation_pct) <= max_deviation_pct, "value": deviation_pct}


SIGNAL_FUNCTIONS = {
    "ma_trend": ma_trend,
    "bullish_candle_ratio": bullish_candle_ratio,
    "volume_surge": volume_surge,
    "rebound_pct": rebound_pct,
    "bollinger_position": bollinger_position,
    "golden_cross_recent": golden_cross_recent,
    "macd_golden_cross": macd_golden_cross,
    "rsi": rsi,
    "candle_quality": candle_quality,
    "high_break": high_break,
    "sector_relative_strength": sector_relative_strength,
    "ma_deviation": ma_deviation,
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_screening_signals.py -v`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd backend && git add app/screening_signals.py tests/test_screening_signals.py
git commit -m "feat(backend): add the 12 screening signal calculation functions"
```

---

### Task 4: `jquants_client.py`(新規)

**Files:**
- Create: `backend/app/jquants_client.py`
- Create: `backend/tests/test_jquants_client.py`

**Interfaces:**
- Produces: `list_prime_stocks() -> list[dict]`(各要素`{"code": str, "name": str}`)、`get_daily_bars(code: str, days: int = 90) -> list[dict]`(各要素`{"date", "o", "h", "l", "c", "v"}`)

- [ ] **Step 1: 失敗するテストを書く**

`backend/tests/test_jquants_client.py`を新規作成:

```python
from unittest.mock import MagicMock, patch

from app import jquants_client


def _mock_response(json_body, status_code=200):
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = json_body
    return response


@patch("app.jquants_client.requests.get")
def test_list_prime_stocks_filters_to_prime_market(mock_get, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    monkeypatch.setattr(jquants_client, "JQUANTS_MAX_STOCKS", 10)
    mock_get.return_value = _mock_response(
        {
            "data": [
                {"Code": "7203", "CompanyName": "トヨタ自動車", "MarketCodeName": "プライム"},
                {"Code": "9999", "CompanyName": "グロース銘柄", "MarketCodeName": "グロース"},
            ]
        }
    )

    result = jquants_client.list_prime_stocks()

    assert result == [{"code": "7203", "name": "トヨタ自動車"}]
    called_headers = mock_get.call_args.kwargs["headers"]
    assert called_headers["x-api-key"] == "test-key"


@patch("app.jquants_client.requests.get")
def test_list_prime_stocks_respects_max_stocks(mock_get, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    monkeypatch.setattr(jquants_client, "JQUANTS_MAX_STOCKS", 1)
    mock_get.return_value = _mock_response(
        {
            "data": [
                {"Code": "7203", "CompanyName": "トヨタ自動車", "MarketCodeName": "プライム"},
                {"Code": "6758", "CompanyName": "ソニーグループ", "MarketCodeName": "プライム"},
            ]
        }
    )

    result = jquants_client.list_prime_stocks()

    assert len(result) == 1


@patch("app.jquants_client.requests.get")
def test_get_daily_bars_maps_fields(mock_get, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    mock_get.return_value = _mock_response(
        {
            "data": [
                {"Date": "2026-09-28", "O": 1200.0, "H": 1250.0, "L": 1190.0, "C": 1234.0, "Vo": 254000}
            ]
        }
    )

    result = jquants_client.get_daily_bars("7203", days=90)

    assert result == [
        {"date": "2026-09-28", "o": 1200.0, "h": 1250.0, "l": 1190.0, "c": 1234.0, "v": 254000}
    ]
    called_url = mock_get.call_args.args[0]
    assert "/equities/bars/daily" in called_url
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_jquants_client.py -v`
Expected: FAIL(モジュール未定義)

- [ ] **Step 3: 実装**

`backend/app/jquants_client.py`を新規作成:

```python
import os
import time

import requests

JQUANTS_API_KEY = os.environ.get("JQUANTS_API_KEY", "")
JQUANTS_BASE_URL = os.environ.get("JQUANTS_BASE_URL", "https://api.jquants.com/v2")
JQUANTS_RATE_LIMIT_PER_64S = int(os.environ.get("JQUANTS_RATE_LIMIT_PER_64S", "5"))
JQUANTS_MAX_STOCKS = int(os.environ.get("JQUANTS_MAX_STOCKS", "10"))

_RATE_WINDOW_SECONDS = 64


class JQuantsError(Exception):
    pass


def _headers() -> dict:
    return {"x-api-key": JQUANTS_API_KEY}


def pace_requests() -> None:
    """Sleeps long enough to stay within JQUANTS_RATE_LIMIT_PER_64S requests
    per 64-second window. Call once per outgoing request."""
    if JQUANTS_RATE_LIMIT_PER_64S <= 0:
        return
    time.sleep(_RATE_WINDOW_SECONDS / JQUANTS_RATE_LIMIT_PER_64S)


def list_prime_stocks() -> list[dict]:
    response = requests.get(f"{JQUANTS_BASE_URL}/equities/master", headers=_headers())
    if response.status_code != 200:
        raise JQuantsError(f"failed to fetch listed stocks: {response.status_code}")

    rows = response.json().get("data", [])
    prime_rows = [row for row in rows if row.get("MarketCodeName") == "プライム"]
    stocks = [{"code": row["Code"], "name": row["CompanyName"]} for row in prime_rows]
    return stocks[:JQUANTS_MAX_STOCKS]


def get_daily_bars(code: str, days: int = 90) -> list[dict]:
    response = requests.get(
        f"{JQUANTS_BASE_URL}/equities/bars/daily",
        headers=_headers(),
        params={"code": code, "days": days},
    )
    if response.status_code != 200:
        raise JQuantsError(f"failed to fetch daily bars for {code}: {response.status_code}")

    rows = response.json().get("data", [])
    return [
        {
            "date": row["Date"],
            "o": float(row["O"]),
            "h": float(row["H"]),
            "l": float(row["L"]),
            "c": float(row["C"]),
            "v": int(row["Vo"]),
        }
        for row in rows
    ]
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_jquants_client.py -v`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd backend && git add app/jquants_client.py tests/test_jquants_client.py
git commit -m "feat(backend): add jquants_client for J-Quants API V2"
```

---

### Task 5: `trend_candidate_service.py`(新規、クールダウン判定・スキャン実行)

**Files:**
- Create: `backend/app/trend_candidate_service.py`
- Create: `backend/tests/test_trend_candidate_service.py`

**Interfaces:**
- Consumes: `trend_system_service.get_value`/`set_value`(Task2)、`jquants_client.list_prime_stocks`/`get_daily_bars`/`pace_requests`(Task4)
- Produces: `is_cooldown_active(db) -> bool`、`remaining_cooldown_seconds(db) -> int`、`run_scan(db) -> int`(保存した銘柄数を返す)、`list_active_candidates(db) -> list[TrendCandidate]`

- [ ] **Step 1: 失敗するテストを書く**

`backend/tests/test_trend_candidate_service.py`を新規作成:

```python
from datetime import datetime, timedelta

from app import trend_candidate_service, trend_system_service


def test_is_cooldown_active_false_when_never_run(db_session):
    assert trend_candidate_service.is_cooldown_active(db_session) is False


def test_is_cooldown_active_true_within_24_hours(db_session):
    recent = (datetime.utcnow() - timedelta(hours=1)).isoformat()
    trend_system_service.set_value(db_session, "screening_last_run_at", recent)

    assert trend_candidate_service.is_cooldown_active(db_session) is True


def test_is_cooldown_active_false_after_24_hours(db_session):
    old = (datetime.utcnow() - timedelta(hours=25)).isoformat()
    trend_system_service.set_value(db_session, "screening_last_run_at", old)

    assert trend_candidate_service.is_cooldown_active(db_session) is False


def test_remaining_cooldown_seconds_is_positive_within_window(db_session):
    recent = (datetime.utcnow() - timedelta(hours=1)).isoformat()
    trend_system_service.set_value(db_session, "screening_last_run_at", recent)

    remaining = trend_candidate_service.remaining_cooldown_seconds(db_session)

    assert 0 < remaining <= 23 * 3600 + 60 * 60


def test_run_scan_truncates_and_reinserts_candidates(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_candidate_service.jquants_client,
        "list_prime_stocks",
        lambda: [{"code": "7203", "name": "トヨタ自動車"}],
    )
    monkeypatch.setattr(
        trend_candidate_service.jquants_client,
        "get_daily_bars",
        lambda code, days=90: [{"date": "2026-09-28", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1}],
    )
    monkeypatch.setattr(trend_candidate_service.jquants_client, "pace_requests", lambda: None)

    saved = trend_candidate_service.run_scan(db_session)

    assert saved == 1
    candidates = trend_candidate_service.list_active_candidates(db_session)
    assert len(candidates) == 1
    assert candidates[0].code == "7203"
    assert trend_system_service.get_value(db_session, "screening_last_run_at") is not None


def test_run_scan_skips_stocks_that_fail_to_fetch(db_session, monkeypatch):
    from app.jquants_client import JQuantsError

    monkeypatch.setattr(
        trend_candidate_service.jquants_client,
        "list_prime_stocks",
        lambda: [{"code": "7203", "name": "トヨタ自動車"}, {"code": "9999", "name": "失敗銘柄"}],
    )

    def fake_get_daily_bars(code, days=90):
        if code == "9999":
            raise JQuantsError("boom")
        return [{"date": "2026-09-28", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1}]

    monkeypatch.setattr(
        trend_candidate_service.jquants_client, "get_daily_bars", fake_get_daily_bars
    )
    monkeypatch.setattr(trend_candidate_service.jquants_client, "pace_requests", lambda: None)

    saved = trend_candidate_service.run_scan(db_session)

    assert saved == 1
    candidates = trend_candidate_service.list_active_candidates(db_session)
    assert [c.code for c in candidates] == ["7203"]


def test_run_scan_clears_previous_results(db_session, monkeypatch):
    from app import models

    condition = models.TrendCandidateCondition(name="x", condition={})
    db_session.add(condition)
    db_session.commit()
    db_session.refresh(condition)
    db_session.add(models.TrendCandidateResult(condition_id=condition.id, code="7203"))
    db_session.commit()

    monkeypatch.setattr(trend_candidate_service.jquants_client, "list_prime_stocks", lambda: [])
    monkeypatch.setattr(trend_candidate_service.jquants_client, "pace_requests", lambda: None)

    trend_candidate_service.run_scan(db_session)

    from sqlalchemy import select

    remaining = db_session.execute(select(models.TrendCandidateResult)).scalars().all()
    assert remaining == []
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trend_candidate_service.py -v`
Expected: FAIL(モジュール未定義)

- [ ] **Step 3: 実装**

`backend/app/trend_candidate_service.py`を新規作成:

```python
import logging
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import jquants_client, models, trend_system_service

logger = logging.getLogger(__name__)

LAST_RUN_KEY = "screening_last_run_at"
_COOLDOWN = timedelta(hours=24)


def _last_run_at(db: Session) -> datetime | None:
    value = trend_system_service.get_value(db, LAST_RUN_KEY)
    if value is None:
        return None
    return datetime.fromisoformat(value)


def is_cooldown_active(db: Session) -> bool:
    last_run = _last_run_at(db)
    if last_run is None:
        return False
    return datetime.utcnow() - last_run < _COOLDOWN


def remaining_cooldown_seconds(db: Session) -> int:
    last_run = _last_run_at(db)
    if last_run is None:
        return 0
    remaining = _COOLDOWN - (datetime.utcnow() - last_run)
    return max(int(remaining.total_seconds()), 0)


def list_active_candidates(db: Session) -> list[models.TrendCandidate]:
    stmt = select(models.TrendCandidate).where(models.TrendCandidate.deleted_at.is_(None))
    return list(db.execute(stmt).scalars().all())


def run_scan(db: Session) -> int:
    trend_system_service.set_value(db, LAST_RUN_KEY, datetime.utcnow().isoformat())

    stocks = jquants_client.list_prime_stocks()
    saved_rows = []
    for stock in stocks:
        jquants_client.pace_requests()
        try:
            bars = jquants_client.get_daily_bars(stock["code"])
        except jquants_client.JQuantsError:
            logger.warning("failed to fetch daily bars for %s", stock["code"], exc_info=True)
            continue
        saved_rows.append(
            models.TrendCandidate(
                code=stock["code"], name=stock["name"], detail={"history": bars}
            )
        )

    db.execute(delete(models.TrendCandidate))
    db.execute(delete(models.TrendCandidateResult))
    for row in saved_rows:
        db.add(row)
    db.commit()
    return len(saved_rows)
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trend_candidate_service.py -v`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd backend && git add app/trend_candidate_service.py tests/test_trend_candidate_service.py
git commit -m "feat(backend): add trend_candidate_service with cooldown and scan"
```

---

### Task 6: `trend_candidate_condition_service.py`(新規)

**Files:**
- Create: `backend/app/trend_candidate_condition_service.py`
- Create: `backend/tests/test_trend_candidate_condition_service.py`

**Interfaces:**
- Produces: `DEFAULT_SIGNAL_PARAMS: dict`(Global Constraintsの12シグナル既定値そのもの)、`create_condition(db, enabled_signals: list[str]) -> TrendCandidateCondition`、`list_conditions(db) -> list[TrendCandidateCondition]`、`rename_condition(db, condition_id: int, name: str) -> TrendCandidateCondition | None`、`soft_delete_condition(db, condition_id: int) -> bool`

- [ ] **Step 1: 失敗するテストを書く**

`backend/tests/test_trend_candidate_condition_service.py`を新規作成:

```python
from app import trend_candidate_condition_service


def test_create_condition_generates_timestamp_name(db_session, monkeypatch):
    import datetime as datetime_module

    class FixedDatetime(datetime_module.datetime):
        @classmethod
        def utcnow(cls):
            return datetime_module.datetime(2026, 9, 29, 14, 32)

    monkeypatch.setattr(
        trend_candidate_condition_service, "datetime", FixedDatetime
    )

    condition = trend_candidate_condition_service.create_condition(db_session, ["volume_surge"])

    assert condition.name == "2026-09-29_1432"


def test_create_condition_merges_defaults_for_enabled_signals_only(db_session):
    condition = trend_candidate_condition_service.create_condition(db_session, ["volume_surge"])

    assert condition.condition["volume_surge"]["enabled"] is True
    assert condition.condition["volume_surge"]["multiplier"] == 1.5
    assert condition.condition["ma_trend"]["enabled"] is False


def test_list_conditions_excludes_soft_deleted(db_session):
    trend_candidate_condition_service.create_condition(db_session, ["volume_surge"])
    to_delete = trend_candidate_condition_service.create_condition(db_session, ["ma_trend"])
    trend_candidate_condition_service.soft_delete_condition(db_session, to_delete.id)

    active = trend_candidate_condition_service.list_conditions(db_session)

    assert len(active) == 1


def test_rename_condition_updates_name(db_session):
    condition = trend_candidate_condition_service.create_condition(db_session, ["volume_surge"])

    renamed = trend_candidate_condition_service.rename_condition(
        db_session, condition.id, "出来高重視セット"
    )

    assert renamed.name == "出来高重視セット"


def test_rename_condition_returns_none_when_not_found(db_session):
    assert trend_candidate_condition_service.rename_condition(db_session, 9999, "x") is None


def test_soft_delete_condition_returns_false_when_not_found(db_session):
    assert trend_candidate_condition_service.soft_delete_condition(db_session, 9999) is False
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trend_candidate_condition_service.py -v`
Expected: FAIL(モジュール未定義)

- [ ] **Step 3: 実装**

`backend/app/trend_candidate_condition_service.py`を新規作成:

```python
import copy
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models

DEFAULT_SIGNAL_PARAMS = {
    "ma_trend": {"enabled": False, "short_period": 5, "long_period": 25},
    "bullish_candle_ratio": {"enabled": False, "period_days": 5, "min_bullish_count": 3},
    "volume_surge": {"enabled": False, "period_days": 20, "multiplier": 1.5},
    "rebound_pct": {"enabled": False, "lookback_days": 20, "threshold_pct": 5},
    "bollinger_position": {"enabled": False, "period": 20, "std_dev": 2, "max_band_pct": 0.9},
    "golden_cross_recent": {
        "enabled": False, "short_period": 5, "long_period": 25, "recent_days": 5
    },
    "macd_golden_cross": {"enabled": False, "fast": 12, "slow": 26, "signal": 9},
    "rsi": {"enabled": False, "period_days": 14, "lower": 30, "upper": 70},
    "candle_quality": {"enabled": False, "body_ratio_min": 0.6},
    "high_break": {"enabled": False, "lookback_days": 20},
    "sector_relative_strength": {"enabled": False, "period_days": 20, "outperform_pct": 0},
    "ma_deviation": {"enabled": False, "period": 25, "max_deviation_pct": 10},
}


def create_condition(db: Session, enabled_signals: list[str]) -> models.TrendCandidateCondition:
    condition_json = copy.deepcopy(DEFAULT_SIGNAL_PARAMS)
    for key in enabled_signals:
        if key in condition_json:
            condition_json[key]["enabled"] = True

    name = datetime.utcnow().strftime("%Y-%m-%d_%H%M")
    condition = models.TrendCandidateCondition(name=name, condition=condition_json)
    db.add(condition)
    db.commit()
    db.refresh(condition)
    return condition


def list_conditions(db: Session) -> list[models.TrendCandidateCondition]:
    stmt = (
        select(models.TrendCandidateCondition)
        .where(models.TrendCandidateCondition.deleted_at.is_(None))
        .order_by(models.TrendCandidateCondition.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


def rename_condition(
    db: Session, condition_id: int, name: str
) -> models.TrendCandidateCondition | None:
    stmt = select(models.TrendCandidateCondition).where(
        models.TrendCandidateCondition.id == condition_id,
        models.TrendCandidateCondition.deleted_at.is_(None),
    )
    condition = db.execute(stmt).scalars().first()
    if condition is None:
        return None
    condition.name = name
    db.commit()
    db.refresh(condition)
    return condition


def soft_delete_condition(db: Session, condition_id: int) -> bool:
    stmt = select(models.TrendCandidateCondition).where(
        models.TrendCandidateCondition.id == condition_id,
        models.TrendCandidateCondition.deleted_at.is_(None),
    )
    condition = db.execute(stmt).scalars().first()
    if condition is None:
        return False
    condition.deleted_at = datetime.utcnow()
    db.commit()
    return True
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trend_candidate_condition_service.py -v`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd backend && git add app/trend_candidate_condition_service.py tests/test_trend_candidate_condition_service.py
git commit -m "feat(backend): add trend_candidate_condition_service"
```

---

### Task 7: `trend_candidate_result_service.py`(新規)

**Files:**
- Create: `backend/app/trend_candidate_result_service.py`
- Create: `backend/tests/test_trend_candidate_result_service.py`

**Interfaces:**
- Consumes: `screening_signals.SIGNAL_FUNCTIONS`(Task3)、`trend_candidate_service.list_active_candidates`(Task5)、`models.TrendCandidateCondition`(Task1)
- Produces: `run_search(db, condition: TrendCandidateCondition) -> list[str]`(該当した銘柄コードのリスト、`trend_candidate_result`へ保存する)、`get_cached_results(db, condition_id: int, page: int, page_size: int) -> tuple[list[dict], int]`(`(items, total)`。各itemは`{"code", "name", "price", "matched_signals"}`)

- [ ] **Step 1: 失敗するテストを書く**

`backend/tests/test_trend_candidate_result_service.py`を新規作成:

```python
from app import models, trend_candidate_condition_service, trend_candidate_result_service


def _bar(price=1000.0):
    return {"date": "2026-09-28", "o": price, "h": price, "l": price, "c": price, "v": 100000}


def test_run_search_matches_only_stocks_meeting_all_enabled_signals(db_session):
    matching = models.TrendCandidate(
        code="7203",
        name="トヨタ自動車",
        detail={"history": [_bar(1000.0)] * 25 + [_bar(1100.0)]},
    )
    non_matching = models.TrendCandidate(
        code="6758", name="ソニーグループ", detail={"history": [_bar(1000.0)] * 26}
    )
    db_session.add_all([matching, non_matching])
    db_session.commit()

    condition = trend_candidate_condition_service.create_condition(db_session, ["high_break"])

    matched_codes = trend_candidate_result_service.run_search(db_session, condition)

    assert matched_codes == ["7203"]


def test_run_search_persists_results_tied_to_condition_id(db_session):
    db_session.add(
        models.TrendCandidate(code="7203", name="トヨタ自動車", detail={"history": [_bar()] * 30})
    )
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, [])

    trend_candidate_result_service.run_search(db_session, condition)

    from sqlalchemy import select

    rows = db_session.execute(
        select(models.TrendCandidateResult).where(
            models.TrendCandidateResult.condition_id == condition.id
        )
    ).scalars().all()
    assert [r.code for r in rows] == ["7203"]


def test_get_cached_results_returns_items_and_total_without_recompute(db_session):
    db_session.add(
        models.TrendCandidate(code="7203", name="トヨタ自動車", detail={"history": [_bar()] * 30})
    )
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


def test_get_cached_results_paginates(db_session):
    for i in range(3):
        db_session.add(
            models.TrendCandidate(
                code=f"code{i}", name=f"name{i}", detail={"history": [_bar()] * 30}
            )
        )
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, [])
    trend_candidate_result_service.run_search(db_session, condition)

    items, total = trend_candidate_result_service.get_cached_results(
        db_session, condition.id, page=1, page_size=2
    )

    assert total == 3
    assert len(items) == 2
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trend_candidate_result_service.py -v`
Expected: FAIL(モジュール未定義)

- [ ] **Step 3: 実装**

`backend/app/trend_candidate_result_service.py`を新規作成:

```python
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import models, screening_signals, trend_candidate_service


def run_search(db: Session, condition: models.TrendCandidateCondition) -> list[str]:
    enabled_signals = [
        key for key, params in condition.condition.items() if params.get("enabled")
    ]

    matched_codes = []
    for candidate in trend_candidate_service.list_active_candidates(db):
        history = candidate.detail.get("history", [])
        all_met = True
        for signal_key in enabled_signals:
            params = condition.condition[signal_key]
            fn = screening_signals.SIGNAL_FUNCTIONS[signal_key]
            if not fn(history, params)["met"]:
                all_met = False
                break
        if all_met:
            matched_codes.append(candidate.code)

    db.execute(
        delete(models.TrendCandidateResult).where(
            models.TrendCandidateResult.condition_id == condition.id
        )
    )
    for code in matched_codes:
        db.add(models.TrendCandidateResult(condition_id=condition.id, code=code))
    db.commit()
    return matched_codes


def get_cached_results(
    db: Session, condition_id: int, page: int, page_size: int
) -> tuple[list[dict], int]:
    condition = db.execute(
        select(models.TrendCandidateCondition).where(
            models.TrendCandidateCondition.id == condition_id
        )
    ).scalars().first()
    enabled_signals = []
    if condition is not None:
        enabled_signals = [
            key for key, params in condition.condition.items() if params.get("enabled")
        ]

    result_rows = db.execute(
        select(models.TrendCandidateResult).where(
            models.TrendCandidateResult.condition_id == condition_id,
            models.TrendCandidateResult.deleted_at.is_(None),
        )
    ).scalars().all()
    total = len(result_rows)

    codes_page = [r.code for r in result_rows][(page - 1) * page_size : page * page_size]
    candidates_by_code = {
        c.code: c
        for c in db.execute(
            select(models.TrendCandidate).where(models.TrendCandidate.code.in_(codes_page))
        ).scalars().all()
    }

    items = []
    for code in codes_page:
        candidate = candidates_by_code.get(code)
        if candidate is None:
            continue
        history = candidate.detail.get("history", [])
        price = history[-1]["c"] if history else None
        items.append(
            {
                "code": code,
                "name": candidate.name,
                "price": price,
                "matched_signals": enabled_signals,
            }
        )

    return items, total
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trend_candidate_result_service.py -v`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd backend && git add app/trend_candidate_result_service.py tests/test_trend_candidate_result_service.py
git commit -m "feat(backend): add trend_candidate_result_service"
```

---

### Task 8: `schemas.py`拡張 + `routers/screening.py`(scan/status)

**Files:**
- Modify: `backend/app/schemas.py`
- Create: `backend/app/routers/screening.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_screening_scan_status_api.py`

**Interfaces:**
- Consumes: `trend_candidate_service`(Task5)、`jquants_client`(Task4、`JQUANTS_API_KEY`/`JQUANTS_RATE_LIMIT_PER_64S`/`JQUANTS_MAX_STOCKS`)
- Produces: `POST /screening/scan`、`GET /screening/status`

- [ ] **Step 1: `schemas.py`へ追加**

`backend/app/schemas.py`の末尾へ追加:

```python
class ScreeningScanResponse(BaseModel):
    started: bool


class ScreeningStatusOut(BaseModel):
    api_key_configured: bool
    cooldown_active: bool
    remaining_cooldown_seconds: int
    rate_limit_per_64s: int
    max_stocks: int
    is_free_mode: bool
```

- [ ] **Step 2: `routers/screening.py`を新規作成**

```python
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import jquants_client, trend_candidate_service
from ..db import get_db
from ..schemas import ScreeningScanResponse, ScreeningStatusOut

router = APIRouter(prefix="/screening", tags=["screening"])


@router.post("/scan", response_model=ScreeningScanResponse)
def start_scan(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if not jquants_client.JQUANTS_API_KEY:
        raise HTTPException(status_code=400, detail="J-Quants APIキーが未設定です")
    if trend_candidate_service.is_cooldown_active(db):
        raise HTTPException(status_code=423, detail="クールダウン中のため取得できません")

    background_tasks.add_task(trend_candidate_service.run_scan, db)
    return ScreeningScanResponse(started=True)


@router.get("/status", response_model=ScreeningStatusOut)
def get_status(db: Session = Depends(get_db)):
    return ScreeningStatusOut(
        api_key_configured=bool(jquants_client.JQUANTS_API_KEY),
        cooldown_active=trend_candidate_service.is_cooldown_active(db),
        remaining_cooldown_seconds=trend_candidate_service.remaining_cooldown_seconds(db),
        rate_limit_per_64s=jquants_client.JQUANTS_RATE_LIMIT_PER_64S,
        max_stocks=jquants_client.JQUANTS_MAX_STOCKS,
        is_free_mode=jquants_client.JQUANTS_RATE_LIMIT_PER_64S <= 5,
    )
```

- [ ] **Step 3: `main.py`へ組み込み**

`backend/app/main.py`のimport文を以下で置き換える:

```python
from .routers import screening, trend_groups, trend_prices, trends
```

`app.include_router(trend_prices.router)`の直後へ追加:

```python
app.include_router(screening.router)
```

- [ ] **Step 4: 失敗するテストを書く**

`backend/tests/test_screening_scan_status_api.py`を新規作成:

```python
from app import jquants_client


def test_status_reports_api_key_not_configured(client, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "")

    response = client.get("/screening/status")

    assert response.status_code == 200
    assert response.json()["api_key_configured"] is False


def test_scan_rejected_when_api_key_missing(client, monkeypatch):
    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "")

    response = client.post("/screening/scan")

    assert response.status_code == 400


def test_scan_rejected_during_cooldown(client, monkeypatch):
    from datetime import datetime

    from app import trend_candidate_service

    monkeypatch.setattr(jquants_client, "JQUANTS_API_KEY", "test-key")
    monkeypatch.setattr(trend_candidate_service, "is_cooldown_active", lambda db: True)

    response = client.post("/screening/scan")

    assert response.status_code == 423
```

- [ ] **Step 5: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_screening_scan_status_api.py -v`
Expected: FAIL(実装前)

- [ ] **Step 6: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_screening_scan_status_api.py -v`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
cd backend && git add app/schemas.py app/routers/screening.py app/main.py tests/test_screening_scan_status_api.py
git commit -m "feat(backend): add /screening/scan and /screening/status endpoints"
```

---

### Task 9: `routers/screening.py`拡張(search/conditions CRUD)

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/screening.py`
- Create: `backend/tests/test_screening_search_conditions_api.py`

**Interfaces:**
- Consumes: `trend_candidate_condition_service`(Task6)、`trend_candidate_result_service.run_search`(Task7)
- Produces: `POST /screening/search`、`GET /screening/conditions`、`PATCH /screening/conditions/{id}`、`DELETE /screening/conditions/{id}`

- [ ] **Step 1: `schemas.py`へ追加**

```python
class ScreeningSearchRequest(BaseModel):
    enabled_signals: list[str]


class ScreeningSearchResponse(BaseModel):
    condition_id: int
    condition_name: str
    matched_count: int


class ScreeningConditionOut(BaseModel):
    id: int
    name: str
    enabled_signals: list[str]


class ScreeningConditionRenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
```

- [ ] **Step 2: `routers/screening.py`へ追加**

import文を以下で置き換える:

```python
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import (
    jquants_client,
    models,
    trend_candidate_condition_service,
    trend_candidate_result_service,
    trend_candidate_service,
)
from ..db import get_db
from ..schemas import (
    DeleteResponse,
    ScreeningConditionOut,
    ScreeningConditionRenameRequest,
    ScreeningScanResponse,
    ScreeningSearchRequest,
    ScreeningSearchResponse,
    ScreeningStatusOut,
)
```

ファイル末尾へ追加:

```python
@router.post("/search", response_model=ScreeningSearchResponse)
def search(body: ScreeningSearchRequest, db: Session = Depends(get_db)):
    condition = trend_candidate_condition_service.create_condition(db, body.enabled_signals)
    matched = trend_candidate_result_service.run_search(db, condition)
    return ScreeningSearchResponse(
        condition_id=condition.id, condition_name=condition.name, matched_count=len(matched)
    )


def _to_condition_out(condition: models.TrendCandidateCondition) -> ScreeningConditionOut:
    enabled_signals = [key for key, params in condition.condition.items() if params.get("enabled")]
    return ScreeningConditionOut(id=condition.id, name=condition.name, enabled_signals=enabled_signals)


@router.get("/conditions", response_model=list[ScreeningConditionOut])
def list_conditions(db: Session = Depends(get_db)):
    return [_to_condition_out(c) for c in trend_candidate_condition_service.list_conditions(db)]


@router.patch("/conditions/{condition_id}", response_model=ScreeningConditionOut)
def rename_condition(
    condition_id: int, body: ScreeningConditionRenameRequest, db: Session = Depends(get_db)
):
    condition = trend_candidate_condition_service.rename_condition(db, condition_id, body.name)
    if condition is None:
        raise HTTPException(status_code=404, detail=f"条件ID {condition_id} は見つかりません")
    return _to_condition_out(condition)


@router.delete("/conditions/{condition_id}", response_model=DeleteResponse)
def delete_condition(condition_id: int, db: Session = Depends(get_db)):
    deleted = trend_candidate_condition_service.soft_delete_condition(db, condition_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"条件ID {condition_id} は見つかりません")
    return DeleteResponse(deleted=True)
```

- [ ] **Step 3: 失敗するテストを書く**

`backend/tests/test_screening_search_conditions_api.py`を新規作成:

```python
from app import models


def test_search_creates_condition_and_returns_matched_count(client, db_session_factory=None):
    from app.db import get_db
    from app.main import app

    # Insert a candidate directly through the client's session override.
    session_local = client.session_local
    session = session_local()
    session.add(
        models.TrendCandidate(
            code="7203",
            name="トヨタ自動車",
            detail={"history": [{"date": "2026-09-28", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1}] * 30},
        )
    )
    session.commit()
    session.close()

    response = client.post("/screening/search", json={"enabled_signals": []})

    assert response.status_code == 200
    body = response.json()
    assert body["matched_count"] == 1
    assert "condition_id" in body


def test_list_conditions_returns_created_condition(client):
    client.post("/screening/search", json={"enabled_signals": ["volume_surge"]})

    response = client.get("/screening/conditions")

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_rename_condition_success(client):
    search_response = client.post("/screening/search", json={"enabled_signals": []})
    condition_id = search_response.json()["condition_id"]

    response = client.patch(f"/screening/conditions/{condition_id}", json={"name": "出来高重視セット"})

    assert response.status_code == 200
    assert response.json()["name"] == "出来高重視セット"


def test_rename_condition_not_found_returns_404(client):
    response = client.patch("/screening/conditions/9999", json={"name": "x"})

    assert response.status_code == 404


def test_delete_condition_removes_from_list(client):
    search_response = client.post("/screening/search", json={"enabled_signals": []})
    condition_id = search_response.json()["condition_id"]

    delete_response = client.delete(f"/screening/conditions/{condition_id}")
    assert delete_response.status_code == 200

    list_response = client.get("/screening/conditions")
    assert list_response.json() == []
```

- [ ] **Step 4: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_screening_search_conditions_api.py -v`
Expected: FAIL(実装前)

- [ ] **Step 5: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_screening_search_conditions_api.py -v`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
cd backend && git add app/schemas.py app/routers/screening.py tests/test_screening_search_conditions_api.py
git commit -m "feat(backend): add /screening/search and conditions CRUD endpoints"
```

---

### Task 10: `routers/screening.py`拡張(results/register)

**Files:**
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/screening.py`
- Create: `backend/tests/test_screening_results_register_api.py`

**Interfaces:**
- Consumes: `trend_candidate_result_service.get_cached_results`(Task7)、`trend_service.get_active_trend`/`create_trend`(既存)
- Produces: `GET /screening/results/{condition_id}`、`POST /screening/register`

- [ ] **Step 1: `schemas.py`へ追加**

```python
class ScreeningResultItemOut(BaseModel):
    code: str
    name: str
    price: float | None
    matched_signals: list[str]


class ScreeningResultsOut(BaseModel):
    condition_id: int
    total: int
    page: int
    page_size: int
    items: list[ScreeningResultItemOut]


class ScreeningRegisterRequest(BaseModel):
    codes: list[str]


class ScreeningRegisterResponse(BaseModel):
    registered: list[str]
    skipped_count: int
```

- [ ] **Step 2: `routers/screening.py`へ追加**

import文を以下で置き換える(`from .. import (...)`ブロック):

```python
from .. import (
    jquants_client,
    models,
    trend_candidate_condition_service,
    trend_candidate_result_service,
    trend_candidate_service,
    trend_service,
)
```

`from ..schemas import (...)`ブロックへ以下を追加:

```python
    ScreeningRegisterRequest,
    ScreeningRegisterResponse,
    ScreeningResultsOut,
```

ファイル末尾へ追加:

```python
@router.get("/results/{condition_id}", response_model=ScreeningResultsOut)
def get_results(
    condition_id: int, page: int = 1, page_size: int = 20, db: Session = Depends(get_db)
):
    items, total = trend_candidate_result_service.get_cached_results(
        db, condition_id, page=page, page_size=page_size
    )
    return ScreeningResultsOut(
        condition_id=condition_id, total=total, page=page, page_size=page_size, items=items
    )


@router.post("/register", response_model=ScreeningRegisterResponse)
def register(body: ScreeningRegisterRequest, db: Session = Depends(get_db)):
    registered = []
    skipped_count = 0
    for code in body.codes:
        if trend_service.get_active_trend(db, code) is not None:
            skipped_count += 1
            continue
        trend_service.create_trend(db, code)
        registered.append(code)
    return ScreeningRegisterResponse(registered=registered, skipped_count=skipped_count)
```

- [ ] **Step 3: 失敗するテストを書く**

`backend/tests/test_screening_results_register_api.py`を新規作成:

```python
from app import models


def test_get_results_returns_cached_items(client):
    session = client.session_local()
    session.add(
        models.TrendCandidate(
            code="7203",
            name="トヨタ自動車",
            detail={"history": [{"date": "2026-09-28", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1}] * 30},
        )
    )
    session.commit()
    session.close()

    search_response = client.post("/screening/search", json={"enabled_signals": []})
    condition_id = search_response.json()["condition_id"]

    response = client.get(f"/screening/results/{condition_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["code"] == "7203"


def test_register_adds_new_codes_and_skips_existing(client, monkeypatch):
    from app import trend_service

    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    client.post("/trends", json={"code": "7203"})

    response = client.post("/screening/register", json={"codes": ["7203", "6758"]})

    assert response.status_code == 200
    body = response.json()
    assert body["registered"] == ["6758"]
    assert body["skipped_count"] == 1
```

- [ ] **Step 4: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_screening_results_register_api.py -v`
Expected: FAIL(実装前)

- [ ] **Step 5: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_screening_results_register_api.py -v`
Expected: PASS

- [ ] **Step 6: バックエンド全テストを実行**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/ -v`
Expected: 全件PASS

- [ ] **Step 7: コミット**

```bash
cd backend && git add app/schemas.py app/routers/screening.py tests/test_screening_results_register_api.py
git commit -m "feat(backend): add /screening/results and /screening/register endpoints"
```

---

### Task 11: frontend `types.ts`拡張 + `api/screening.ts`(新規)

**Files:**
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/api/screening.ts`
- Create: `frontend/src/api/screening.test.ts`

**Interfaces:**
- Produces(types.ts): `ScreeningStatus`、`ScreeningCondition`、`ScreeningSearchResult`、`ScreeningResultItem`、`ScreeningResultsPage`、`ScreeningRegisterResult`
- Produces(api/screening.ts): `fetchScreeningStatus()`、`startScreeningScan()`、`runScreeningSearch(enabledSignals: string[])`、`fetchScreeningConditions()`、`renameScreeningCondition(id, name)`、`deleteScreeningCondition(id)`、`fetchScreeningResults(conditionId, page, pageSize)`、`registerScreeningResults(codes: string[])`

- [ ] **Step 1: `types.ts`の末尾へ追加**

```typescript
export interface ScreeningStatus {
  api_key_configured: boolean;
  cooldown_active: boolean;
  remaining_cooldown_seconds: number;
  rate_limit_per_64s: number;
  max_stocks: number;
  is_free_mode: boolean;
}

export interface ScreeningCondition {
  id: number;
  name: string;
  enabled_signals: string[];
}

export interface ScreeningSearchResult {
  condition_id: number;
  condition_name: string;
  matched_count: number;
}

export interface ScreeningResultItem {
  code: string;
  name: string;
  price: number | null;
  matched_signals: string[];
}

export interface ScreeningResultsPage {
  condition_id: number;
  total: number;
  page: number;
  page_size: number;
  items: ScreeningResultItem[];
}

export interface ScreeningRegisterResult {
  registered: string[];
  skipped_count: number;
}
```

- [ ] **Step 2: 失敗するテストを書く**

`frontend/src/api/screening.test.ts`を新規作成:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteScreeningCondition,
  fetchScreeningConditions,
  fetchScreeningResults,
  fetchScreeningStatus,
  registerScreeningResults,
  renameScreeningCondition,
  runScreeningSearch,
  startScreeningScan,
} from "./screening";

describe("screening api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchScreeningStatus GETs /screening/status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        api_key_configured: true,
        cooldown_active: false,
        remaining_cooldown_seconds: 0,
        rate_limit_per_64s: 5,
        max_stocks: 10,
        is_free_mode: true,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchScreeningStatus();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/screening/status"),
      expect.anything()
    );
  });

  it("startScreeningScan POSTs /screening/scan", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ started: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await startScreeningScan();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/screening/scan"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("runScreeningSearch POSTs enabled_signals", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ condition_id: 1, condition_name: "2026-09-29_1432", matched_count: 3 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await runScreeningSearch(["volume_surge"]);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/screening/search"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ enabled_signals: ["volume_surge"] }),
      })
    );
  });

  it("fetchScreeningConditions GETs /screening/conditions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] })
    );

    await fetchScreeningConditions();
  });

  it("renameScreeningCondition PATCHes name", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 1, name: "出来高重視セット" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await renameScreeningCondition(1, "出来高重視セット");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/screening/conditions/1"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "出来高重視セット" }),
      })
    );
  });

  it("deleteScreeningCondition DELETEs by id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ deleted: true }) })
    );

    await deleteScreeningCondition(1);
  });

  it("fetchScreeningResults GETs with page params", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ condition_id: 1, total: 0, page: 1, page_size: 20, items: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchScreeningResults(1, 1, 20);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/screening/results/1?page=1&page_size=20"),
      expect.anything()
    );
  });

  it("registerScreeningResults POSTs codes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ registered: ["7203"], skipped_count: 0 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await registerScreeningResults(["7203"]);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/screening/register"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ codes: ["7203"] }) })
    );
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/api/screening.test.ts`
Expected: FAIL(モジュール未定義)

- [ ] **Step 4: 実装**

`frontend/src/api/screening.ts`を新規作成:

```typescript
import type {
  ScreeningCondition,
  ScreeningRegisterResult,
  ScreeningResultsPage,
  ScreeningSearchResult,
  ScreeningStatus,
} from "../types";
import { apiRequest } from "./client";

export function fetchScreeningStatus(): Promise<ScreeningStatus> {
  return apiRequest<ScreeningStatus>("/screening/status");
}

export function startScreeningScan(): Promise<{ started: boolean }> {
  return apiRequest<{ started: boolean }>("/screening/scan", { method: "POST" });
}

export function runScreeningSearch(enabledSignals: string[]): Promise<ScreeningSearchResult> {
  return apiRequest<ScreeningSearchResult>("/screening/search", {
    method: "POST",
    body: JSON.stringify({ enabled_signals: enabledSignals }),
  });
}

export function fetchScreeningConditions(): Promise<ScreeningCondition[]> {
  return apiRequest<ScreeningCondition[]>("/screening/conditions");
}

export function renameScreeningCondition(id: number, name: string): Promise<ScreeningCondition> {
  return apiRequest<ScreeningCondition>(`/screening/conditions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteScreeningCondition(id: number): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(`/screening/conditions/${id}`, { method: "DELETE" });
}

export function fetchScreeningResults(
  conditionId: number,
  page: number,
  pageSize: number
): Promise<ScreeningResultsPage> {
  return apiRequest<ScreeningResultsPage>(
    `/screening/results/${conditionId}?page=${page}&page_size=${pageSize}`
  );
}

export function registerScreeningResults(codes: string[]): Promise<ScreeningRegisterResult> {
  return apiRequest<ScreeningRegisterResult>("/screening/register", {
    method: "POST",
    body: JSON.stringify({ codes }),
  });
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `cd frontend && npx vitest run src/api/screening.test.ts`
Expected: PASS

- [ ] **Step 6: 型チェック**

Run: `cd frontend && npx tsc --noEmit`
Expected: `screening.ts`/`types.ts`にエラーが無いこと(他の未実装ファイル起因のエラーは後続タスクで解消される)

- [ ] **Step 7: コミット**

```bash
cd frontend && git add src/types.ts src/api/screening.ts src/api/screening.test.ts
git commit -m "feat(frontend): add screening types and api client"
```

---

### Task 12: `useScreening.ts`(新規フック)

**計画作成時の判断メモ(spec §画面デザイン と §データフロー の食い違いへの対応):** doc-specの画面デザイン節が確定した時点(モックアップのスクリーンショット往復の最終形)ではボタン列が「編集/セレクト/適用/検索/削除/開閉トグル」の6要素のみとなり、データフロー節3.が説明する専用の「表示」ボタンは無い。本タスクでは、「適用」ボタンにチェックボックス反映(`enabledSignals`の更新)と結果表示(`loadResultsPage`呼び出し=データフロー節3.の「表示」相当の挙動)の両方を持たせることで、ボタンを増やさずにデータフロー節の要件を満たす。この判断はTask15にも及ぶ。

**Files:**
- Create: `frontend/src/hooks/useScreening.ts`
- Create: `frontend/src/hooks/useScreening.test.ts`

**Interfaces:**
- Consumes: `api/screening.ts`(Task11)
- Produces: `useScreening() -> { status, conditions, enabledSignals, setEnabledSignals, currentConditionId, results, loadingResults, error, runScan, runSearch, applyCondition(condition: ScreeningCondition), renameCondition, deleteCondition, loadResultsPage, register }`

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/hooks/useScreening.test.ts`を新規作成:

```typescript
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as screeningApi from "../api/screening";
import { useScreening } from "./useScreening";

vi.mock("../api/screening");

const sampleStatus = {
  api_key_configured: true,
  cooldown_active: false,
  remaining_cooldown_seconds: 0,
  rate_limit_per_64s: 5,
  max_stocks: 10,
  is_free_mode: true,
};

describe("useScreening", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(screeningApi.fetchScreeningStatus).mockResolvedValue(sampleStatus);
    vi.mocked(screeningApi.fetchScreeningConditions).mockResolvedValue([]);
  });

  it("loads status and conditions on mount", async () => {
    const { result } = renderHook(() => useScreening());

    await waitFor(() => expect(result.current.status).toEqual(sampleStatus));
    expect(result.current.conditions).toEqual([]);
  });

  it("runSearch calls the api and stores condition/results", async () => {
    vi.mocked(screeningApi.runScreeningSearch).mockResolvedValue({
      condition_id: 1,
      condition_name: "2026-09-29_1432",
      matched_count: 1,
    });
    vi.mocked(screeningApi.fetchScreeningResults).mockResolvedValue({
      condition_id: 1,
      total: 1,
      page: 1,
      page_size: 20,
      items: [{ code: "7203", name: "トヨタ自動車", price: 2900, matched_signals: ["volume_surge"] }],
    });
    const { result } = renderHook(() => useScreening());
    await waitFor(() => expect(result.current.status).toEqual(sampleStatus));

    await act(async () => {
      result.current.setEnabledSignals(["volume_surge"]);
      await result.current.runSearch();
    });

    expect(screeningApi.runScreeningSearch).toHaveBeenCalledWith(["volume_surge"]);
    expect(result.current.results?.items).toHaveLength(1);
  });

  it("applyCondition sets enabledSignals and loads that condition's cached results, without calling search", async () => {
    vi.mocked(screeningApi.fetchScreeningResults).mockResolvedValue({
      condition_id: 5,
      total: 0,
      page: 1,
      page_size: 20,
      items: [],
    });
    const { result } = renderHook(() => useScreening());
    await waitFor(() => expect(result.current.status).toEqual(sampleStatus));

    await act(async () => {
      await result.current.applyCondition({ id: 5, name: "出来高重視セット", enabled_signals: ["ma_trend", "rsi"] });
    });

    expect(result.current.enabledSignals).toEqual(["ma_trend", "rsi"]);
    expect(screeningApi.fetchScreeningResults).toHaveBeenCalledWith(5, 1, 20);
    expect(screeningApi.runScreeningSearch).not.toHaveBeenCalled();
  });

  it("runScan calls startScreeningScan and reloads status", async () => {
    vi.mocked(screeningApi.startScreeningScan).mockResolvedValue({ started: true });
    const { result } = renderHook(() => useScreening());
    await waitFor(() => expect(result.current.status).toEqual(sampleStatus));

    await act(async () => {
      await result.current.runScan();
    });

    expect(screeningApi.startScreeningScan).toHaveBeenCalled();
    expect(screeningApi.fetchScreeningStatus).toHaveBeenCalledTimes(2);
  });

  it("register calls registerScreeningResults with selected codes", async () => {
    vi.mocked(screeningApi.registerScreeningResults).mockResolvedValue({
      registered: ["7203"],
      skipped_count: 0,
    });
    const { result } = renderHook(() => useScreening());
    await waitFor(() => expect(result.current.status).toEqual(sampleStatus));

    await act(async () => {
      await result.current.register(["7203"]);
    });

    expect(screeningApi.registerScreeningResults).toHaveBeenCalledWith(["7203"]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/hooks/useScreening.test.ts`
Expected: FAIL(モジュール未定義)

- [ ] **Step 3: 実装**

`frontend/src/hooks/useScreening.ts`を新規作成:

```typescript
import { useCallback, useEffect, useState } from "react";
import {
  deleteScreeningCondition,
  fetchScreeningConditions,
  fetchScreeningResults,
  fetchScreeningStatus,
  registerScreeningResults,
  renameScreeningCondition,
  runScreeningSearch,
  startScreeningScan,
} from "../api/screening";
import type {
  ScreeningCondition,
  ScreeningRegisterResult,
  ScreeningResultsPage,
  ScreeningStatus,
} from "../types";

export function useScreening() {
  const [status, setStatus] = useState<ScreeningStatus | null>(null);
  const [conditions, setConditions] = useState<ScreeningCondition[]>([]);
  const [enabledSignals, setEnabledSignals] = useState<string[]>([]);
  const [currentConditionId, setCurrentConditionId] = useState<number | null>(null);
  const [results, setResults] = useState<ScreeningResultsPage | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setStatus(await fetchScreeningStatus());
  }, []);

  const loadConditions = useCallback(async () => {
    setConditions(await fetchScreeningConditions());
  }, []);

  useEffect(() => {
    Promise.all([loadStatus(), loadConditions()]).catch((err) => setError((err as Error).message));
  }, [loadStatus, loadConditions]);

  const runScan = useCallback(async () => {
    setError(null);
    try {
      await startScreeningScan();
      await loadStatus();
    } catch (err) {
      setError((err as Error).message);
    }
  }, [loadStatus]);

  const loadResultsPage = useCallback(async (conditionId: number, page: number, pageSize = 20) => {
    setLoadingResults(true);
    setError(null);
    try {
      const page_ = await fetchScreeningResults(conditionId, page, pageSize);
      setResults(page_);
      setCurrentConditionId(conditionId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingResults(false);
    }
  }, []);

  const runSearch = useCallback(async () => {
    setError(null);
    try {
      const searchResult = await runScreeningSearch(enabledSignals);
      await loadConditions();
      await loadResultsPage(searchResult.condition_id, 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [enabledSignals, loadConditions, loadResultsPage]);

  const applyCondition = useCallback(
    async (condition: ScreeningCondition) => {
      setEnabledSignals(condition.enabled_signals);
      await loadResultsPage(condition.id, 1);
    },
    [loadResultsPage]
  );

  const renameCondition = useCallback(
    async (id: number, name: string) => {
      setError(null);
      try {
        await renameScreeningCondition(id, name);
        await loadConditions();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [loadConditions]
  );

  const deleteCondition = useCallback(
    async (id: number) => {
      setError(null);
      try {
        await deleteScreeningCondition(id);
        await loadConditions();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [loadConditions]
  );

  const register = useCallback(async (codes: string[]): Promise<ScreeningRegisterResult | null> => {
    setError(null);
    try {
      return await registerScreeningResults(codes);
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, []);

  return {
    status,
    conditions,
    enabledSignals,
    setEnabledSignals,
    currentConditionId,
    results,
    loadingResults,
    error,
    runScan,
    runSearch,
    applyCondition,
    renameCondition,
    deleteCondition,
    loadResultsPage,
    register,
  };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd frontend && npx vitest run src/hooks/useScreening.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd frontend && git add src/hooks/useScreening.ts src/hooks/useScreening.test.ts
git commit -m "feat(frontend): add useScreening hook"
```

---

### Task 13: `index.css`トークン/クラス追加 + `docker-compose.yml`/`.env.example`環境変数

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

**Interfaces:**
- Produces: `.screening-condition-grid`, `.screening-condition-row`, `.chk-row`(4列グリッド用クラス)

- [ ] **Step 1: `index.css`へクラス追加**

`.btn-outline-danger:hover { ... }`ブロックの直後へ追加:

```css
.screening-condition-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.screening-condition-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  column-gap: 20px;
  row-gap: 12px;
}

.chk-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.screening-status-note {
  font-size: 13px;
  color: var(--text-muted);
}
```

- [ ] **Step 2: `docker-compose.yml`の`backend`サービスへ環境変数追加**

`environment`ブロックの`ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}`の直後へ追加:

```yaml
      JQUANTS_API_KEY: ${JQUANTS_API_KEY:-}
      JQUANTS_BASE_URL: ${JQUANTS_BASE_URL:-https://api.jquants.com/v2}
      JQUANTS_RATE_LIMIT_PER_64S: ${JQUANTS_RATE_LIMIT_PER_64S:-5}
      JQUANTS_MAX_STOCKS: ${JQUANTS_MAX_STOCKS:-10}
```

- [ ] **Step 3: `.env.example`へ追加**

末尾へ追加:

```
# 発掘機能: J-Quants APIダッシュボードで発行したAPIキー。未設定の場合、発掘の「取得」ボタンは無効化される
JQUANTS_API_KEY=
JQUANTS_BASE_URL=https://api.jquants.com/v2
JQUANTS_RATE_LIMIT_PER_64S=5
JQUANTS_MAX_STOCKS=10
```

- [ ] **Step 4: フロントエンド全テスト+型チェック**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: CSSのみの変更のため既存テスト結果に影響無し(Task14/15時点の未実装ファイル起因のエラーは残ったままでよい)

- [ ] **Step 5: コミット**

```bash
git add frontend/src/index.css docker-compose.yml .env.example
git commit -m "feat: add screening CSS classes and JQUANTS_* env vars"
```

---

### Task 14: `ScreeningPage.tsx`本実装(ステータス/取得エリア)

**Files:**
- Modify: `frontend/src/components/ScreeningPage.tsx`
- Modify: `frontend/src/components/ScreeningPage.test.tsx`

**Interfaces:**
- Consumes: `useScreening`(Task12)

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/components/ScreeningPage.test.tsx`を以下で置き換える:

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as screeningApi from "../api/screening";
import { ThemeProvider } from "../theme/ThemeContext";
import { ScreeningPage } from "./ScreeningPage";

vi.mock("../api/screening");

describe("ScreeningPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(screeningApi.fetchScreeningConditions).mockResolvedValue([]);
  });

  it("shows a heading and a link back to the watchlist", async () => {
    vi.mocked(screeningApi.fetchScreeningStatus).mockResolvedValue({
      api_key_configured: true,
      cooldown_active: false,
      remaining_cooldown_seconds: 0,
      rate_limit_per_64s: 60,
      max_stocks: 1600,
      is_free_mode: false,
    });

    render(
      <ThemeProvider>
        <MemoryRouter>
          <ScreeningPage />
        </MemoryRouter>
      </ThemeProvider>
    );

    expect(screen.getByRole("heading", { name: "発掘" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "一覧へ戻る" })).toHaveAttribute("href", "/");
  });

  it("disables the 取得 button during cooldown", async () => {
    vi.mocked(screeningApi.fetchScreeningStatus).mockResolvedValue({
      api_key_configured: true,
      cooldown_active: true,
      remaining_cooldown_seconds: 3600,
      rate_limit_per_64s: 60,
      max_stocks: 1600,
      is_free_mode: false,
    });

    render(
      <ThemeProvider>
        <MemoryRouter>
          <ScreeningPage />
        </MemoryRouter>
      </ThemeProvider>
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "取得" })).toBeDisabled());
  });

  it("shows the free-mode note when is_free_mode is true", async () => {
    vi.mocked(screeningApi.fetchScreeningStatus).mockResolvedValue({
      api_key_configured: true,
      cooldown_active: false,
      remaining_cooldown_seconds: 0,
      rate_limit_per_64s: 5,
      max_stocks: 10,
      is_free_mode: true,
    });

    render(
      <ThemeProvider>
        <MemoryRouter>
          <ScreeningPage />
        </MemoryRouter>
      </ThemeProvider>
    );

    await waitFor(() =>
      expect(screen.getByText(/稼働モード: Free版/)).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/components/ScreeningPage.test.tsx`
Expected: FAIL(未実装のUI)

- [ ] **Step 3: 実装**

`frontend/src/components/ScreeningPage.tsx`を以下で置き換える:

```typescript
import { Link } from "react-router-dom";
import { useScreening } from "../hooks/useScreening";
import { ScreeningConditionPanel } from "./ScreeningConditionPanel";
import { ScreeningResultsPanel } from "./ScreeningResultsPanel";
import { SettingsMenu } from "./SettingsMenu";

function formatRemaining(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `あと${hours}時間${minutes}分`;
}

export function ScreeningPage() {
  const screening = useScreening();
  const { status } = screening;

  return (
    <main>
      <header className="app-header">
        <div>
          <Link to="/" className="back-link">
            一覧へ戻る
          </Link>
          <h1>発掘</h1>
        </div>
        <SettingsMenu />
      </header>
      <div className="app-body">
        <div className="detail-card" style={{ marginBottom: 20 }}>
          <div className="screening-condition-row">
            <div>
              <div>最終発掘: {status?.cooldown_active ? "実行済み" : "未実行"}</div>
              {status && status.cooldown_active && (
                <div>次回発掘可能: {formatRemaining(status.remaining_cooldown_seconds)}</div>
              )}
              {status?.is_free_mode && (
                <div className="screening-status-note">
                  稼働モード: Free版({status.rate_limit_per_64s}req/64秒・対象{status.max_stocks}銘柄)
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn btn-discovery"
              disabled={!status || status.cooldown_active || !status.api_key_configured}
              onClick={() => screening.runScan()}
            >
              取得
            </button>
          </div>
          {status && !status.api_key_configured && (
            <p role="alert" className="inline-error">
              J-Quants APIキーが未設定です
            </p>
          )}
        </div>

        <ScreeningConditionPanel screening={screening} />
        <ScreeningResultsPanel screening={screening} />

        {screening.error && (
          <p role="alert" className="inline-error">
            {screening.error}
          </p>
        )}
      </div>
    </main>
  );
}
```

`.btn-discovery`クラスが未定義のため、`frontend/src/index.css`の`.header-nav-link:hover { ... }`の直後へ追加:

```css
.btn-discovery {
  background: var(--btn-discovery-bg);
  color: var(--btn-discovery-text);
}

.btn-discovery:hover:not(:disabled) {
  background: var(--btn-discovery-hover-bg);
}

.btn-discovery:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 4: テストが通ることを確認(`ScreeningConditionPanel`/`ScreeningResultsPanel`未実装のためTask15完了までFAILのままでよい)**

Run: `cd frontend && npx vitest run src/components/ScreeningPage.test.tsx`
Expected: FAIL(`ScreeningConditionPanel`/`ScreeningResultsPanel`が存在しない — Task15で解消)

- [ ] **Step 5: コミット**

```bash
cd frontend && git add src/components/ScreeningPage.tsx src/components/ScreeningPage.test.tsx src/index.css
git commit -m "feat(frontend): implement ScreeningPage status/fetch area"
```

---

### Task 15: `ScreeningConditionPanel.tsx`(新規)

**Files:**
- Create: `frontend/src/components/ScreeningConditionPanel.tsx`
- Create: `frontend/src/components/ScreeningConditionPanel.test.tsx`

**Interfaces:**
- Consumes: `useScreening`の戻り値(Task12)
- Produces: `ScreeningConditionPanel({ screening: ReturnType<typeof useScreening> })`

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/components/ScreeningConditionPanel.test.tsx`を新規作成:

```typescript
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScreeningConditionPanel } from "./ScreeningConditionPanel";

function makeScreening(overrides = {}) {
  return {
    status: null,
    conditions: [{ id: 1, name: "出来高重視セット", enabled_signals: ["volume_surge"] }],
    enabledSignals: [] as string[],
    setEnabledSignals: vi.fn(),
    currentConditionId: null,
    results: null,
    loadingResults: false,
    error: null,
    runScan: vi.fn(),
    runSearch: vi.fn(),
    applyCondition: vi.fn(),
    renameCondition: vi.fn(),
    deleteCondition: vi.fn(),
    loadResultsPage: vi.fn(),
    register: vi.fn(),
    ...overrides,
  };
}

describe("ScreeningConditionPanel", () => {
  it("is collapsed by default (checkbox grid not shown)", () => {
    render(<ScreeningConditionPanel screening={makeScreening() as never} />);

    expect(screen.queryByLabelText("移動平均トレンド")).not.toBeInTheDocument();
  });

  it("expands the checkbox grid when the toggle is clicked", () => {
    render(<ScreeningConditionPanel screening={makeScreening() as never} />);

    fireEvent.click(screen.getByRole("button", { name: /条件を編集/ }));

    expect(screen.getByLabelText("移動平均トレンド")).toBeInTheDocument();
  });

  it("toggling a checkbox calls setEnabledSignals", () => {
    const screening = makeScreening();
    render(<ScreeningConditionPanel screening={screening as never} />);
    fireEvent.click(screen.getByRole("button", { name: /条件を編集/ }));

    fireEvent.click(screen.getByLabelText("移動平均トレンド"));

    expect(screening.setEnabledSignals).toHaveBeenCalledWith(["ma_trend"]);
  });

  it("clicking 検索 calls runSearch", () => {
    const screening = makeScreening();
    render(<ScreeningConditionPanel screening={screening as never} />);

    fireEvent.click(screen.getByRole("button", { name: "検索" }));

    expect(screening.runSearch).toHaveBeenCalled();
  });

  it("clicking 適用 calls applyCondition with the selected condition", () => {
    const screening = makeScreening();
    render(<ScreeningConditionPanel screening={screening as never} />);
    fireEvent.change(screen.getByLabelText("保存済み条件を選択"), { target: { value: "1" } });

    fireEvent.click(screen.getByRole("button", { name: "適用" }));

    expect(screening.applyCondition).toHaveBeenCalledWith({
      id: 1,
      name: "出来高重視セット",
      enabled_signals: ["volume_surge"],
    });
  });

  it("clicking 編集 switches the select to a text input, and blur renames", () => {
    const screening = makeScreening();
    render(<ScreeningConditionPanel screening={screening as never} />);
    fireEvent.change(screen.getByLabelText("保存済み条件を選択"), { target: { value: "1" } });

    fireEvent.click(screen.getByRole("button", { name: "編集" }));
    const input = screen.getByDisplayValue("出来高重視セット");
    fireEvent.change(input, { target: { value: "新しい名前" } });
    fireEvent.blur(input);

    expect(screening.renameCondition).toHaveBeenCalledWith(1, "新しい名前");
  });

  it("clicking 削除 calls deleteCondition for the selected condition", () => {
    const screening = makeScreening();
    render(<ScreeningConditionPanel screening={screening as never} />);
    fireEvent.change(screen.getByLabelText("保存済み条件を選択"), { target: { value: "1" } });

    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(screening.deleteCondition).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/components/ScreeningConditionPanel.test.tsx`
Expected: FAIL(モジュール未定義)

- [ ] **Step 3: 実装**

`frontend/src/components/ScreeningConditionPanel.tsx`を新規作成:

```typescript
import { useState } from "react";
import type { useScreening } from "../hooks/useScreening";

const SIGNAL_LABELS: Record<string, string> = {
  ma_trend: "移動平均トレンド",
  bullish_candle_ratio: "陽線優勢",
  volume_surge: "出来高増加",
  rebound_pct: "直近安値からの反発率",
  bollinger_position: "ボリンジャーバンド位置",
  golden_cross_recent: "ゴールデンクロス直近発生",
  macd_golden_cross: "MACDゴールデンクロス",
  rsi: "RSI",
  candle_quality: "陽線の質",
  high_break: "直近高値ブレイク",
  sector_relative_strength: "セクター相対強度",
  ma_deviation: "移動平均かい離率",
};

const SIGNAL_KEYS = Object.keys(SIGNAL_LABELS);

interface ScreeningConditionPanelProps {
  screening: ReturnType<typeof useScreening>;
}

export function ScreeningConditionPanel({ screening }: ScreeningConditionPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [selectedConditionId, setSelectedConditionId] = useState<number | null>(null);

  const selectedCondition = screening.conditions.find((c) => c.id === selectedConditionId) ?? null;

  const toggleSignal = (key: string) => {
    const next = screening.enabledSignals.includes(key)
      ? screening.enabledSignals.filter((s) => s !== key)
      : [...screening.enabledSignals, key];
    screening.setEnabledSignals(next);
  };

  const handleApply = () => {
    if (selectedCondition) screening.applyCondition(selectedCondition);
  };

  const handleStartEdit = () => {
    if (!selectedCondition) return;
    setNameDraft(selectedCondition.name);
    setEditingName(true);
  };

  const handleFinishEdit = () => {
    if (selectedCondition && nameDraft !== selectedCondition.name) {
      screening.renameCondition(selectedCondition.id, nameDraft);
    }
    setEditingName(false);
  };

  const handleDelete = () => {
    if (selectedCondition) screening.deleteCondition(selectedCondition.id);
  };

  return (
    <div className="detail-card" style={{ marginBottom: 20 }}>
      <div className="screening-condition-row">
        <span>条件</span>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-dark" onClick={handleStartEdit}>
            編集
          </button>
          {editingName ? (
            <input
              className="code-text-input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={handleFinishEdit}
            />
          ) : (
            <select
              className="interval-dropdown"
              aria-label="保存済み条件を選択"
              value={selectedConditionId ?? ""}
              onChange={(e) =>
                setSelectedConditionId(e.target.value === "" ? null : Number(e.target.value))
              }
            >
              <option value="">保存済み条件を選択</option>
              {screening.conditions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn btn-dark" onClick={handleApply}>
            適用
          </button>
          <button type="button" className="btn btn-primary" onClick={() => screening.runSearch()}>
            検索
          </button>
          <button type="button" className="btn btn-outline-danger" onClick={handleDelete}>
            削除
          </button>
          <button type="button" className="btn btn-dark" onClick={() => setExpanded(!expanded)}>
            {expanded ? "閉じる ▲" : "条件を編集 ▼"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="screening-condition-grid" style={{ marginTop: 14 }}>
          {SIGNAL_KEYS.map((key) => (
            <label key={key} className="chk-row">
              <input
                type="checkbox"
                aria-label={SIGNAL_LABELS[key]}
                checked={screening.enabledSignals.includes(key)}
                onChange={() => toggleSignal(key)}
              />
              {SIGNAL_LABELS[key]}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd frontend && npx vitest run src/components/ScreeningConditionPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd frontend && git add src/components/ScreeningConditionPanel.tsx src/components/ScreeningConditionPanel.test.tsx
git commit -m "feat(frontend): add ScreeningConditionPanel"
```

---

### Task 16: `ScreeningResultsPanel.tsx`(新規、結果表+ページング+登録)

**Files:**
- Create: `frontend/src/components/ScreeningResultsPanel.tsx`
- Create: `frontend/src/components/ScreeningResultsPanel.test.tsx`
- Modify: `frontend/src/components/ScreeningPage.test.tsx`

**Interfaces:**
- Consumes: `useScreening`の戻り値(Task12)
- Produces: `ScreeningResultsPanel({ screening: ReturnType<typeof useScreening> })`

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/components/ScreeningResultsPanel.test.tsx`を新規作成:

```typescript
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScreeningResultsPanel } from "./ScreeningResultsPanel";

function makeScreening(overrides = {}) {
  return {
    status: null,
    conditions: [],
    enabledSignals: [] as string[],
    setEnabledSignals: vi.fn(),
    currentConditionId: 1,
    results: {
      condition_id: 1,
      total: 1,
      page: 1,
      page_size: 20,
      items: [
        { code: "7203", name: "トヨタ自動車", price: 2900, matched_signals: ["volume_surge"] },
      ],
    },
    loadingResults: false,
    error: null,
    runScan: vi.fn(),
    runSearch: vi.fn(),
    applyCondition: vi.fn(),
    renameCondition: vi.fn(),
    deleteCondition: vi.fn(),
    loadResultsPage: vi.fn(),
    register: vi.fn().mockResolvedValue({ registered: ["7203"], skipped_count: 0 }),
    ...overrides,
  };
}

describe("ScreeningResultsPanel", () => {
  it("shows the matched count on the left and the register button on the right of the same row", () => {
    render(<ScreeningResultsPanel screening={makeScreening() as never} />);

    expect(screen.getByText("該当1件")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "選択をウォッチリストへ" })).toBeInTheDocument();
  });

  it("lists result rows with code, name, price and matched signals", () => {
    render(<ScreeningResultsPanel screening={makeScreening() as never} />);

    expect(screen.getByText("7203")).toBeInTheDocument();
    expect(screen.getByText("トヨタ自動車")).toBeInTheDocument();
  });

  it("selecting a row and clicking 選択をウォッチリストへ calls register with that code", async () => {
    const screening = makeScreening();
    render(<ScreeningResultsPanel screening={screening as never} />);

    fireEvent.click(screen.getByLabelText("7203を選択"));
    fireEvent.click(screen.getByRole("button", { name: "選択をウォッチリストへ" }));

    expect(screening.register).toHaveBeenCalledWith(["7203"]);
  });

  it("shows nothing meaningful when there are no results yet", () => {
    render(<ScreeningResultsPanel screening={makeScreening({ results: null }) as never} />);

    expect(screen.queryByText("該当1件")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/components/ScreeningResultsPanel.test.tsx`
Expected: FAIL(モジュール未定義)

- [ ] **Step 3: 実装**

`frontend/src/components/ScreeningResultsPanel.tsx`を新規作成:

```typescript
import { useState } from "react";
import type { useScreening } from "../hooks/useScreening";

interface ScreeningResultsPanelProps {
  screening: ReturnType<typeof useScreening>;
}

export function ScreeningResultsPanel({ screening }: ScreeningResultsPanelProps) {
  const { results, currentConditionId } = screening;
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [registeredCodes, setRegisteredCodes] = useState<Set<string>>(new Set());

  if (!results) return null;

  const toggle = (code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const handleRegister = async () => {
    const result = await screening.register(Array.from(selectedCodes));
    if (result) {
      setRegisteredCodes((prev) => new Set([...prev, ...result.registered]));
      setSelectedCodes(new Set());
    }
  };

  const totalPages = Math.max(Math.ceil(results.total / results.page_size), 1);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600 }}>該当{results.total}件</span>
        <button type="button" className="btn btn-dark" onClick={handleRegister}>
          選択をウォッチリストへ
        </button>
      </div>

      <table className="watchlist-table" style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th className="checkbox-col"></th>
            <th className="code-col">株式コード</th>
            <th>銘柄名</th>
            <th>現在値</th>
            <th>該当シグナル</th>
          </tr>
        </thead>
        <tbody>
          {results.items.map((item) => (
            <tr key={item.code}>
              <td className="checkbox-col">
                <input
                  type="checkbox"
                  aria-label={`${item.code}を選択`}
                  checked={selectedCodes.has(item.code)}
                  onChange={() => toggle(item.code)}
                />
              </td>
              <td>{item.code}</td>
              <td>{item.name}</td>
              <td>{item.price !== null ? `¥${item.price.toLocaleString()}` : "—"}</td>
              <td>
                {registeredCodes.has(item.code) ? "登録済み" : item.matched_signals.join("・")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "8px 0 16px" }}>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
          <span
            key={pageNum}
            style={{
              cursor: "pointer",
              fontWeight: pageNum === results.page ? 700 : 400,
              color: pageNum === results.page ? "var(--btn-primary-bg)" : undefined,
            }}
            onClick={() => currentConditionId && screening.loadResultsPage(currentConditionId, pageNum)}
          >
            {pageNum}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd frontend && npx vitest run src/components/ScreeningResultsPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: `ScreeningPage.test.tsx`の残りのFAILを解消**

Run: `cd frontend && npx vitest run src/components/ScreeningPage.test.tsx`
Expected: PASS(Task14で保留していたFAILがここで解消される)

- [ ] **Step 6: フロントエンド全テスト+型チェック**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: 全件PASS、型エラー無し

- [ ] **Step 7: コミット**

```bash
cd frontend && git add src/components/ScreeningResultsPanel.tsx src/components/ScreeningResultsPanel.test.tsx src/components/ScreeningPage.test.tsx
git commit -m "feat(frontend): add ScreeningResultsPanel and finish ScreeningPage wiring"
```
