# 機能改善 202610_01(トレンド判定・色の日本式統一・AIの3つの目線) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Jira: AIDDS-9 機能改善 202610_01

## 確認してほしい点(最初に読んでください)

実装に入る前に、次の判断を、確認してほしい。□は、私が選んだ既定。変えたい点があれば、教えてほしい。

1. **実装の順番**: Task 1(AIDDS-6 判定) → Task 2(AIDDS-7 保有一覧と色の統一) → Task 3(AIDDS-5 発掘一覧) → Task 4(AIDDS-8 AIの3つの目線)。理由は、下の「実装の順番と理由」。
2. **横ばいの閾値は 1.0%(仮)。期間(5日・25日)とあわせて、環境変数で外に出す**(了承済み): `TREND_SHORT_PERIOD`(5)、`TREND_LONG_PERIOD`(25)、`TREND_FLAT_BAND_PCT`(1.0)。`.env.example` と `docker-compose.yml` に足す(既存の `JQUANTS_*` と同じ方式)。不正な値(数値でない、短期が1未満、長期が短期以下、閾値が負)は、バックエンドの起動時に、エラーにする。値を変えたときの反映は、発掘の一覧はすぐ(表示のたびに計算)、保有銘柄は次の更新から(取得・更新のときに保存)。
3. **発掘で `ma_trend` を条件にしたとき、判定が「上昇」でない銘柄は、トレンドに何も出さない(「—」)**(あなたの指示): `ma_trend`(閾値なし)で絞り込んだ銘柄が、一覧で「横ばい」と出る、食い違いを避ける。`ma_trend` で合致した銘柄は、「下降」にはならない(短期が長期より上のため)ので、実際に「—」になるのは、判定が「横ばい」のとき。`ma_trend` 自体は、変更しない。別の案(`ma_trend` にも同じ閾値を入れて、定義を揃える)は、発掘の絞り込み結果が変わるので、採っていない。
4. **保有銘柄のトレンドは、取得・更新のとき計算して、`trend` テーブルの新しい列 `daily_trend` に保存する**(了承済み)。`daily_trend` は、トレンドの値(`up` / `down` / `flat`。判定できないときは `NULL`)を入れる、1つの列(上昇用と下降用の2つ、ではない)。一覧の表示のたびの計算は、しない。**DBに列が増えるので、反映には `docker compose down -v` で DB を作り直す必要がある**。既存の `trend` 行は、次の更新まで、トレンドが「—」になる。
5. **色の入れ替えの範囲**: 上昇・プラス・ポジティブ=赤、下落・マイナス・ネガティブ=緑にする(ローソク足、損益、ニュースのセンチメント、トレンドの行)。ただし、**削除ボタンとエラー文の赤は、そのまま**(入れ替えない。「悪い」の意味ではなく、「危険・失敗」の意味のため)。今は、この赤が、ネガティブの色と**同じ変数**(`--pill-red-*`)を共有しているので、新しい変数 `--up-*` / `--down-*` を作り、ネガティブとマイナスだけを、そちらに付け替える。
6. **MACDの線の色は、今の見た目を維持する**: 今の MACD の信号線とヒストグラムは、ローソク足の色の変数を、流用している(上昇・下落の意味ではない)。ローソク足の色を入れ替えると、MACD の色も入れ替わってしまうので、専用の変数 `--macd-signal` / `--macd-histogram` を作り、今の色のまま、残す。
7. **発掘一覧の「選択中の行」の色(今は緑)を、青系に変える**: 下降の行の色(緑)と、見分けがつかなくなるため。チケットには無いが、色の統一に伴って必要な変更。
8. **トレンドの表示は、文字(上昇 / 下降 / 横ばい)と色**。矢印は、まだ決まっていないので、付けない。判定できないとき(日足が26本未満)は「—」。なお、`AIDDS-5` のチケットの文面は「下降、上昇」の2つだが、`AIDDS-6` の3分類に合わせて、**発掘の一覧にも、横ばいを出す**(チケットの文面は、直していない)。
9. **AIの3つの目線は、保有銘柄の一覧の「意見」ボタンで作る**(あなたの指示。2026-10-01): 一覧の上の操作の行の、いちばん左に、黄色の「意見」ボタン。チェックを入れた行だけが対象で、0件のときは押せない。上限は設けない(一覧に出ている件数まで)。結果は、表の下のパネルに、銘柄ごとのカードで出し、保存しない。発掘と詳細の画面には、AIの意見を出さない。取得・更新のときには、作らない。トークンの消費は、「押した、チェック済みの銘柄の数」に比例する。1銘柄ずつ別のリクエストにして、同時に3つまで(長い1リクエストと、失敗の巻き添えを避ける)。
10. **AIの出力の検査(数字の取り違え・断定調・捏造)**: 入力に無い数字を含む、数字が1つも無い、断定の語(「必ず」「絶対」「確実」など)を含む、入力に無い事柄(決算・業績・材料・ニュース・配当・増益・減益・報道)に触れる、のどれかなら、その出力を捨てて、「取得できていません」と表示する。数字は、桁区切りなし・小数2桁まで(末尾の0は省く)で渡し、そのまま引用させる。**データに基づかない内容は、書かせない。**
11. **設計書を、このエピックに含める**(あなたの指示): 計画書の作成時に、`docs/design/09-trend-direction-and-market-colors.md` を作った(Jira のチケットの要求と、決めたことの原本。Jira にしか、設計が無い状態を避ける)。各 Task の最後に、関連する既存の設計書(01・03・05・06・07・02)を更新する手順を、入れた。チケットに添付画像があれば、計画書の作成時に `docs/images/` に取り込み、設計書から参照する(今回は、画像つきのチケットは無い)。
12. **実機スモークテストの進め方: 動いているスタックを、止めない**。別のプロジェクト名(`aidds9-smoke`)と、別のポート(DB 3317、バックエンド 8010、フロント 5183)で、空のDBのスタックを、もう1つ起動する。ポートを変える上書き用の設定ファイルは、スクラッチ用のディレクトリに置く(リポジトリには入れない)。あなたのスタックは、そのまま動き続け、データも、残る。**あなたのスタックの作り直し(`down -v`)は、新しいコードに更新するとき、あなたのタイミングで行う。** 列を足す変更が、あなたのDBに影響するのは、その更新のときだけ。
13. **実機で確認できない範囲**: `JQUANTS_API_KEY` が無い場合、発掘の実スキャンはできない(発掘の一覧は、DBに候補を直接入れて確認する)。`ANTHROPIC_API_KEY` が無い場合、AIの3つの目線は、単体テストと、応答の差し込みで確認する。キーは、出力・コミットしない。

## 実装の順番と理由

1. **Task 1(AIDDS-6) 判定**: 他の3つが、判定の結果を使う。中身は、純粋な関数1つで、DBにも画面にも触らない。いちばん小さく、いちばん先に固めたい。
2. **Task 2(AIDDS-7) 保有一覧 + 色の統一**: 色の変数(`--up-*` 等)と、トレンドの部品(`TrendBadge`)を、ここで作る。Task 3 が、それをそのまま使う。**色の統一を、Task 3 の後にすると、発掘の一覧を、先に旧い色で作って、あとで直す二度手間になる。** DBの列追加も、ここ。
3. **Task 3(AIDDS-5) 発掘一覧**: Task 1 の判定と、Task 2 の部品・色を、使うだけ。バックエンドは、結果にトレンドを1項目足すだけ。
4. **Task 4(AIDDS-8) 「意見」ボタンとAIの3つの目線**: 外部のAPI(Claude)に依存し、4つの中で、いちばん不確実。他と独立で、Task 1 の判定結果を、AIへの入力の1つとして使う。同じ `WatchlistPage` を、Task 2 も編集するので、Task 2 の後にして、衝突を避ける。最後に回して、他の3つの確認を、AIの有無に左右されないようにする。

順番を入れ替えたら困る点:
- Task 2 の前に Task 3 をやると、発掘の行が、旧い色で作られる。
- Task 1 の前に Task 2・3 をやると、判定の仕様(閾値)が、決まらないまま、表示を作ることになる。
- Task 4 を先にやってもよいが、その場合、AIへの入力に、トレンドが入らない。

**Goal:** 日足のトレンド(上昇・下降・横ばい)を判定して、保有銘柄の一覧と発掘の一覧に出し、アプリ全体の色を日本式(上昇・プラス・ポジティブ=赤、下落・マイナス・ネガティブ=緑)に揃え、詳細画面の所見に、AIによる3つの目線(買い・売り・キープ)を足す。

**Architecture:** 判定は、純粋な関数 `trend_direction.classify_trend`(5日と25日の移動平均、閾値つき)に集約し、yfinance の日足(キーが `close`)と J-Quants の日足(キーが `c`)の両方から、同じ関数を使う。保有銘柄の判定結果は、取得・更新のとき `trend.daily_trend` に保存し、発掘の結果は、表示のとき、保存済みの日足から、計算する。色は、新しいCSS変数(`--up-*`、`--down-*`)に集約する。AIの3つの目線は、`perspective_service` が、計算済みの指標の数字を Claude に渡して作り、出力を検査してから、`detail["perspectives"]` に保存する。

**Tech Stack:** FastAPI / SQLAlchemy 2.0 / pandas・pandas-ta / MySQL(本番)・SQLite(pytest) / React・TypeScript・Vite・vitest / lightweight-charts / Claude API(anthropic SDK、`claude-haiku-4-5-20251001`)

**Spec:** [docs/design/09-trend-direction-and-market-colors.md](../../design/09-trend-direction-and-market-colors.md)(このエピックの設計書。Jira のチケット AIDDS-5・6・7・8 の要求と、決めたことをまとめた原本)。関連する既存の設計書: `docs/design/07-screening.md`、`05-news-sentiment.md`、`03-theme-settings.md`、`06-position-grouping.md`、`01-watchlist-foundation.md`、`02-history-market-analysis.md`。

## Global Constraints

- 断定調を避ける。数字を先に示し、控えめな言葉を添える(`CLAUDE.md`)。
- 空売りは行わない前提。下降は、売り(利益確定・損切り)の判断と、買わない判断の材料。
- 色: 上昇・プラス・ポジティブ=赤、下落・マイナス・ネガティブ=緑(SBI証券に合わせる)。削除ボタンとエラー文は、赤のまま。
- トレンドの値は3つ: 上昇(`up`)、下降(`down`)、横ばい(`flat`)。判定できないときは `null`。
- 判定の期間と閾値は、環境変数で設定する(`TREND_SHORT_PERIOD`=5、`TREND_LONG_PERIOD`=25、`TREND_FLAT_BAND_PCT`=1.0)。コードに直書きしない。不正な値は、起動時にエラー。
- 発掘で `ma_trend` を条件にした結果は、判定が「上昇」でない銘柄に、トレンドを出さない(`null`)。
- AIの意見は、一覧の「意見」ボタンを押したときだけ作る(チェックした行だけ)。取得・更新のときには、作らない。発掘と詳細の画面には、出さない。
- AIの出力は、入力のデータに基づくこと。入力に無い数字・事柄は、書かない(捏造しない)。
- 設計書(`docs/design/`)を、実装と合わせて更新する。各 Task の最後の手順で行う。
- 新しいテーブルは作らない。`trend` テーブルに、列を1つ足す(`created_at` / `updated_at` / `deleted_at` は、既存のまま)。
- DBのマイグレーションは無い。列の追加は、`docker compose down -v` で、DBを作り直して反映する。
- `JQUANTS_API_KEY` と `ANTHROPIC_API_KEY` は、コミット・出力しない。
- 作業ブランチ: `feature/20261001`。`main` に直接コミットしない。push・マージ・PR作成は、しない。
- 画面の文面は、標準語(標準的な日本語)。
- テストの実行: バックエンド `cd backend && .venv/bin/python -m pytest tests/ -q`、フロントエンド `cd frontend && npx vitest run` と `npx tsc --noEmit`。
- 実機スモークテストは、規約(`CLAUDE.md`)で、マージ前に必須。
- コミットメッセージの末尾:
  ```
  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ
  ```

## Review Focus

1. **日足が26本未満の銘柄**(新規上場など)は、判定できない(`null`)。一覧は「—」と表示する。AIの3つの目線は作らない(Claude を呼ばない)。→ Task 1・2・3・4 のテスト。
2. **既存の `trend` 行**(`daily_trend` が `NULL`)でも、一覧が壊れず、「—」と出る。→ Task 2 のテスト。
3. **平均の差が、ちょうど閾値**(1.0%)のとき、「横ばい」になる(`<=`)。→ Task 1 のテスト。
4. **Claude が、入力に無い数字を書く、断定する、JSON以外を返す**。出力を捨てて、「取得できていません」と出す。更新全体は、失敗しない。→ Task 4 のテスト。
5. **赤の共有**: 削除ボタン・エラー文は、赤のまま。損益のプラスは赤、マイナスは緑。ネガティブは緑。→ Task 2 のテスト(CSS の対応関係)と、実機の目視。
6. **J-Quants の日足(キー `c`)と yfinance の日足(キー `close`)の違い**: どちらからも、同じ判定になる。→ Task 1 のテスト。
7. **発掘で `ma_trend` が条件のとき、判定が「上昇」でない銘柄**: トレンドを出さない(`null`、画面は「—」)。→ Task 3 のテスト。
8. **設定の値が不正**(数値でない、短期が1未満、長期が短期以下、閾値が負): `ValueError` になり、バックエンドが、起動時に失敗する。→ Task 1 のテスト。
9. **「意見」ボタン**: チェックが0件のときは、押せない。取得・更新(`POST /trends`、`POST /trends/refresh`)では、AIを呼ばない。1銘柄の失敗が、他の銘柄のカードに、影響しない。→ Task 4 のテスト。

---

### Task 1: トレンドを3分類(上昇・下降・横ばい)で判定する (AIDDS-6)

**Files:**
- Create: `backend/app/trend_direction.py`
- Modify: `backend/app/main.py`、`docker-compose.yml`、`.env.example`(設定の外出し)
- Test: `backend/tests/test_trend_direction.py`

**Interfaces:**
- Consumes: なし(純粋な関数)
- Produces:
  - `trend_direction.UP = "up"`、`DOWN = "down"`、`FLAT = "flat"`
  - `trend_direction.settings() -> tuple[int, int, float]`(短期の期間・長期の期間・閾値(%)。環境変数 `TREND_SHORT_PERIOD`(5)・`TREND_LONG_PERIOD`(25)・`TREND_FLAT_BAND_PCT`(1.0)から読む。不正な値は `ValueError`)
  - `trend_direction.classify_trend(closes: list[float], short_period: int | None = None, long_period: int | None = None, flat_band_pct: float | None = None) -> str | None`(`None` の引数は、`settings()` の値を使う)
  - `trend_direction.classify_candles(candles: list[dict]) -> str | None`(キー `close`。yfinance の日足)
  - `trend_direction.classify_history(history: list[dict]) -> str | None`(キー `c`。J-Quants の日足)

- [x] **Step 1: 失敗するテストを書く**

`backend/tests/test_trend_direction.py`:

```python
import pytest

from app import trend_direction


@pytest.fixture(autouse=True)
def _clear_trend_settings(monkeypatch):
    for name in ("TREND_SHORT_PERIOD", "TREND_LONG_PERIOD", "TREND_FLAT_BAND_PCT"):
        monkeypatch.delenv(name, raising=False)


def _rising(n: int = 40) -> list[float]:
    return [100.0 + i for i in range(n)]


def test_returns_none_when_fewer_than_26_closes():
    assert trend_direction.classify_trend(_rising(25)) is None


def test_returns_none_when_the_long_average_is_zero():
    assert trend_direction.classify_trend([0.0] * 30) is None


def test_up_when_short_is_above_long_and_rising():
    assert trend_direction.classify_trend(_rising()) == "up"


def test_down_when_short_is_below_long_and_falling():
    assert trend_direction.classify_trend(list(reversed(_rising()))) == "down"


def test_flat_when_prices_are_constant():
    assert trend_direction.classify_trend([100.0] * 40) == "flat"


def test_flat_when_short_is_above_long_but_turning_down():
    closes = [float(i) for i in range(1, 31)] + [29.0, 28.0, 27.0]

    assert trend_direction.classify_trend(closes) == "flat"


def test_a_small_gap_is_flat_even_when_short_is_rising():
    # 短期平均 100.2 > 長期平均 100.04、短期は上向きだが、差は0.16%で閾値(1.0%)以内。
    closes = [100.0] * 21 + [100.0, 100.0, 100.0, 100.0, 101.0]

    assert trend_direction.classify_trend(closes) == "flat"


def test_the_band_can_be_widened_to_turn_up_into_flat():
    assert trend_direction.classify_trend(_rising(), flat_band_pct=10.0) == "flat"


def test_a_gap_exactly_on_the_band_is_flat():
    closes = _rising()
    short_now = sum(closes[-5:]) / 5
    long_now = sum(closes[-25:]) / 25
    gap_pct = (short_now - long_now) / long_now * 100

    assert trend_direction.classify_trend(closes, flat_band_pct=gap_pct) == "flat"


def test_classify_candles_reads_the_close_key():
    candles = [{"close": c} for c in _rising()]

    assert trend_direction.classify_candles(candles) == "up"


def test_classify_history_reads_the_c_key():
    history = [{"c": c} for c in _rising()]

    assert trend_direction.classify_history(history) == "up"


def test_classify_history_returns_none_for_empty_history():
    assert trend_direction.classify_history([]) is None


def test_settings_default_to_5_25_and_1_percent():
    assert trend_direction.settings() == (5, 25, 1.0)


def test_settings_are_read_from_the_environment(monkeypatch):
    monkeypatch.setenv("TREND_SHORT_PERIOD", "3")
    monkeypatch.setenv("TREND_LONG_PERIOD", "10")
    monkeypatch.setenv("TREND_FLAT_BAND_PCT", "2.5")

    assert trend_direction.settings() == (3, 10, 2.5)


def test_the_band_comes_from_the_environment(monkeypatch):
    monkeypatch.setenv("TREND_FLAT_BAND_PCT", "10")

    assert trend_direction.classify_trend(_rising()) == "flat"


@pytest.mark.parametrize(
    "env",
    [
        {"TREND_SHORT_PERIOD": "abc"},
        {"TREND_LONG_PERIOD": "0"},
        {"TREND_FLAT_BAND_PCT": "-1"},
        {"TREND_SHORT_PERIOD": "10", "TREND_LONG_PERIOD": "10"},
    ],
)
def test_invalid_settings_raise_value_error(monkeypatch, env):
    for name, value in env.items():
        monkeypatch.setenv(name, value)

    with pytest.raises(ValueError):
        trend_direction.settings()
```

- [x] **Step 2: テストが失敗することを確認する**

Run: `cd backend && .venv/bin/python -m pytest tests/test_trend_direction.py -v`
Expected: FAIL(`ImportError: cannot import name 'trend_direction' from 'app'`)

- [x] **Step 3: 実装する**

`backend/app/trend_direction.py`:

```python
import os

UP = "up"
DOWN = "down"
FLAT = "flat"


def settings() -> tuple[int, int, float]:
    try:
        short_period = int(os.environ.get("TREND_SHORT_PERIOD", "5"))
        long_period = int(os.environ.get("TREND_LONG_PERIOD", "25"))
        flat_band_pct = float(os.environ.get("TREND_FLAT_BAND_PCT", "1.0"))
    except ValueError as exc:
        raise ValueError(f"トレンド判定の設定が数値でない: {exc}") from exc
    if short_period < 1 or long_period <= short_period:
        raise ValueError(
            f"TREND_SHORT_PERIOD({short_period})は1以上、"
            f"TREND_LONG_PERIOD({long_period})はそれより大きくする"
        )
    if flat_band_pct < 0:
        raise ValueError(f"TREND_FLAT_BAND_PCT({flat_band_pct})は0以上にする")
    return short_period, long_period, flat_band_pct


def classify_trend(
    closes: list[float],
    short_period: int | None = None,
    long_period: int | None = None,
    flat_band_pct: float | None = None,
) -> str | None:
    default_short, default_long, default_band = settings()
    short_period = default_short if short_period is None else short_period
    long_period = default_long if long_period is None else long_period
    flat_band_pct = default_band if flat_band_pct is None else flat_band_pct

    if len(closes) < long_period + 1:
        return None

    short_now = sum(closes[-short_period:]) / short_period
    short_prev = sum(closes[-short_period - 1 : -1]) / short_period
    long_now = sum(closes[-long_period:]) / long_period
    if long_now == 0:
        return None

    gap_pct = (short_now - long_now) / long_now * 100
    if abs(gap_pct) <= flat_band_pct:
        return FLAT
    if short_now > long_now and short_now > short_prev:
        return UP
    if short_now < long_now and short_now < short_prev:
        return DOWN
    return FLAT


def classify_candles(candles: list[dict]) -> str | None:
    return classify_trend([c["close"] for c in candles])


def classify_history(history: list[dict]) -> str | None:
    return classify_trend([bar["c"] for bar in history])
```

- [x] **Step 4: 判定の設定を、環境変数で外に出す**

`.env.example` の末尾に、足す:

```
# トレンド判定(日足): 短期・長期の移動平均の期間(日)と、横ばいとみなす差の閾値(%)
TREND_SHORT_PERIOD=5
TREND_LONG_PERIOD=25
TREND_FLAT_BAND_PCT=1.0
```

`docker-compose.yml` の `backend` の `environment` の末尾(`JQUANTS_MAX_STOCKS` の次の行)に、足す:

```yaml
      TREND_SHORT_PERIOD: ${TREND_SHORT_PERIOD:-5}
      TREND_LONG_PERIOD: ${TREND_LONG_PERIOD:-25}
      TREND_FLAT_BAND_PCT: ${TREND_FLAT_BAND_PCT:-1.0}
```

`backend/app/main.py` に、2か所足す。`from .routers import ...` の手前に、import を:

```python
from . import trend_direction
```

`app = FastAPI(title="株価羅針盤 API")` の次の行に、設定の検査を(不正な値のとき、起動で失敗させる):

```python
trend_direction.settings()  # 不正な設定値は、起動時に失敗させる
```

(実際の `.env` は、変えない。値を変えたいときは、`.env` に書く。)

- [x] **Step 5: テストが通ることを確認する**

Run: `cd backend && .venv/bin/python -m pytest tests/test_trend_direction.py -v`
Expected: PASS(19 件)

- [x] **Step 6: バックエンド全体のテストを実行する**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: 全て PASS(268 件 + 新規 19 件 = 287 件)

- [x] **Step 7: コミットする**

```bash
git add backend/app/trend_direction.py backend/app/main.py backend/tests/test_trend_direction.py docker-compose.yml .env.example
git commit -m "$(cat <<'EOF'
feat(trend): classify the daily trend as up, down or flat (AIDDS-6)

Uses the 5/25-day moving averages like the screening ma_trend signal, plus a
1.0% flat band. Works on yfinance candles (close) and J-Quants bars (c).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ
EOF
)"
```

- [x] **Step 8: 設計書(09)が実装と一致していることを確認する**

`docs/design/09-trend-direction-and-market-colors.md` の「トレンドの判定」「設定(環境変数)」「DBスキーマ」が、実装(期間・閾値・設定名・不正値の扱い)と一致しているか、読んで確かめる。ずれがあれば、設計書を直して、コミットする。ずれが無ければ、コミットは不要。

```bash
git add docs/design/09-trend-direction-and-market-colors.md
git commit -m "$(cat <<'EOF'
docs(design): align 09 with the trend classification as implemented (AIDDS-6)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ
EOF
)"
```

---

### Task 2: 保有銘柄の一覧にトレンドの列と行の色を追加し、アプリ全体の色を日本式に揃える (AIDDS-7)

**Files:**
- Modify: `backend/app/models.py`(`Trend`)
- Modify: `backend/app/schemas.py`(`TrendOut`)
- Modify: `backend/app/trend_service.py`(`create_trend`、`refresh_trends`)
- Test: `backend/tests/test_trend_service.py`、`backend/tests/test_trends_api.py`
- Create: `frontend/src/components/TrendBadge.tsx`、`frontend/src/components/TrendBadge.test.tsx`
- Create: `frontend/src/theme/colorTokens.test.ts`
- Modify: `frontend/src/types.ts`、`frontend/src/components/WatchlistTable.tsx`、`frontend/src/components/WatchlistRow.tsx`、`frontend/src/components/IndicatorPanel.tsx`、`frontend/src/index.css`
- Test: `frontend/src/components/WatchlistTable.test.tsx`
- Modify(設計書): `docs/design/01-watchlist-foundation.md`、`docs/design/03-theme-settings.md`、`docs/design/05-news-sentiment.md`、`docs/design/06-position-grouping.md`

**Interfaces:**
- Consumes: `trend_direction.classify_candles(candles) -> str | None`(Task 1)
- Produces:
  - `Trend.daily_trend: str | None`(`trend` テーブルの列。`String(8)`、NULL可)
  - `TrendOut.daily_trend: str | None = None`(`GET /trends` の各項目)
  - フロント: `TrendDirection = "up" | "down" | "flat"`(`types.ts`)、`Trend.daily_trend?: TrendDirection | null`
  - フロント: `TrendBadge`、`TREND_LABELS`、`trendRowClass(value)`(`components/TrendBadge.tsx`)
  - CSS変数: `--up-bg` / `--up-text` / `--down-bg` / `--down-text` / `--row-up-bg` / `--row-down-bg` / `--macd-signal` / `--macd-histogram`。クラス: `.trend-badge`、`.trend-up`、`.trend-down`、`.trend-flat`、`.trend-unknown`、`.row-trend-up`、`.row-trend-down`

**バックエンド**

- [x] **Step 1: 失敗するテストを書く(trend_service)**

`backend/tests/test_trend_service.py` の末尾に、次を追加する(先頭の import に `datetime` と `timedelta` は、すでにある):

```python
def _daily_raw_candles(closes: list[float]) -> list[dict]:
    start = datetime(2026, 8, 1, 9, 0, 0)
    return [
        {
            "datetime": (start + timedelta(days=i)).strftime("%Y-%m-%dT%H:%M:%S+09:00"),
            "open": c,
            "high": c,
            "low": c,
            "close": c,
            "volume": 1000,
        }
        for i, c in enumerate(closes)
    ]


def _patch_fetch(monkeypatch, raw_candles):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "テスト", "price": 100.0}
    )
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "x")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: [])
    monkeypatch.setattr(trend_service, "get_news", lambda code: [])


def test_create_trend_stores_the_daily_trend(db_session, monkeypatch):
    _patch_fetch(monkeypatch, _daily_raw_candles([100.0 + i for i in range(40)]))

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.daily_trend == "up"


def test_create_trend_leaves_daily_trend_empty_when_fewer_than_26_days(db_session, monkeypatch):
    _patch_fetch(monkeypatch, _daily_raw_candles([100.0 + i for i in range(10)]))

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.daily_trend is None


def test_create_trend_leaves_daily_trend_empty_when_history_is_unavailable(db_session, monkeypatch):
    _patch_fetch(monkeypatch, [])

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.daily_trend is None


def test_refresh_recomputes_the_daily_trend(db_session, monkeypatch):
    _patch_fetch(monkeypatch, _daily_raw_candles([100.0 + i for i in range(40)]))
    original = trend_service.create_trend(db_session, "7203")
    original.created_at = now_jst() - timedelta(minutes=10)
    db_session.commit()

    falling = list(reversed([100.0 + i for i in range(40)]))
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: _daily_raw_candles(falling))
    updated = trend_service.refresh_trends(db_session, ["7203"], 5)

    assert updated[0].daily_trend == "down"
```

- [x] **Step 2: 失敗するテストを書く(API)**

`backend/tests/test_trends_api.py` の末尾に、次を追加する(`_make_raw_candles` は、このファイルに、すでにある。ここでは、40日分の上昇を、別に作る):

```python
def _rising_raw_candles(n: int = 40) -> list[dict]:
    start = datetime(2026, 8, 1, 9, 0, 0)
    return [
        {
            "datetime": (start + timedelta(days=i)).strftime("%Y-%m-%dT%H:%M:%S+09:00"),
            "open": 100.0 + i,
            "high": 100.0 + i,
            "low": 100.0 + i,
            "close": 100.0 + i,
            "volume": 1000,
        }
        for i in range(n)
    ]


def _patch_fetch(monkeypatch, raw_candles):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "x")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: [])
    monkeypatch.setattr(trend_service, "get_news", lambda code: [])


def test_list_trends_includes_the_daily_trend(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends")

    assert response.status_code == 200
    assert response.json()[0]["daily_trend"] == "up"


def test_list_trends_returns_null_daily_trend_for_rows_without_one(client, monkeypatch):
    _patch_fetch(monkeypatch, [])
    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends")

    assert response.json()[0]["daily_trend"] is None
```

- [x] **Step 3: テストが失敗することを確認する**

Run: `cd backend && .venv/bin/python -m pytest tests/test_trend_service.py tests/test_trends_api.py -q`
Expected: 新しい6件が FAIL(`AttributeError: 'Trend' object has no attribute 'daily_trend'`、または `KeyError: 'daily_trend'`)

- [x] **Step 4: 実装する**

`backend/app/models.py` の `Trend` に、`opinion` の下へ、列を足す:

```python
    daily_trend: Mapped[str | None] = mapped_column(String(8), nullable=True, default=None)
```

`backend/app/schemas.py` の `TrendOut` に、`buy_quantity` の下へ、項目を足す:

```python
    daily_trend: str | None = None
```

`backend/app/trend_service.py`:

1. import を変える:

```python
from . import trend_code_name_service, trend_direction, trend_price_service
```

2. `_build_detail` の手前に、関数を足す:

```python
def _daily_trend(detail: dict | None) -> str | None:
    raw_candles = (detail or {}).get("raw_candles")
    if not raw_candles:
        return None
    try:
        return trend_direction.classify_candles(resample_candles(raw_candles, "1d"))
    except Exception:
        logger.warning("failed to classify the daily trend", exc_info=True)
        return None
```

3. `create_trend` を変える:

```python
def create_trend(db: Session, code: str) -> models.Trend:
    previous = get_active_trend(db, code)
    quote = get_quote(code)
    detail = _build_detail(code)
    trend = models.Trend(
        code=code,
        opinion=_build_opinion(previous, quote["price"]),
        detail=detail,
        daily_trend=_daily_trend(detail),
        price_at_fetch=quote["price"],
    )
```

(以降の `if previous is not None:` からは、そのまま。)

4. `refresh_trends` の中の、新しい `Trend` を作る部分を変える:

```python
        detail = _build_detail(code, macro_cache)
        stored_detail = detail or current.detail
        new_trend = models.Trend(
            code=code,
            opinion=_build_opinion(current, quote["price"]),
            detail=stored_detail,
            daily_trend=_daily_trend(stored_detail),
            price_at_fetch=quote["price"],
        )
```

- [x] **Step 5: テストが通ることを確認する**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: 全て PASS(287 件 + 新規 6 件 = 293 件)

- [x] **Step 6: バックエンドをコミットする**

```bash
git add backend/app/models.py backend/app/schemas.py backend/app/trend_service.py backend/tests/test_trend_service.py backend/tests/test_trends_api.py
git commit -m "$(cat <<'EOF'
feat(trends): store the daily trend on each fetch and expose it in the list (AIDDS-7)

trend.daily_trend is computed from the stored intraday candles at create and
refresh time, so the list never has to load the heavy detail JSON. The column
is new: the DB must be recreated (docker compose down -v).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ
EOF
)"
```

**フロントエンド**

- [x] **Step 7: 失敗するテストを書く(TrendBadge)**

`frontend/src/components/TrendBadge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TREND_LABELS, TrendBadge, trendRowClass } from "./TrendBadge";

describe("TrendBadge", () => {
  it("shows 上昇 with the up class", () => {
    render(<TrendBadge value="up" />);

    expect(screen.getByText("上昇")).toHaveClass("trend-badge", "trend-up");
  });

  it("shows 下降 with the down class", () => {
    render(<TrendBadge value="down" />);

    expect(screen.getByText("下降")).toHaveClass("trend-badge", "trend-down");
  });

  it("shows 横ばい with the flat class", () => {
    render(<TrendBadge value="flat" />);

    expect(screen.getByText("横ばい")).toHaveClass("trend-badge", "trend-flat");
  });

  it("shows a dash when the trend is unknown", () => {
    render(<TrendBadge value={null} />);

    expect(screen.getByText("—")).toHaveClass("trend-badge", "trend-unknown");
  });

  it("treats a missing value like an unknown trend", () => {
    render(<TrendBadge value={undefined} />);

    expect(screen.getByText("—")).toHaveClass("trend-unknown");
  });

  it("has a label for every direction", () => {
    expect(TREND_LABELS).toEqual({ up: "上昇", down: "下降", flat: "横ばい" });
  });
});

describe("trendRowClass", () => {
  it("colors up and down rows, and leaves flat and unknown rows uncolored", () => {
    expect(trendRowClass("up")).toBe("row-trend-up");
    expect(trendRowClass("down")).toBe("row-trend-down");
    expect(trendRowClass("flat")).toBeUndefined();
    expect(trendRowClass(null)).toBeUndefined();
    expect(trendRowClass(undefined)).toBeUndefined();
  });
});
```

- [x] **Step 8: 失敗するテストを書く(WatchlistTable)**

`frontend/src/components/WatchlistTable.test.tsx` の `describe("WatchlistTable", ...)` の中に、次を追加する:

```tsx
  it("adds a トレンド column header and shows each row's daily trend", () => {
    renderTable({
      watchlist: [
        { ...trends[0], daily_trend: "up" },
        { ...trends[1], daily_trend: "down" },
        { ...trends[1], id: 3, code: "9984", daily_trend: null },
      ],
    });

    expect(screen.getByRole("columnheader", { name: "トレンド" })).toBeInTheDocument();
    const badges = Array.from(document.querySelectorAll(".trend-badge")).map((el) => el.textContent);
    expect(badges).toEqual(["上昇", "下降", "—"]);
  });

  it("colors up rows and down rows, and leaves flat and unknown rows uncolored", () => {
    renderTable({
      watchlist: [
        { ...trends[0], daily_trend: "up" },
        { ...trends[1], daily_trend: "down" },
        { ...trends[1], id: 3, code: "9984", daily_trend: "flat" },
        { ...trends[1], id: 4, code: "8306" },
      ],
    });

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveClass("row-trend-up");
    expect(rows[1]).toHaveClass("row-trend-down");
    expect(rows[2]).not.toHaveClass("row-trend-up");
    expect(rows[2]).not.toHaveClass("row-trend-down");
    expect(rows[3]).not.toHaveClass("row-trend-up");
    expect(rows[3]).not.toHaveClass("row-trend-down");
  });
```

- [x] **Step 9: 失敗するテストを書く(色の対応関係)**

`frontend/src/theme/colorTokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import css from "../index.css?raw";

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`rule not found: ${selector}`);
  return match[1];
}

describe("Japanese-style market colors", () => {
  it("colors a profit red and a loss green", () => {
    expect(rule(".pnl-plus")).toContain("var(--up-text)");
    expect(rule(".pnl-minus")).toContain("var(--down-text)");
  });

  it("colors positive news red and negative news green", () => {
    expect(rule(".news-pill-positive")).toContain("var(--up-bg)");
    expect(rule(".news-pill-positive")).toContain("var(--up-text)");
    expect(rule(".news-pill-negative")).toContain("var(--down-bg)");
    expect(rule(".news-pill-negative")).toContain("var(--down-text)");
  });

  it("keeps the delete button and the error text red", () => {
    expect(rule(".btn-danger")).toContain("var(--pill-red-bg)");
    expect(rule(".btn-danger")).toContain("var(--pill-red-text)");
    expect(rule(".inline-error")).toContain("var(--pill-red-text)");
  });

  it("colors an up trend red and a down trend green", () => {
    expect(rule(".trend-up")).toContain("var(--up-text)");
    expect(rule(".trend-down")).toContain("var(--down-text)");
  });

  it("draws up candles red and down candles green in the light theme", () => {
    const light = css.slice(css.indexOf(":root {"), css.indexOf(':root[data-theme="dark"]'));
    expect(light).toContain("--candle-up: #ef5350;");
    expect(light).toContain("--candle-down: #26a69a;");
  });

  it("draws up candles red and down candles green in the dark theme", () => {
    const dark = css.slice(css.indexOf(':root[data-theme="dark"]'));
    expect(dark).toContain("--candle-up: #f87171;");
    expect(dark).toContain("--candle-down: #2dd4bf;");
  });

  it("keeps the MACD line colors as they were", () => {
    const light = css.slice(css.indexOf(":root {"), css.indexOf(':root[data-theme="dark"]'));
    expect(light).toContain("--macd-signal: #ef5350;");
    expect(light).toContain("--macd-histogram: #26a69a;");
  });
});
```

- [x] **Step 10: テストが失敗することを確認する**

Run: `cd frontend && npx vitest run src/components/TrendBadge.test.tsx src/components/WatchlistTable.test.tsx src/theme/colorTokens.test.ts`
Expected: FAIL(`TrendBadge` が無い。列が無い。CSS の対応関係が、まだ旧いまま)

- [x] **Step 11: 型を足す**

`frontend/src/types.ts`:

`Trend` の手前に、型を足す:

```ts
export type TrendDirection = "up" | "down" | "flat";
```

`Trend` の `buy_quantity` の下に、項目を足す:

```ts
  daily_trend?: TrendDirection | null;
```

- [x] **Step 12: TrendBadge を作る**

`frontend/src/components/TrendBadge.tsx`:

```tsx
import type { TrendDirection } from "../types";

export const TREND_LABELS: Record<TrendDirection, string> = {
  up: "上昇",
  down: "下降",
  flat: "横ばい",
};

type TrendValue = TrendDirection | null | undefined;

export function trendRowClass(value: TrendValue): string | undefined {
  if (value === "up") return "row-trend-up";
  if (value === "down") return "row-trend-down";
  return undefined;
}

export function TrendBadge({ value }: { value: TrendValue }) {
  if (!value) {
    return <span className="trend-badge trend-unknown">—</span>;
  }
  return <span className={`trend-badge trend-${value}`}>{TREND_LABELS[value]}</span>;
}
```

- [x] **Step 13: 一覧に列と行の色を足す**

`frontend/src/components/WatchlistTable.tsx` の `<th>購入株数</th>` の次の行(`<th>損益</th>` の手前)に、足す:

```tsx
          <th>トレンド</th>
```

`frontend/src/components/WatchlistRow.tsx`:

1. import を足す:

```tsx
import { TrendBadge, trendRowClass } from "./TrendBadge";
```

2. `return (` の次の `<tr>` を変える:

```tsx
    <tr className={trendRowClass(trend.daily_trend)}>
```

3. 購入株数の `<td>`(`aria-label={`${trend.code}の購入株数`}` の入力欄を含む `<td>`)の次、損益の `<td>`(`{pnl === null ? (` で始まる `<td>`)の手前に、足す:

```tsx
      <td>
        <TrendBadge value={trend.daily_trend} />
      </td>
```

- [x] **Step 14: MACD の色の変数を、専用のものに変える**

`frontend/src/components/IndicatorPanel.tsx` の2行を変える:

```tsx
      [macd.signal, readCssVar("--macd-signal")],
      [macd.histogram, readCssVar("--macd-histogram")],
```

- [x] **Step 15: CSS を変える**

`frontend/src/index.css`:

1. ライトテーマ(`:root { ... }`)の `--candle-up` と `--candle-down` を、次に変え、その下に新しい変数を足す:

```css
  --candle-up: #ef5350;
  --candle-down: #26a69a;
  --macd-signal: #ef5350;
  --macd-histogram: #26a69a;
  --up-bg: #fbe7e7;
  --up-text: #cf3d3d;
  --down-bg: #e6f4ea;
  --down-text: #1e7e34;
  --row-up-bg: #fdf1f1;
  --row-down-bg: #f1f9f3;
```

2. ダークテーマ(`:root[data-theme="dark"] { ... }`)の `--candle-up` と `--candle-down` を、次に変え、その下に新しい変数を足す:

```css
  --candle-up: #f87171;
  --candle-down: #2dd4bf;
  --macd-signal: #f87171;
  --macd-histogram: #2dd4bf;
  --up-bg: #3a1f22;
  --up-text: #ff8a8a;
  --down-bg: #16301f;
  --down-text: #6fd88a;
  --row-up-bg: #2a1a1d;
  --row-down-bg: #14261b;
```

3. `.pnl-plus` と `.pnl-minus` を変える:

```css
.pnl-plus {
  font-weight: 700;
  color: var(--up-text);
}

.pnl-minus {
  font-weight: 700;
  color: var(--down-text);
}
```

4. `.news-pill-positive` と `.news-pill-negative` を変える(`.news-pill-neutral` は、そのまま):

```css
.news-pill-positive {
  background: var(--up-bg);
  color: var(--up-text);
}

.news-pill-negative {
  background: var(--down-bg);
  color: var(--down-text);
}
```

5. `.pnl-minus` の下に、トレンドのクラスを足す:

```css
.trend-badge {
  font-weight: 700;
}

.trend-up {
  color: var(--up-text);
}

.trend-down {
  color: var(--down-text);
}

.trend-flat,
.trend-unknown {
  color: var(--text-muted);
}

.watchlist-table tbody tr.row-trend-up {
  background: var(--row-up-bg);
}

.watchlist-table tbody tr.row-trend-down {
  background: var(--row-down-bg);
}
```

`.btn-danger`、`.inline-error`、`.btn-outline-danger`、`--pill-red-*`、`--pill-green-*` は、変えない。

- [x] **Step 16: テストと型チェックを実行する**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: 全て PASS、型エラー無し(`css?raw` の型エラーが出たら、`frontend/src/vite-env.d.ts` に、`/// <reference types="vite/client" />` が有るか確認し、無ければ足す)。既存のテストが、列の追加や色の変更で、落ちたときは、理由を確認してから、新しい仕様に合わせて直す(アサーションを緩めて、通すだけにしない)。

- [x] **Step 17: フロントエンドをコミットする**

```bash
git add frontend/src
git commit -m "$(cat <<'EOF'
feat(frontend): show the daily trend on the watchlist and use Japanese market colors (AIDDS-7)

Adds a トレンド column and up/down row tints, and switches the app to red for
up/profit/positive and green for down/loss/negative. Delete and error red are
untouched; MACD lines keep their current colors via dedicated variables.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ
EOF
)"
```

**実機スモークテスト**(手順は、末尾の「実機スモークテストの手順」を参照)

- [x] **Step 18: スモーク環境を用意する**

「実機スモークテストの手順」の 1〜3 を行う(動いているスタックは、止めない。別のポートで、もう1つ起動する)。

- [x] **Step 19: 画面を確認する**

銘柄を取得し(例 `7203`)、一覧の画面を、ライトとダークの両方で撮る。確認する点:
- 「トレンド」の列が、「購入株数」の右、「損益」の左にあり、ヘッダにも「トレンド」がある。
- 一覧の応答に、上昇・下降・横ばい・`null` を、差し込んで(Playwright の `route`)、4種類の見た目を確認する: 上昇=赤っぽい行、下降=緑っぽい行、横ばいと「—」=色なし。
- 損益のプラスが赤、マイナスが緑。削除ボタンが、赤のまま(緑になっていない)。
- 詳細画面で、ローソク足の陽線が赤、陰線が緑。ニュースのポジティブ(差し込み)が赤、ネガティブが緑。MACD の線が、変わっていない。
- 画面のスクリーンショットを、ユーザーに送る。

- [x] **Step 20: 設計書を更新する(01・03・05・06)**

次のとおり、更新する(トレンドの定義と閾値は、09 を参照する、と書く):

- `docs/design/01-watchlist-foundation.md` の「DBスキーマ」の `trend` の列の列挙に、`daily_trend`(日足のトレンド。`up` / `down` / `flat`、判定できないときは NULL。取得・更新のときに計算して保存する。09参照)を足す。
- `docs/design/06-position-grouping.md` の「`WatchlistTable`の列構成」の「購入株数」の次(「損益」の手前)に、「トレンド」を足す。行の色(上昇=赤っぽい、下降=緑っぽい。横ばい・判定なしは色なし)を、1行で書く。
- `docs/design/03-theme-settings.md` の「CSS変数設計」のトークン名の列挙に、`--up-bg`、`--up-text`、`--down-bg`、`--down-text`、`--row-up-bg`、`--row-down-bg`、`--macd-signal`、`--macd-histogram` を足す。`--candle-up` が赤、`--candle-down` が緑に変わったこと(日本式)を、書く。
- `docs/design/05-news-sentiment.md` のセンチメントpillの配色の説明に、ポジティブは赤(`--up-*`)、ネガティブは緑(`--down-*`)に変わったこと(日本式。`--pill-red-*` / `--pill-green-*` は、削除ボタンなどのために残す)を、書く。
- 09 が、実装と一致しているか、確かめる。

```bash
git add docs/design
git commit -m "$(cat <<'EOF'
docs(design): record the daily trend column and the Japanese-style colors (AIDDS-7)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ
EOF
)"
```

---

### Task 3: 発掘画面の一覧に日足のトレンド(下降・横ばい・上昇)を追加する (AIDDS-5)

**Files:**
- Modify: `backend/app/trend_candidate_result_service.py`、`backend/app/schemas.py`(`ScreeningResultItemOut`)
- Test: `backend/tests/test_trend_candidate_result_service.py`、`backend/tests/test_screening_results_register_api.py`
- Modify: `frontend/src/types.ts`、`frontend/src/components/ScreeningResultsPanel.tsx`、`frontend/src/index.css`
- Test: `frontend/src/components/ScreeningResultsPanel.test.tsx`
- Modify(設計書): `docs/design/07-screening.md`

**Interfaces:**
- Consumes: `trend_direction.classify_history(history) -> str | None`(Task 1)、`TrendBadge`・`trendRowClass`・`TrendDirection`(Task 2)、CSS変数(Task 2)
- Produces: `GET /screening/results/{condition_id}` の各項目に `daily_trend: str | None`(`ma_trend` が条件に含まれ、判定が `up` でないときは `None`)、フロント `ScreeningResultItem.daily_trend?: TrendDirection | null`

**バックエンド**

- [x] **Step 1: 失敗するテストを書く(service)**

`backend/tests/test_trend_candidate_result_service.py` の末尾に、次を追加する:

```python
def test_get_cached_results_includes_the_daily_trend(db_session):
    rising = [_bar(1000.0 + i * 5) for i in range(40)]
    flat = [_bar(1000.0)] * 30
    short = [_bar(1000.0 + i) for i in range(10)]
    db_session.add_all(
        [
            models.TrendCandidate(code="1111", detail={"history": rising}),
            models.TrendCandidate(code="2222", detail={"history": flat}),
            models.TrendCandidate(code="3333", detail={"history": short}),
        ]
    )
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, [])
    trend_candidate_result_service.run_search(db_session, condition)

    items, _ = trend_candidate_result_service.get_cached_results(
        db_session, condition.id, page=1, page_size=20
    )

    by_code = {item["code"]: item["daily_trend"] for item in items}
    assert by_code == {"1111": "up", "2222": "flat", "3333": None}


def test_get_cached_results_hides_the_trend_when_ma_trend_matched_but_the_trend_is_not_up(db_session):
    # ma_trend は閾値が無く合致するが、差は0.16%で、判定は「横ばい」になるデータ。
    within_band = [_bar(100.0)] * 21 + [_bar(100.0), _bar(100.0), _bar(100.0), _bar(100.0), _bar(101.0)]
    db_session.add(models.TrendCandidate(code="1111", detail={"history": within_band}))
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, ["ma_trend"])

    matched = trend_candidate_result_service.run_search(db_session, condition)
    items, _ = trend_candidate_result_service.get_cached_results(
        db_session, condition.id, page=1, page_size=20
    )

    assert matched == ["1111"]
    assert items[0]["daily_trend"] is None


def test_get_cached_results_keeps_the_up_trend_when_ma_trend_matched(db_session):
    rising = [_bar(1000.0 + i * 5) for i in range(40)]
    db_session.add(models.TrendCandidate(code="1111", detail={"history": rising}))
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, ["ma_trend"])

    trend_candidate_result_service.run_search(db_session, condition)
    items, _ = trend_candidate_result_service.get_cached_results(
        db_session, condition.id, page=1, page_size=20
    )

    assert items[0]["daily_trend"] == "up"
```

- [x] **Step 2: 失敗するテストを書く(API)**

`backend/tests/test_screening_results_register_api.py` の `test_get_results_returns_cached_items` の末尾に、1行足す(候補は、同じ値の30本なので、「横ばい」):

```python
    assert body["items"][0]["daily_trend"] == "flat"
```

- [x] **Step 3: テストが失敗することを確認する**

Run: `cd backend && .venv/bin/python -m pytest tests/test_trend_candidate_result_service.py tests/test_screening_results_register_api.py -q`
Expected: 2件が FAIL(`KeyError: 'daily_trend'`)

- [x] **Step 4: 実装する**

`backend/app/trend_candidate_result_service.py`:

import を変える:

```python
from . import (
    models,
    screening_signals,
    trend_candidate_service,
    trend_code_name_service,
    trend_direction,
)
```

`get_cached_results` の `items.append({...})` に、1項目足す:

```python
        trend = trend_direction.classify_history(history)
        # ma_trend は閾値が無く、絞り込みが「上昇」と見た銘柄でも、判定は「横ばい」になり得る。
        # 食い違う情報を出さないため、その場合はトレンドを出さない。
        if "ma_trend" in enabled_signals and trend != trend_direction.UP:
            trend = None
        items.append(
            {
                "code": code,
                "name": names.get(code, ""),
                "price": price,
                "matched_signals": enabled_signals,
                "daily_trend": trend,
            }
        )
```

`backend/app/schemas.py` の `ScreeningResultItemOut` に、足す:

```python
    daily_trend: str | None = None
```

- [x] **Step 5: テストが通ることを確認する**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: 全て PASS(293 件 + 新規 3 件 = 296 件。API のテストは、既存に1行足しただけ)

- [x] **Step 6: バックエンドをコミットする**

```bash
git add backend/app/trend_candidate_result_service.py backend/app/schemas.py backend/tests/test_trend_candidate_result_service.py backend/tests/test_screening_results_register_api.py
git commit -m "$(cat <<'EOF'
feat(screening): return the daily trend with each result item (AIDDS-5)

Computed from the stored J-Quants bars when results are listed, so the scan
and the cached condition results stay untouched.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ
EOF
)"
```

**フロントエンド**

- [x] **Step 7: 失敗するテストを書く**

`frontend/src/components/ScreeningResultsPanel.test.tsx` の `describe("ScreeningResultsPanel", ...)` の中に、次を追加する(`makeScreening` は、このファイルに、すでにある):

```tsx
  it("adds a トレンド column and tints rows by the daily trend", () => {
    const screening = makeScreening({
      results: {
        condition_id: 1,
        total: 3,
        page: 1,
        page_size: 20,
        items: [
          { code: "7203", name: "トヨタ自動車", price: 2900, matched_signals: [], daily_trend: "up" },
          { code: "6758", name: "ソニーグループ", price: 3000, matched_signals: [], daily_trend: "down" },
          { code: "9984", name: "ソフトバンクG", price: 8000, matched_signals: [], daily_trend: null },
        ],
      },
    });

    render(<ScreeningResultsPanel screening={screening as never} />);

    expect(screen.getByRole("columnheader", { name: "トレンド" })).toBeInTheDocument();
    const badges = Array.from(document.querySelectorAll(".trend-badge")).map((el) => el.textContent);
    expect(badges).toEqual(["上昇", "下降", "—"]);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveClass("row-trend-up");
    expect(rows[1]).toHaveClass("row-trend-down");
    expect(rows[2]).not.toHaveClass("row-trend-up");
    expect(rows[2]).not.toHaveClass("row-trend-down");
  });
```

- [x] **Step 8: テストが失敗することを確認する**

Run: `cd frontend && npx vitest run src/components/ScreeningResultsPanel.test.tsx`
Expected: 新しい1件が FAIL(「トレンド」の列が無い)

- [x] **Step 9: 実装する**

`frontend/src/types.ts` の `ScreeningResultItem` に、足す:

```ts
  daily_trend?: TrendDirection | null;
```

`frontend/src/components/ScreeningResultsPanel.tsx`:

1. import を足す:

```tsx
import { TrendBadge, trendRowClass } from "./TrendBadge";
```

2. ヘッダの `<th className="price-col">現在値</th>` の次の行に、足す:

```tsx
                <th className="trend-col">トレンド</th>
```

3. 行の `className` を変える(`is-viewing` と、トレンドの色を、両方持てるようにする):

```tsx
                  className={
                    [item.code === viewingCode ? "is-viewing" : "", trendRowClass(item.daily_trend) ?? ""]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
```

4. `<td>{item.price !== null ? ... : "—"}</td>` の次の行に、足す:

```tsx
                  <td>
                    <TrendBadge value={item.daily_trend} />
                  </td>
```

`frontend/src/index.css`:

まず、「トレンド」列の幅を、足す(この表は、列幅が固定のため。`.price-col` の次に):

```css
.screening-results-table .trend-col {
  width: 80px;
}
```

(列幅は、実機の確認で、`.name-col` を 240px → 176px、`.trend-col` を 96px → 80px に、調整した。「該当シグナル」の列が、細くなりすぎるため。)

次に、`.screening-results-table tbody tr.is-viewing` を、緑から青系に変える(下降の行の緑と、見分けるため。同じ優先度で、後に書かれているので、トレンドの色より、優先される):

```css
.screening-results-table tbody tr.is-viewing {
  background: var(--pill-blue-bg);
  box-shadow: inset 3px 0 0 var(--pill-blue-text);
}
```

- [x] **Step 10: テストと型チェックを実行する**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: 全て PASS、型エラー無し

- [x] **Step 11: フロントエンドをコミットする**

```bash
git add frontend/src
git commit -m "$(cat <<'EOF'
feat(frontend): show the daily trend on the screening results (AIDDS-5)

Adds a トレンド column and up/down row tints to the results table. The
selected-row highlight moves from green to blue so it cannot be mistaken for a
down-trend row.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ
EOF
)"
```

**実機スモークテスト**

- [x] **Step 12: 発掘の候補を、DBに直接入れる**

`JQUANTS_API_KEY` が無いので、スキャンは、できない。スモーク用のスタックで、候補を直接入れる(上昇・下降・横ばい・短い、の4種類):

```bash
docker compose -p aidds9-smoke exec -T backend python - <<'PY'
from app import models
from app.db import SessionLocal

def bars(closes):
    return [{"date": f"2026-09-{(i % 28) + 1:02d}", "o": c, "h": c, "l": c, "c": c, "v": 100000} for i, c in enumerate(closes)]

rising = [1000.0 + i * 5 for i in range(40)]
db = SessionLocal()
db.add_all([
    models.TrendCandidate(code="1111", detail={"history": bars(rising)}),
    models.TrendCandidate(code="2222", detail={"history": bars(list(reversed(rising)))}),
    models.TrendCandidate(code="3333", detail={"history": bars([1000.0] * 40)}),
    models.TrendCandidate(code="4444", detail={"history": bars(rising[:10])}),
])
db.commit()
print("seeded")
PY
```

- [x] **Step 13: 画面を確認する**

発掘画面で、条件を選ばずに「検索」を押し、結果の一覧を、ライトとダークの両方で撮る。確認する点:
- 「トレンド」の列が、「現在値」の右にあり、4件が、上昇(赤っぽい行)、下降(緑っぽい行)、横ばい(色なし)、「—」(色なし)で出る。
- 行をクリックして、選択中にしたとき、青系の強調になり、下降の行の緑と、見分けがつく。トレンドの色(赤・緑)は、選択中の行で、青に置き換わってよい。
- チェックボックス、ページ送り、「選択をウォッチリストへ」が、これまでどおり動く。
- 画面のスクリーンショットを、ユーザーに送る。

- [x] **Step 14: 設計書を更新する(07)**

`docs/design/07-screening.md` を、次のとおり更新する:

- 「結果エリア」の一覧テーブルの列(「選択チェックボックス / 株式コード / 銘柄名 / 現在値 / 該当シグナル」)を、「… / 現在値 / トレンド / 該当シグナル」に直す。行の色(上昇=赤っぽい、下降=緑っぽい)と、トレンドの定義は、09 を参照する、と書く。
- 「結果エリアのチャート表示」の列幅の箇条に、「トレンド80px」を足す(銘柄名は176px)。表示中の行のハイライトが、緑から青系に変わったことを書く。
- `GET /screening/results/{condition_id}` の説明に、各項目の `daily_trend`(`up` / `down` / `flat` / `null`)を足す。`ma_trend` が条件に含まれ、判定が `up` でないときは `null`(画面は「—」)と書く。理由: `ma_trend` には閾値が無く、絞り込みの結果と食い違う「横ばい」を、出さないため。
- 09 が、実装と一致しているか、確かめる。

```bash
git add docs/design
git commit -m "$(cat <<'EOF'
docs(design): add the trend column to the screening results (AIDDS-5)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ
EOF
)"
```

---

### Task 4: 保有銘柄の一覧に、AIによる3つの目線(買い・売り・キープ)を出す「意見」ボタンを追加する (AIDDS-8)


**決まったこと**(あなたの指示。2026-10-01)
- 「意見」ボタン: 一覧の画面の、上の操作の行の、いちばん左(「株式コード」の手前)。黄色(`btn-primary`)。画面イメージ: `docs/images/AIDDS-8-opinion-button-position.png`
- チェックを入れた行だけが対象。チェックが0件のときは、押せない。1回に選べる上限は、設けない(一覧に出ている件数まで)
- 結果は、表の下のパネルに、銘柄ごとのカードで出す。結果は保存しない(ページを開き直すと消える)
- 発掘と詳細の画面には、AIの意見を出さない。取得・更新のときには、作らない(押したときだけ作る)
- 私の設計: 1回の押下で、複数の銘柄を作る場合は、1銘柄ずつ別のリクエストにし(長い1リクエストと、タイムアウトを避ける)、同時に3つまで。1銘柄の失敗は、他の銘柄に、影響させない

**Files:**
- Create: `backend/app/perspective_service.py`
- Modify: `backend/app/schemas.py`、`backend/app/trend_service.py`、`backend/app/routers/trends.py`
- Test: `backend/tests/test_perspective_service.py`、`backend/tests/test_trend_service.py`、`backend/tests/test_trends_api.py`
- Create: `frontend/src/hooks/usePerspectives.ts`、`frontend/src/hooks/usePerspectives.test.ts`、`frontend/src/components/PerspectivesPanel.tsx`、`frontend/src/components/PerspectivesPanel.test.tsx`
- Modify: `frontend/src/types.ts`、`frontend/src/api/trends.ts`、`frontend/src/components/WatchlistPage.tsx`、`frontend/src/index.css`
- Test: `frontend/src/components/WatchlistPage.test.tsx`
- Modify(設計書): `docs/design/06-position-grouping.md`、`docs/design/09-trend-direction-and-market-colors.md`

**Interfaces:**
- Consumes: `trend_direction.classify_candles`(Task 1)、`indicator_service.compute_rsi` / `compute_macd` / `compute_bollinger`(既存)、`trend_service.resample_candles`(既存)、`trend_service.get_active_trend`(既存)、フロントの `selectedCodes`・`watchlist`(`useWatchlist`、既存)
- Produces:
  - `perspective_service.build_metrics(daily_candles, trend) -> dict[str, str] | None`
  - `perspective_service.validate_perspectives(parsed, metrics) -> dict[str, str]`(不正なら `ValueError`)
  - `perspective_service.generate_perspectives(code, metrics) -> dict[str, str]`
  - `perspective_service.build_perspectives(code, daily_candles, trend) -> dict[str, str] | None`
  - `trend_service.generate_perspectives_for(trend) -> dict[str, str] | None`(日足が足りないとき `None`)
  - `POST /trends/{code}/perspectives` → 200 `{"buy": str, "sell": str, "keep": str}` / 404(銘柄なし)/ 422(日足が足りない)/ 502(生成に失敗・検査で不合格)
  - フロント: `Perspectives`、`PerspectiveItem`(`types.ts`)、`createPerspectives(code)`(`api/trends.ts`)、`usePerspectives()`(`{ items, running, run(targets) }`)、`PerspectivesPanel`

- [x] **Step 1: 失敗するテストを書く(perspective_service)**

`backend/tests/test_perspective_service.py`:

```python
import json
from unittest.mock import MagicMock

import pytest

from app import perspective_service


def _candles(closes):
    return [
        {"time": f"2026-08-{(i % 28) + 1:02d}", "open": c, "high": c, "low": c, "close": c, "volume": 1000 + i}
        for i, c in enumerate(closes)
    ]


RISING = _candles([100.0 + i for i in range(40)])


def _fake_client(response_text):
    client = MagicMock()
    message = MagicMock()
    message.content = [MagicMock(text=response_text)]
    client.messages.create.return_value = message
    return client


def _metrics():
    return perspective_service.build_metrics(RISING, "up")


def _valid_output(metrics):
    close = metrics["終値"]
    return {
        "buy": f"終値は{close}で、上昇の途中と読めます。",
        "sell": f"終値は{close}で、高値圏にあるとも読めます。",
        "keep": f"終値は{close}で、様子を見る見方もあります。",
    }


def test_build_metrics_returns_none_when_fewer_than_26_days():
    assert perspective_service.build_metrics(_candles([100.0] * 25), "flat") is None


def test_build_metrics_formats_numbers_without_thousands_separators():
    metrics = perspective_service.build_metrics(_candles([1000.0 + i * 10 for i in range(40)]), "up")

    assert metrics["終値"] == "1390"
    assert "," not in "".join(metrics.values())


def test_build_metrics_contains_the_trend_and_the_main_indicators():
    metrics = _metrics()

    assert metrics["日足のトレンド"] == "上昇"
    for label in ("終値", "5日移動平均", "25日移動平均", "RSI(14日)", "出来高の前日比(%)", "直近60日高値", "直近60日安値"):
        assert label in metrics


def test_build_metrics_says_unknown_when_the_trend_is_none():
    metrics = perspective_service.build_metrics(RISING, None)

    assert metrics["日足のトレンド"] == "判定できない"


def test_validate_accepts_text_that_only_uses_the_given_numbers():
    metrics = _metrics()

    result = perspective_service.validate_perspectives(_valid_output(metrics), metrics)

    assert set(result) == {"buy", "sell", "keep"}


def test_validate_accepts_the_period_numbers_used_in_the_labels():
    metrics = _metrics()
    output = _valid_output(metrics)
    output["buy"] = f"終値{metrics['終値']}は、25日移動平均{metrics['25日移動平均']}を上回っていると読めます。"

    perspective_service.validate_perspectives(output, metrics)


def test_validate_rejects_a_number_that_was_not_given():
    metrics = _metrics()
    output = _valid_output(metrics)
    output["sell"] = "終値は99999で、高値圏と読めます。"

    with pytest.raises(ValueError):
        perspective_service.validate_perspectives(output, metrics)


def test_validate_rejects_text_without_any_number():
    metrics = _metrics()
    output = _valid_output(metrics)
    output["keep"] = "様子を見る見方もあります。"

    with pytest.raises(ValueError):
        perspective_service.validate_perspectives(output, metrics)


@pytest.mark.parametrize("word", ["必ず", "絶対", "確実", "間違いない", "べきです", "しましょう", "してください"])
def test_validate_rejects_assertive_wording(word):
    metrics = _metrics()
    output = _valid_output(metrics)
    output["buy"] = f"終値は{metrics['終値']}で、{word}。"

    with pytest.raises(ValueError):
        perspective_service.validate_perspectives(output, metrics)


@pytest.mark.parametrize("word", ["決算", "業績", "材料", "ニュース", "配当", "増益", "減益", "報道"])
def test_validate_rejects_topics_that_are_not_in_the_given_data(word):
    metrics = _metrics()
    output = _valid_output(metrics)
    output["sell"] = f"終値は{metrics['終値']}で、{word}の影響とも読めます。"

    with pytest.raises(ValueError):
        perspective_service.validate_perspectives(output, metrics)


def test_validate_rejects_a_missing_key():
    metrics = _metrics()
    output = _valid_output(metrics)
    del output["keep"]

    with pytest.raises(ValueError):
        perspective_service.validate_perspectives(output, metrics)


def test_validate_rejects_a_non_object():
    with pytest.raises(ValueError):
        perspective_service.validate_perspectives(["buy"], _metrics())


def test_generate_parses_the_json_response(monkeypatch):
    metrics = _metrics()
    fake = _fake_client(json.dumps(_valid_output(metrics), ensure_ascii=False))
    monkeypatch.setattr(perspective_service.anthropic, "Anthropic", lambda **kwargs: fake)

    result = perspective_service.generate_perspectives("7203", metrics)

    assert result == _valid_output(metrics)


def test_generate_accepts_a_json_response_wrapped_in_a_code_fence(monkeypatch):
    metrics = _metrics()
    text = "```json\n" + json.dumps(_valid_output(metrics), ensure_ascii=False) + "\n```"
    fake = _fake_client(text)
    monkeypatch.setattr(perspective_service.anthropic, "Anthropic", lambda **kwargs: fake)

    assert perspective_service.generate_perspectives("7203", metrics) == _valid_output(metrics)


def test_generate_raises_when_the_response_is_not_json(monkeypatch):
    fake = _fake_client("これはJSONではありません")
    monkeypatch.setattr(perspective_service.anthropic, "Anthropic", lambda **kwargs: fake)

    with pytest.raises(ValueError):
        perspective_service.generate_perspectives("7203", _metrics())


def test_generate_puts_every_metric_into_the_prompt(monkeypatch):
    metrics = _metrics()
    fake = _fake_client(json.dumps(_valid_output(metrics), ensure_ascii=False))
    monkeypatch.setattr(perspective_service.anthropic, "Anthropic", lambda **kwargs: fake)

    perspective_service.generate_perspectives("7203", metrics)

    prompt = fake.messages.create.call_args.kwargs["messages"][0]["content"]
    for label, value in metrics.items():
        assert f"{label}: {value}" in prompt


def test_build_perspectives_does_not_call_claude_when_data_is_short(monkeypatch):
    called = []
    monkeypatch.setattr(perspective_service, "generate_perspectives", lambda *a, **k: called.append(1))

    assert perspective_service.build_perspectives("7203", _candles([100.0] * 10), "flat") is None
    assert called == []
```

- [x] **Step 2: 失敗するテストを書く(エンドポイントと service)**

`backend/tests/test_trends_api.py` の末尾に、次を追加する(`_patch_fetch` と `_rising_raw_candles` は、Task 2 で、このファイルに足してある。`trend_service` は、このファイルで、すでに import 済み):

```python
def test_create_perspectives_returns_the_three_perspectives(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    client.post("/trends", json={"code": "7203"})
    perspectives = {"buy": "a1", "sell": "b2", "keep": "c3"}
    monkeypatch.setattr(trend_service, "build_perspectives", lambda code, candles, trend: perspectives)

    response = client.post("/trends/7203/perspectives")

    assert response.status_code == 200
    assert response.json() == perspectives


def test_create_perspectives_returns_404_for_an_unknown_code(client):
    assert client.post("/trends/9999/perspectives").status_code == 404


def test_create_perspectives_returns_422_when_there_is_not_enough_data(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles(10))
    client.post("/trends", json={"code": "7203"})

    response = client.post("/trends/7203/perspectives")

    assert response.status_code == 422


def test_create_perspectives_returns_502_when_the_generation_fails(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    client.post("/trends", json={"code": "7203"})

    def raise_error(code, candles, trend):
        raise ValueError("bad output")

    monkeypatch.setattr(trend_service, "build_perspectives", raise_error)

    response = client.post("/trends/7203/perspectives")

    assert response.status_code == 502
    assert "取得できていません" in response.json()["detail"]


def test_fetching_and_refreshing_a_trend_never_builds_perspectives(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())

    def fail(*args, **kwargs):
        raise AssertionError("perspectives must not be built on fetch or refresh")

    monkeypatch.setattr(trend_service, "build_perspectives", fail)

    assert client.post("/trends", json={"code": "7203"}).status_code == 201
    refresh = client.post("/trends/refresh", json={"codes": ["7203"], "interval_minutes": 1})
    assert refresh.status_code == 200
```

`backend/tests/test_trend_service.py` の末尾に、次を追加する(`_daily_raw_candles` と `_patch_fetch` は、Task 2 で、このファイルに足してある):

```python
def test_generate_perspectives_for_returns_none_without_raw_candles(db_session, monkeypatch):
    _patch_fetch(monkeypatch, [])
    trend = trend_service.create_trend(db_session, "7203")

    assert trend_service.generate_perspectives_for(trend) is None


def test_generate_perspectives_for_passes_the_daily_candles_and_the_trend(db_session, monkeypatch):
    _patch_fetch(monkeypatch, _daily_raw_candles([100.0 + i for i in range(40)]))
    trend = trend_service.create_trend(db_session, "7203")
    seen = {}

    def spy(code, candles, trend_value):
        seen.update(code=code, bars=len(candles), trend=trend_value)
        return {"buy": "a1", "sell": "b2", "keep": "c3"}

    monkeypatch.setattr(trend_service, "build_perspectives", spy)

    result = trend_service.generate_perspectives_for(trend)

    assert seen == {"code": "7203", "bars": 40, "trend": "up"}
    assert result == {"buy": "a1", "sell": "b2", "keep": "c3"}
```

- [x] **Step 3: テストが失敗することを確認する**

Run: `cd backend && .venv/bin/python -m pytest tests/test_perspective_service.py tests/test_trend_service.py tests/test_trends_api.py -q`
Expected: FAIL(`ImportError: cannot import name 'perspective_service'`、`AttributeError: ... has no attribute 'build_perspectives'` / `generate_perspectives_for`、`/perspectives` が 404 または 405)

- [x] **Step 4: perspective_service を作る**

`backend/app/perspective_service.py`:

```python
import json
import logging
import os
import re

import anthropic

from . import indicator_service

logger = logging.getLogger(__name__)

MODEL = "claude-haiku-4-5-20251001"
MIN_DAILY_BARS = 26
PERSPECTIVE_KEYS = ("buy", "sell", "keep")
PERIOD_NUMBERS = {"5", "14", "25", "60"}
FORBIDDEN_WORDS = ("必ず", "絶対", "確実", "間違いない", "べきです", "しましょう", "してください")
OFF_TOPIC_WORDS = ("決算", "業績", "材料", "ニュース", "配当", "増益", "減益", "報道")
TREND_WORDS = {"up": "上昇", "down": "下降", "flat": "横ばい"}

PROMPT_TEMPLATE = """以下は{code}という銘柄の、日足の指標です。数字は、書き換えずに、そのまま引用してください。

{metrics_text}

この数字を、次の3つの目線から読んだとき、それぞれどう読めるかを、日本語の標準語で書いてください。
- buy: 買い目線で見たとき
- sell: 売り目線(利益確定や損切りを考える立場)で見たとき
- keep: キープ(様子見)の目線で見たとき

決まり:
- 買う、売るよう勧める文にはしない。「その目線で見たとき、数字がどう読めるか」だけを書く。
- 各目線は、2文以内で書く。最初の文は、上の一覧にある数字から始める。
- 「〜と読めます」「〜の可能性があります」のような、控えめな言い方にする。断定しない。
- 上の一覧に無い数字は、書かない。
- 上の一覧に無い事柄(決算、業績、材料、ニュース、配当、増益、減益、報道など)には、触れない。
- 株価の予測(「上がる」「下がる」など)は、書かない。

出力は、次のJSONオブジェクトの形式のみとし、他の文章は含めないでください。
{{"buy": "...", "sell": "...", "keep": "..."}}
"""


def _fmt(value: float) -> str:
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return "0" if text in ("", "-0") else text


def build_metrics(daily_candles: list[dict], trend: str | None) -> dict[str, str] | None:
    if len(daily_candles) < MIN_DAILY_BARS:
        return None

    closes = [c["close"] for c in daily_candles]
    volumes = [c["volume"] for c in daily_candles]
    sma5 = sum(closes[-5:]) / 5
    sma25 = sum(closes[-25:]) / 25

    metrics: dict[str, str] = {
        "日足のトレンド": TREND_WORDS.get(trend, "判定できない"),
        "終値": _fmt(closes[-1]),
        "5日移動平均": _fmt(sma5),
        "25日移動平均": _fmt(sma25),
    }
    if sma25:
        metrics["5日移動平均の25日移動平均との差(%)"] = _fmt((sma5 - sma25) / sma25 * 100)

    rsi = indicator_service.compute_rsi(daily_candles)
    if rsi:
        metrics["RSI(14日)"] = _fmt(rsi[-1]["value"])

    histogram = indicator_service.compute_macd(daily_candles)["histogram"]
    if histogram:
        metrics["MACDヒストグラム"] = _fmt(histogram[-1]["value"])

    bollinger = indicator_service.compute_bollinger(daily_candles)
    if bollinger["upper"] and bollinger["lower"]:
        metrics["ボリンジャーバンド上限"] = _fmt(bollinger["upper"][-1]["value"])
        metrics["ボリンジャーバンド下限"] = _fmt(bollinger["lower"][-1]["value"])

    if volumes[-2]:
        metrics["出来高の前日比(%)"] = _fmt((volumes[-1] - volumes[-2]) / volumes[-2] * 100)

    window = closes[-60:]
    metrics["直近60日高値"] = _fmt(max(window))
    metrics["直近60日安値"] = _fmt(min(window))
    return metrics


def _allowed_numbers(metrics: dict[str, str]) -> set[str]:
    allowed = set(PERIOD_NUMBERS)
    for value in metrics.values():
        allowed.update(re.findall(r"\d+(?:\.\d+)?", value))
    return allowed


def validate_perspectives(parsed: object, metrics: dict[str, str]) -> dict[str, str]:
    if not isinstance(parsed, dict):
        raise ValueError(f"AIの出力がJSONオブジェクトでない: {type(parsed).__name__}")

    allowed = _allowed_numbers(metrics)
    result: dict[str, str] = {}
    for key in PERSPECTIVE_KEYS:
        text = parsed.get(key)
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"{key} が無い、または空")
        text = text.strip()

        numbers = re.findall(r"\d+(?:\.\d+)?", text)
        if not numbers:
            raise ValueError(f"{key} に数字が無い")
        unknown = [n for n in numbers if n not in allowed]
        if unknown:
            raise ValueError(f"{key} に、入力に無い数字がある: {unknown}")
        hits = [w for w in FORBIDDEN_WORDS if w in text]
        if hits:
            raise ValueError(f"{key} に断定の語がある: {hits}")
        off_topic = [w for w in OFF_TOPIC_WORDS if w in text]
        if off_topic:
            raise ValueError(f"{key} に、入力に無い事柄がある: {off_topic}")
        result[key] = text
    return result


def _strip_code_fence(text: str) -> str:
    match = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, flags=re.DOTALL)
    return match.group(1) if match else text


def generate_perspectives(code: str, metrics: dict[str, str]) -> dict[str, str]:
    metrics_text = "\n".join(f"{label}: {value}" for label, value in metrics.items())
    prompt = PROMPT_TEMPLATE.format(code=code, metrics_text=metrics_text)

    client = anthropic.Anthropic(
        api_key=os.environ.get("ANTHROPIC_API_KEY"),
        timeout=30.0,
        max_retries=1,
    )
    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    raw_text = _strip_code_fence(response.content[0].text.strip())

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"AIの出力がJSONでない: {exc}") from exc
    return validate_perspectives(parsed, metrics)


def build_perspectives(code: str, daily_candles: list[dict], trend: str | None) -> dict[str, str] | None:
    metrics = build_metrics(daily_candles, trend)
    if metrics is None:
        return None
    return generate_perspectives(code, metrics)
```

- [x] **Step 5: エンドポイントを作る**

`backend/app/schemas.py` の末尾に、足す:

```python
class PerspectivesOut(BaseModel):
    buy: str
    sell: str
    keep: str
```

`backend/app/trend_service.py`:

1. import を足す:

```python
from .perspective_service import build_perspectives
```

2. `refresh_trends` の手前に、関数を足す:

```python
def generate_perspectives_for(trend: models.Trend) -> dict[str, str] | None:
    raw_candles = (trend.detail or {}).get("raw_candles")
    if not raw_candles:
        return None
    daily_candles = resample_candles(raw_candles, "1d")
    return build_perspectives(
        trend.code, daily_candles, trend_direction.classify_candles(daily_candles)
    )
```

`backend/app/routers/trends.py`:

1. 先頭の import に、足す:

```python
import logging
```

`from ..schemas import (...)` の中に、`PerspectivesOut` を足す。`router = APIRouter(...)` の手前に、足す:

```python
logger = logging.getLogger(__name__)
```

2. `update_trend_name` の次に、足す:

```python
@router.post("/{code}/perspectives", response_model=PerspectivesOut)
def create_perspectives(code: str, db: Session = Depends(get_db)):
    trend = trend_service.get_active_trend(db, code)
    if trend is None:
        raise HTTPException(status_code=404, detail=f"銘柄コード {code} は見つかりません")
    try:
        perspectives = trend_service.generate_perspectives_for(trend)
    except Exception:
        logger.warning("failed to build perspectives for %s", code, exc_info=True)
        raise HTTPException(status_code=502, detail="AIの読み方は今のところ取得できていません")
    if perspectives is None:
        raise HTTPException(
            status_code=422, detail="日足のデータが足りないため、AIの読み方を作れません"
        )
    return perspectives
```

(`/{code}/perspectives` は、2区間のパスなので、`/refresh` とは、ぶつからない。)

- [x] **Step 6: テストが通ることを確認する**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: 全て PASS(296 件 + 新規 37 件 = 333 件。`test_perspective_service.py` が 30 件、`test_trends_api.py` が 5 件、`test_trend_service.py` が 2 件)

- [x] **Step 7: バックエンドをコミットする**

```bash
git add backend/app/perspective_service.py backend/app/schemas.py backend/app/trend_service.py backend/app/routers/trends.py backend/tests/test_perspective_service.py backend/tests/test_trend_service.py backend/tests/test_trends_api.py
git commit -m "$(cat <<'EOF'
feat(perspectives): build buy/sell/keep perspectives on request with Claude (AIDDS-8)

POST /trends/{code}/perspectives passes the computed daily indicators to
Claude and validates the answer (only given numbers, at least one number, no
assertive wording, nothing outside the data). Nothing is built or stored on
fetch or refresh, so tokens are spent only when the user asks.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ
EOF
)"
```

**フロントエンド**

- [x] **Step 8: 失敗するテストを書く**

`frontend/src/components/PerspectivesPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PerspectiveItem } from "../types";
import { PerspectivesPanel } from "./PerspectivesPanel";

const perspectives = {
  buy: "終値は2900で、上昇の途中と読めます。",
  sell: "終値は2900で、高値圏にあるとも読めます。",
  keep: "終値は2900で、様子を見る見方もあります。",
};

describe("PerspectivesPanel", () => {
  it("renders nothing before any result exists", () => {
    const { container } = render(<PerspectivesPanel items={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows a card per stock with the three perspectives under their own headings", () => {
    const items: PerspectiveItem[] = [
      { code: "7203", name: "トヨタ自動車", status: "done", perspectives },
    ];

    render(<PerspectivesPanel items={items} />);

    expect(screen.getByRole("heading", { name: "AIによる3つの目線" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "7203 トヨタ自動車" })).toBeInTheDocument();
    expect(screen.getByText("買い目線で見ると")).toBeInTheDocument();
    expect(screen.getByText("売り目線で見ると")).toBeInTheDocument();
    expect(screen.getByText("キープ(様子見)の目線で見ると")).toBeInTheDocument();
    expect(screen.getByText(perspectives.buy)).toBeInTheDocument();
    expect(screen.getByText(perspectives.sell)).toBeInTheDocument();
    expect(screen.getByText(perspectives.keep)).toBeInTheDocument();
  });

  it("shows the disclaimer that this is reference information", () => {
    render(<PerspectivesPanel items={[{ code: "7203", name: "", status: "loading" }]} />);

    expect(screen.getByText("断定的な見解ではなく、参考情報として掲載")).toBeInTheDocument();
  });

  it("shows a progress text for a stock that is still being built", () => {
    render(<PerspectivesPanel items={[{ code: "7203", name: "トヨタ自動車", status: "loading" }]} />);

    expect(screen.getByText("作成中...")).toBeInTheDocument();
    expect(screen.queryByText("買い目線で見ると")).not.toBeInTheDocument();
  });

  it("shows the failure message for a stock that failed, next to a stock that worked", () => {
    const items: PerspectiveItem[] = [
      { code: "7203", name: "トヨタ自動車", status: "done", perspectives },
      { code: "6758", name: "ソニーグループ", status: "error", message: "AIの読み方は今のところ取得できていません" },
    ];

    render(<PerspectivesPanel items={items} />);

    expect(screen.getByRole("alert")).toHaveTextContent("AIの読み方は今のところ取得できていません");
    expect(screen.getByText(perspectives.buy)).toBeInTheDocument();
  });
});
```

`frontend/src/hooks/usePerspectives.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as trendsApi from "../api/trends";
import { usePerspectives } from "./usePerspectives";

vi.mock("../api/trends");

const perspectives = { buy: "a1", sell: "b2", keep: "c3" };

describe("usePerspectives", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts with no items and not running", () => {
    const { result } = renderHook(() => usePerspectives());

    expect(result.current.items).toEqual([]);
    expect(result.current.running).toBe(false);
  });

  it("creates the perspectives for each target and keeps them in the order given", async () => {
    vi.mocked(trendsApi.createPerspectives).mockResolvedValue(perspectives);
    const { result } = renderHook(() => usePerspectives());

    await act(async () => {
      await result.current.run([
        { code: "7203", name: "トヨタ自動車" },
        { code: "6758", name: "ソニーグループ" },
      ]);
    });

    expect(result.current.items.map((i) => [i.code, i.status])).toEqual([
      ["7203", "done"],
      ["6758", "done"],
    ]);
    expect(result.current.items[0].perspectives).toEqual(perspectives);
    expect(result.current.running).toBe(false);
  });

  it("marks only the failed stock as an error and keeps the others", async () => {
    vi.mocked(trendsApi.createPerspectives).mockImplementation(async (code) => {
      if (code === "6758") throw new Error("AIの読み方は今のところ取得できていません");
      return perspectives;
    });
    const { result } = renderHook(() => usePerspectives());

    await act(async () => {
      await result.current.run([
        { code: "7203", name: "" },
        { code: "6758", name: "" },
      ]);
    });

    expect(result.current.items[0].status).toBe("done");
    expect(result.current.items[1]).toMatchObject({
      status: "error",
      message: "AIの読み方は今のところ取得できていません",
    });
  });

  it("runs at most three requests at a time", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    vi.mocked(trendsApi.createPerspectives).mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return perspectives;
    });
    const targets = Array.from({ length: 8 }, (_, i) => ({ code: `100${i}`, name: "" }));
    const { result } = renderHook(() => usePerspectives());

    await act(async () => {
      await result.current.run(targets);
    });

    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(result.current.items).toHaveLength(8);
    expect(result.current.items.every((i) => i.status === "done")).toBe(true);
  });

  it("replaces the previous results when it runs again", async () => {
    vi.mocked(trendsApi.createPerspectives).mockResolvedValue(perspectives);
    const { result } = renderHook(() => usePerspectives());

    await act(async () => {
      await result.current.run([{ code: "7203", name: "" }]);
    });
    await act(async () => {
      await result.current.run([{ code: "6758", name: "" }]);
    });

    expect(result.current.items.map((i) => i.code)).toEqual(["6758"]);
  });
});
```

`frontend/src/components/WatchlistPage.test.tsx` の `describe("WatchlistPage", ...)` の中に、次を追加する(`sampleTrend` と、`render` の包み方は、このファイルの、既存のテストと同じ):

```tsx
  it("keeps the 意見 button disabled until a row is checked", async () => {
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([sampleTrend]);

    render(
      <ThemeProvider>
        <MemoryRouter>
          <WatchlistPage />
        </MemoryRouter>
      </ThemeProvider>
    );

    await screen.findByLabelText("7203の会社名");
    expect(screen.getByRole("button", { name: "意見" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("7203を選択"));

    expect(screen.getByRole("button", { name: "意見" })).toBeEnabled();
  });

  it("creates the perspectives only for the checked rows and shows a card per stock", async () => {
    const sony = { ...sampleTrend, id: 2, code: "6758", name: "ソニーグループ" };
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([sampleTrend, sony]);
    vi.mocked(trendsApi.createPerspectives).mockResolvedValue({
      buy: "終値は2900で、上昇の途中と読めます。",
      sell: "終値は2900で、高値圏にあるとも読めます。",
      keep: "終値は2900で、様子を見る見方もあります。",
    });

    render(
      <ThemeProvider>
        <MemoryRouter>
          <WatchlistPage />
        </MemoryRouter>
      </ThemeProvider>
    );

    await screen.findByLabelText("7203の会社名");
    fireEvent.click(screen.getByLabelText("7203を選択"));
    fireEvent.click(screen.getByRole("button", { name: "意見" }));

    expect(await screen.findByRole("heading", { name: "7203 トヨタ自動車" })).toBeInTheDocument();
    expect(screen.getByText("終値は2900で、上昇の途中と読めます。")).toBeInTheDocument();
    expect(trendsApi.createPerspectives).toHaveBeenCalledTimes(1);
    expect(trendsApi.createPerspectives).toHaveBeenCalledWith("7203");
    expect(screen.queryByRole("heading", { name: /6758/ })).not.toBeInTheDocument();
  });

  it("shows the failure message inside the card when the request fails", async () => {
    vi.mocked(trendsApi.fetchTrends).mockResolvedValue([sampleTrend]);
    vi.mocked(trendsApi.createPerspectives).mockRejectedValue(
      new Error("AIの読み方は今のところ取得できていません")
    );

    render(
      <ThemeProvider>
        <MemoryRouter>
          <WatchlistPage />
        </MemoryRouter>
      </ThemeProvider>
    );

    await screen.findByLabelText("7203の会社名");
    fireEvent.click(screen.getByLabelText("7203を選択"));
    fireEvent.click(screen.getByRole("button", { name: "意見" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("AIの読み方は今のところ取得できていません");
  });
```

- [x] **Step 9: テストが失敗することを確認する**

Run: `cd frontend && npx vitest run src/components/PerspectivesPanel.test.tsx src/hooks/usePerspectives.test.ts src/components/WatchlistPage.test.tsx`
Expected: FAIL(`PerspectivesPanel`・`usePerspectives` が無い。「意見」ボタンが無い)

- [x] **Step 10: 実装する**

`frontend/src/types.ts` に、足す(`NewsItem` の下):

```ts
export interface Perspectives {
  buy: string;
  sell: string;
  keep: string;
}

export interface PerspectiveItem {
  code: string;
  name: string;
  status: "loading" | "done" | "error";
  perspectives?: Perspectives;
  message?: string;
}
```

`frontend/src/api/trends.ts`:

import を変える:

```ts
import type { Perspectives, Trend, TrendDetail } from "../types";
```

末尾に、足す:

```ts
export function createPerspectives(code: string): Promise<Perspectives> {
  return apiRequest<Perspectives>(`/trends/${code}/perspectives`, { method: "POST" });
}
```

`frontend/src/hooks/usePerspectives.ts`:

```ts
import { useCallback, useState } from "react";
import { createPerspectives } from "../api/trends";
import type { PerspectiveItem } from "../types";

const MAX_CONCURRENT_REQUESTS = 3;
const FALLBACK_MESSAGE = "AIの読み方は今のところ取得できていません";

interface Target {
  code: string;
  name: string;
}

export function usePerspectives() {
  const [items, setItems] = useState<PerspectiveItem[]>([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(async (targets: Target[]) => {
    setRunning(true);
    setItems(targets.map((t) => ({ code: t.code, name: t.name, status: "loading" })));

    const update = (code: string, patch: Partial<PerspectiveItem>) =>
      setItems((prev) => prev.map((item) => (item.code === code ? { ...item, ...patch } : item)));

    let next = 0;
    const worker = async () => {
      while (next < targets.length) {
        const { code } = targets[next++];
        try {
          const perspectives = await createPerspectives(code);
          update(code, { status: "done", perspectives });
        } catch (e) {
          update(code, {
            status: "error",
            message: e instanceof Error ? e.message : FALLBACK_MESSAGE,
          });
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT_REQUESTS, targets.length) }, worker)
    );
    setRunning(false);
  }, []);

  return { items, running, run };
}
```

`frontend/src/components/PerspectivesPanel.tsx`:

```tsx
import type { PerspectiveItem, Perspectives } from "../types";

const LEADS = [
  { key: "buy", label: "買い目線で見ると" },
  { key: "sell", label: "売り目線で見ると" },
  { key: "keep", label: "キープ(様子見)の目線で見ると" },
] as const;

function PerspectiveList({ perspectives }: { perspectives: Perspectives }) {
  return (
    <dl className="perspectives-list">
      {LEADS.map(({ key, label }) => (
        <div className="perspective-item" key={key}>
          <dt>{label}</dt>
          <dd>{perspectives[key]}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PerspectivesPanel({ items }: { items: PerspectiveItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="perspectives-panel" aria-label="AIによる3つの目線">
      <h2>AIによる3つの目線</h2>
      <p className="perspectives-disclaimer">断定的な見解ではなく、参考情報として掲載</p>
      <div className="perspectives-cards">
        {items.map((item) => (
          <article className="perspectives-card" key={item.code}>
            <h3>
              {item.code} {item.name}
            </h3>
            {item.status === "loading" && <p>作成中...</p>}
            {item.status === "error" && (
              <p role="alert" className="inline-error">
                {item.message}
              </p>
            )}
            {item.status === "done" && item.perspectives && (
              <PerspectiveList perspectives={item.perspectives} />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
```

`frontend/src/components/WatchlistPage.tsx`:

1. import を足す:

```tsx
import { usePerspectives } from "../hooks/usePerspectives";
import { PerspectivesPanel } from "./PerspectivesPanel";
```

2. `useTrendGroups()` の行の次に、足す:

```tsx
  const { items: perspectiveItems, running: perspectivesRunning, run: runPerspectives } = usePerspectives();
  const opinionTargets = watchlist
    .filter((trend) => selectedCodes.has(trend.code))
    .map((trend) => ({ code: trend.code, name: trend.name }));
```

3. 最初の `<div className="controls-row-group">` の、先頭(`<CodeInput ... />` の手前)に、足す:

```tsx
            <button
              type="button"
              className="btn btn-primary"
              disabled={opinionTargets.length === 0 || perspectivesRunning}
              onClick={() => void runPerspectives(opinionTargets)}
            >
              意見
            </button>
```

4. `<WatchlistTable ... />` の次の行(`</div>` の手前)に、足す:

```tsx
        <PerspectivesPanel items={perspectiveItems} />
```

`frontend/src/index.css` の `.news-time` の定義の下に、足す:

```css
.perspectives-panel {
  margin-top: 24px;
}

.perspectives-panel h2 {
  margin: 0 0 4px;
  font-size: 18px;
}

.perspectives-disclaimer {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--text-muted);
}

.perspectives-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.perspectives-card {
  min-width: 0;
  padding: 16px 20px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 6px;
  box-shadow: var(--card-shadow);
}

.perspectives-card h3 {
  margin: 0 0 8px;
  font-size: 15px;
}

.perspectives-list {
  margin: 0;
}

.perspective-item {
  padding: 10px 0;
  border-bottom: 1px solid var(--row-border);
}

.perspective-item:last-child {
  border-bottom: none;
}

.perspective-item dt {
  margin-bottom: 4px;
  font-size: 14px;
  font-weight: 600;
}

.perspective-item dd {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
}
```

- [x] **Step 11: テストと型チェックを実行する**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: 全て PASS、型エラー無し

- [x] **Step 12: フロントエンドをコミットする**

```bash
git add frontend/src
git commit -m "$(cat <<'EOF'
feat(frontend): add the 意見 button and the AI perspectives panel to the watchlist (AIDDS-8)

The yellow button at the left of the controls row builds the buy/sell/keep
perspectives for the checked rows only, one request per stock (three at a
time), and shows a card per stock below the table. Nothing is saved.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ
EOF
)"
```

**実機スモークテスト**

- [x] **Step 13: AIの呼び出しの有無を確かめる(キーは、出力しない)**

```bash
docker compose -p aidds9-smoke exec -T backend sh -c '[ -n "$ANTHROPIC_API_KEY" ] && echo "ANTHROPIC_API_KEY: set" || echo "ANTHROPIC_API_KEY: unset"'
```

- [x] **Step 14: 画面を確認する**

銘柄を、2〜3件取得する(日足が26本以上ある銘柄)。確認する点:
- 「意見」ボタンが、上の操作の行の、いちばん左にあり、黄色で、「株式コード」の入力欄と、高さがそろっている(`docs/images/AIDDS-8-opinion-button-position.png` と比べる)。
- チェックが0件のとき、押せない。チェックを入れると、押せる。
- チェックした行だけが、表の下のパネルに、カードで出る。「作成中...」から、3つの目線に変わる。
- キーが `set` のとき: 本物の応答を見る(数字から始まり、控えめで、断定していないこと。入力に無い事柄に触れていないこと)。`unset` のとき: カードに「AIの読み方は今のところ取得できていません」が出る。3つの目線のある見た目は、`POST /trends/*/perspectives` の応答に差し込んで(Playwright の `route`)確認する。
- 1銘柄だけ失敗させて(応答の差し替え)、他の銘柄のカードが、そのまま出る。
- 取得・更新(「取得」「更新」)を押しても、AIが呼ばれない(バックエンドのログに、AIの呼び出しが出ない)。
- ライトとダークの両方で撮る。画面のスクリーンショットを、ユーザーに送る。

- [x] **Step 15: 全体の通しの確認**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q` と `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: 全て PASS。

そのうえで、Task 2〜4 の画面(保有一覧、発掘一覧、「意見」)を、続けて、1周する。スモーク用のスタックを、「実機スモークテストの手順」の 5 で消す。

- [x] **Step 16: 設計書を更新する(06・09)**

- `docs/design/06-position-grouping.md`: 「`WatchlistPage` のコントロール行」の先頭に、「意見」ボタン(黄色、チェックした行が対象、0件のときは押せない)を足す。「`WatchlistTable` の下」に、「AIによる3つの目線」のパネル(銘柄ごとのカード、保存しない)を足す。データフローに、`POST /trends/{{code}}/perspectives`(1銘柄ずつ、同時に3つまで)を足す。
- `docs/design/09-trend-direction-and-market-colors.md`: 「AIの3つの目線」の節が、実装(入力の数字、検査の規則、押したときだけ作る、保存しない、API の応答と状態コード)と一致しているか、確かめる。ずれがあれば、直す。

```bash
git add docs/design
git commit -m "$(cat <<'EOF'
docs(design): describe the 意見 button and the AI perspectives panel (AIDDS-8)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ
EOF
)"
```

---

## 実機スモークテストの手順(Task 2・3・4 で共通)

動いている `trend-compass` のスタックは、**止めない**。別のプロジェクト名とポートで、空のDBのスタックを、もう1つ起動する。

1. 動いているスタックを確認する: `docker compose ls`。`trend-compass` が、ポート(3307・8000・5173)を使っている。
2. 上書き用の設定を、スクラッチ用のディレクトリ(リポジトリの外)に作る。`smoke.override.yml`:

   ```yaml
   services:
     db:
       ports: !override ["3317:3306"]
     backend:
       ports: !override ["8010:8000"]
     frontend:
       ports: !override ["5183:5173"]
       environment:
         VITE_API_BASE_URL: http://localhost:8010
   ```

3. スモーク用のスタックを、空のDBで起動する(`projects/trend-compass/` で):

   ```bash
   docker compose -p aidds9-smoke -f docker-compose.yml -f <スクラッチ>/smoke.override.yml up -d --build
   ```

   起動の確認: `curl -s http://localhost:8010/health`。画面は `http://localhost:5183`。DBは、このプロジェクト専用の新しいボリュームで、列は、新しいコードで、最初から作られる(あなたのDBには、影響しない)。
4. 画面は、Playwright で操作する(`frontend/node_modules/playwright`(プロジェクトルートからの相対パス))。スクリーンショットは、スクラッチ用のディレクトリに保存して、ユーザーに送る。
5. 終わったら、スモーク用のスタックを消す: `docker compose -p aidds9-smoke -f docker-compose.yml -f <スクラッチ>/smoke.override.yml down -v`。あなたのスタックは、そのまま動いている。
6. ユーザーのスタックを、新しいコードで使うには、DBの作り直し(`docker compose down -v` のあと `docker compose up -d --build`)が要る(列が増えるため)。**データが消えるので、ユーザーのタイミングに任せる。** 私からは、実行しない。

---

# 追記: AIDDS-11(意見の行ボタン・右側パネルと、AIの結果の保存)

**Goal:** 保有銘柄の一覧の「意見」を、各行の「意見 / 詳細 / 削除」ボタンと、一覧の右側のパネルに作り直し、AIの3つの目線を`trend`の行に保存して、同じ判断データで都度トークンを消費しないようにする。

**Architecture:** バックエンドは、`trend`テーブルに列`perspectives`(JSON、NULL可)を足し、`POST /trends/{code}/perspectives`を「保存済みならそれを返し、無ければ作って保存して返す」に変える。`GET /trends`は保存済みの意見を返す。フロントは、左上の「意見」ボタンと下のパネルを廃し、行のボタンで右側のパネルを開閉する。パネルを開いている間、一覧は主要な列だけに折りたたむ。AIの呼び出し・検査(`perspective_service`)は変えない。

**Spec:** [docs/design/09-trend-direction-and-market-colors.md](../../design/09-trend-direction-and-market-colors.md)(「AIの3つの目線」の節と「画像」)、[docs/design/06-position-grouping.md](../../design/06-position-grouping.md)。画面イメージ: [AIDDS-11-opinion-panel-mock.png](../../images/AIDDS-11-opinion-panel-mock.png)。この追記の前に、設計書09・06を書き換えた(未コミット。Task 5 の Step 1 でコミットする)。

## 追記: AIDDS-11 の確認してほしい点(2026-10-01)

上の計画(Task 1〜4)の実装後に、AIDDS-11 が、同じエピックに足された。同じエピックの計画書なので、この計画書に、Task 5 として追記した。次の判断を、確認してほしい。変えたい点があれば、教えてほしい。

1. **別の計画書にせず、このエピックの計画書に追記した**: エピックごとに、計画書は1本にする決まり。設計書も、エピックの設計書09を書き換えた(06も)。Task 1〜4 は、実装まで済んでいる(チェック済み)。実行するときは、Task 5 から始める。
2. **意見は、取得の行(`trend`の行)ごとに1回**(あなたの指示): 「更新」で新しい行ができると、意見は空に戻る。数字が同じなら引き継ぐ案は、選ばれなかったので入れない。
3. **保存済みの意見がある銘柄で「意見」を押したときは、保存済みを表示するだけ**(あなたの指示): 「作り直す」ボタンは置かない。作り直したいときは、「更新」で新しい行を作る。
4. **AIの呼び出しに失敗したときは、保存しない**: パネルにエラーの文言を出す。パネルを閉じて、もう一度開く(または別の行を経由する)と、もう一度作る。
5. **パネルを開いたまま「更新」したとき**(あなたの指示で決定): 行が新しく差し替わるので、パネルを閉じる。新しい行の意見は、「意見」を押したときに作る(「意見」を押したときだけAIを呼ぶ。「更新」では、トークンを使わない)。
6. **折りたたんでいる間、行のエラー文(保存の失敗など)は、会社名の下に出す**: いまは「損益」の列に出していて、折りたたむと見えなくなるため。エラーが出た行だけ、行が高くなる(正常時は、行の高さは変わらない)。
7. **行の高さは、固定する**(あなたの指示): 閉じた状態で実測した高さを、CSS変数にして、開閉の両方で使う。
8. **画面幅が約900px未満のとき、パネルは一覧の下に出す(折りたたまない)**: モックは640pxだったが、実際の一覧は列が多く、開いたときの一覧の最小幅が約650pxになるため、900pxにした。
9. **「3銘柄まで同時」の上限と、チェックボックスでの一括作成は、なくなる**: 1回の操作で作るのは、1銘柄だけ。チェックボックスは、意見には使わない(更新・削除などの既存の用途は変えない)。
10. **DBの作り直しが必要**: `trend`に列`perspectives`を足す(マイグレーションが無いプロジェクトの決まり)。あなたの環境へ反映するときは、`docker compose down -v` で作り直す(データは消える。タイミングはお任せ)。
11. **実機確認の進め方は、前回と同じ**: 動いているスタックを止めず、別のプロジェクト名(`aidds9-smoke`)・別のポート(DB 3317、バックエンド 8010、フロント 5183)で確認する。`ANTHROPIC_API_KEY` が使えない(残高不足の)ときは、本物のAIの呼び出しは確認できない。保存済みの表示は、DBに直接入れた値で、作成の成功は、画面のリクエストの差し替えで確認する。

## 追記分の Global Constraints

上の Global Constraints に加えて、次を守る。

- 日本語の画面文言。断定調を避ける(「AIの読み方は今のところ取得できていません」など、既存の文言を変えない)
- 本物のClaudeを、テストで呼ばない(`trend_service.build_perspectives`をモックする)
- 作成日時は`clock.now_jst()`(日本時間)。`trend`の既存の列の意味・既存のAPIの形(追加項目を除く)は変えない
- 既存の色の方針(上昇=赤・下落=緑。`--up-*`/`--down-*`)に合わせる。色は、CSS変数を使う
- 新しい列を足すので、`CLAUDE.md`の「実機スモークテスト」を、マージ前に行う(別ポートのスタックで)
- コミットメッセージの末尾に、次の2行を付ける: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` と `Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ`
- push・マージ・PRは、この計画に含めない

## 追記分の Review Focus

仕様が示すが、どのタスクのテストも直接は確かめていない、実際に困りやすいもの。

1. **パネルを開いている銘柄が、一覧から消えたとき**(削除・グループ絞込・更新で行が差し替わる): パネルは閉じ、一覧は折りたたまれたままにならない。
2. **「意見」を続けて押したとき**(ダブルクリック、作成中に別の行→元の行): 同じ`trend`の行に対して、AIを2回呼ばない。
3. **保存の失敗**: AIの失敗・検査の不合格・日足不足のとき、`trend.perspectives`は空のまま(あとで押し直すと、もう一度作る)。
4. **更新で行が差し替わったとき**: 古い行の意見が、新しい行に引き継がれない。
5. **行の高さ**: 開閉で、行と一覧の高さが変わらない(jsdomでは見えない。実機で測る)。
6. **発掘・詳細の画面**: AIの意見の表示が、無いままである。
7. **一覧のAPIの重さ**: `GET /trends`は`detail`列を遅延読み込みにしている(`defer`)。`perspectives`列は小さいので、遅延にしない(一覧に必要)が、`detail`の遅延は、そのまま維持する。

## 追記分の実装の順番と理由

Task 5(AIDDS-11)は、Task 1〜4 のあとに実装する。Task 4(AIDDS-8)で作った`perspective_service`・`PerspectivesPanel`・`usePerspectives`を、作り直すため。Task 5 の中は、次の順に進める。

1. 設計書のコミット → 2. バックエンド(列・API・保存) → 3. フロント(型・フック・パネル・一覧) → 4. 設計書の突き合わせ → 5. 実機確認

バックエンドを先にするのは、フロントが、`Trend.perspectives`とAPIの形(`created_at`付き)に依存するため。

### Task 5: 意見の行ボタン・右側パネルと、結果の保存 (AIDDS-11)

**Files:**
- Modify: `backend/app/models.py`(`Trend.perspectives`)、`backend/app/schemas.py`(`PerspectivesOut`の位置と`created_at`、`TrendOut.perspectives`)、`backend/app/trend_service.py`(`get_or_create_perspectives`)、`backend/app/routers/trends.py`
- Test: `backend/tests/test_trends_api.py`、`backend/tests/test_trend_service.py`(既存の`perspectives`のテストを直し、保存のテストを足す)
- Modify: `frontend/src/types.ts`、`frontend/src/api/trends.ts`、`frontend/src/hooks/usePerspectives.ts`、`frontend/src/components/PerspectivesPanel.tsx`、`WatchlistPage.tsx`、`WatchlistTable.tsx`、`WatchlistRow.tsx`、`frontend/src/index.css`
- Test: `usePerspectives.test.ts`、`PerspectivesPanel.test.tsx`、`WatchlistTable.test.tsx`、`WatchlistPage.test.tsx`(既存を、この仕様に合わせて書き直す)
- Docs: `docs/design/09-…`と`06-…`(計画の前に更新済み)、`01-watchlist-foundation.md`(一覧の列・ボタンの記述があれば合わせる)

**Interfaces:**
- Consumes: `perspective_service.build_perspectives(code, daily_candles, trend) -> dict | None`(`{"buy","sell","keep"}`。変えない)、`trend_service.generate_perspectives_for(trend)`(変えない)、`clock.now_jst()`
- Produces:
  - `models.Trend.perspectives: dict | None`(`{"buy","sell","keep","created_at"(ISO文字列)}`)
  - `trend_service.get_or_create_perspectives(db, trend) -> dict | None`(保存済みならそれ。無ければ作って保存して返す。日足不足は`None`で、保存しない。AIの失敗は例外のまま上げ、保存しない)
  - `PerspectivesOut{buy, sell, keep, created_at: datetime}`、`TrendOut.perspectives: PerspectivesOut | None`
  - フロント: `Perspectives{buy, sell, keep, created_at}`、`Trend.perspectives?: Perspectives | null`、`usePerspectives(watchlist) -> { openCode, opened, state, toggle }`

- [x] **Step 1: ブランチを整え、設計書をコミットする**

```bash
cd <プロジェクトルート>
git checkout feature/20261001 && git merge main      # mainにマージ済みの内容を取り込む(ファストフォワード)
git add docs/design/06-position-grouping.md docs/design/09-trend-direction-and-market-colors.md \
        docs/images/AIDDS-11-opinion-panel-mock.png docs/superpowers/plans/2026-10-01-AIDDS-9-feature-improvement-202610-01.md
git commit -m "docs(design): redesign the 意見 as a row button with a side panel and save the result on trend (AIDDS-11)"
```
(末尾に、Global Constraints の2行を付ける。この計画書の、Task 1〜4 のチェック済みの更新と、Task 5 の追記も、このコミットに含める。)

- [x] **Step 2: バックエンドの失敗するテストを書く**(`backend/tests/test_trends_api.py`。既存のヘルパー`_patch_fetch`・`_rising_raw_candles`を使う)

まず、既存の`test_create_perspectives_returns_the_three_perspectives`を、保存の仕様に合わせて直す(応答に`created_at`が増えるため、`response.json() == perspectives`は成り立たなくなる。`buy`・`sell`・`keep`の一致と、`created_at`があることを確かめる形にする)。そのうえで、次を足す。

```python
def test_perspectives_are_saved_and_reused_without_calling_the_ai_again(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    client.post("/trends", json={"code": "7203"})
    calls = []

    def fake_build(code, candles, trend):
        calls.append(code)
        return {"buy": "a1", "sell": "b2", "keep": "c3"}

    monkeypatch.setattr(trend_service, "build_perspectives", fake_build)

    first = client.post("/trends/7203/perspectives")
    second = client.post("/trends/7203/perspectives")

    assert first.status_code == 200
    assert {"buy", "sell", "keep", "created_at"} <= first.json().keys()
    assert second.json() == first.json()
    assert calls == ["7203"]                      # 2回目は、AIを呼ばない
    listed = client.get("/trends").json()
    assert listed[0]["perspectives"]["buy"] == "a1"
    assert listed[0]["perspectives"]["created_at"] == first.json()["created_at"]


def test_list_trends_returns_null_perspectives_before_any_are_made(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    client.post("/trends", json={"code": "7203"})

    assert client.get("/trends").json()[0]["perspectives"] is None


def test_failed_perspectives_are_not_saved(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    client.post("/trends", json={"code": "7203"})

    def raise_error(code, candles, trend):
        raise ValueError("bad output")

    monkeypatch.setattr(trend_service, "build_perspectives", raise_error)
    assert client.post("/trends/7203/perspectives").status_code == 502
    assert client.get("/trends").json()[0]["perspectives"] is None

    monkeypatch.setattr(
        trend_service, "build_perspectives", lambda code, candles, trend: {"buy": "a1", "sell": "b2", "keep": "c3"}
    )
    assert client.post("/trends/7203/perspectives").status_code == 200   # 失敗の後に、もう一度作れる


def test_too_few_daily_bars_are_not_saved(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles(10))
    client.post("/trends", json={"code": "7203"})

    assert client.post("/trends/7203/perspectives").status_code == 422
    assert client.get("/trends").json()[0]["perspectives"] is None


def test_refresh_creates_a_row_without_the_old_perspectives(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    added = client.post("/trends", json={"code": "7203"}).json()
    monkeypatch.setattr(
        trend_service, "build_perspectives", lambda code, candles, trend: {"buy": "a1", "sell": "b2", "keep": "c3"}
    )
    assert client.post("/trends/7203/perspectives").status_code == 200

    session = client.session_local()               # 「更新」の間隔を過ぎたことにする(既存の refresh のテストと同じ方法)
    try:
        row = session.get(models.Trend, added["id"])
        row.created_at = now_jst() - timedelta(minutes=5)
        session.commit()
    finally:
        session.close()
    refreshed = client.post("/trends/refresh", json={"codes": ["7203"], "interval_minutes": 1})

    assert refreshed.status_code == 200
    assert client.get("/trends").json()[0]["perspectives"] is None   # 新しい行は、空
```

- [x] **Step 3: テストを実行して、失敗を確認する**

Run: `cd backend && .venv/bin/python -m pytest tests/test_trends_api.py -q`
Expected: 新しいテストが、`perspectives`が無い等で FAIL。

- [x] **Step 4: バックエンドを実装する**

```python
# models.py (Trend)
perspectives: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)

# schemas.py: PerspectivesOut を TrendOut より前に置く
class PerspectivesOut(BaseModel):
    buy: str
    sell: str
    keep: str
    created_at: datetime

class TrendOut(BaseModel):
    # (既存の項目は、そのまま)
    perspectives: PerspectivesOut | None = None

# trend_service.py
def get_or_create_perspectives(db: Session, trend: models.Trend) -> dict | None:
    if trend.perspectives:
        return trend.perspectives
    generated = generate_perspectives_for(trend)
    if generated is None:
        return None
    trend.perspectives = {**generated, "created_at": now_jst().isoformat()}
    db.commit()
    return trend.perspectives

# routers/trends.py (create_perspectives): generate_perspectives_for の呼び出しを
perspectives = trend_service.get_or_create_perspectives(db, trend)
# に置き換える(404 / 422 / 502 の分岐は、そのまま)
```
`get_active_trend`/`list_active_trends`の`defer(models.Trend.detail)`は、変えない(`perspectives`は遅延にしない)。

- [x] **Step 5: バックエンドの全テストを実行する**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: すべて PASS(ベースラインは334件。増えた分だけ増える)。既存の`perspectives`のテストで、保存の仕様と食い違うものは、仕様に合わせて直す(アサーションを緩めて通さない)。

- [x] **Step 6: バックエンドをコミットする**

```bash
git add backend/app/models.py backend/app/schemas.py backend/app/trend_service.py \
        backend/app/routers/trends.py backend/tests/
git commit -m "feat(perspectives): save the AI result on the trend row and reuse it (AIDDS-11)"
```
(末尾に、Global Constraints の2行を付ける。)

- [x] **Step 7: フロントの失敗するテストを書く**

`usePerspectives.test.ts`(フックを、`renderHook`で):
- 行に`perspectives`が入っていれば、`toggle(code)`で開いても、`createPerspectives`を呼ばない(`opened`の意見を返す)
- 入っていなければ、開いたときに1回だけ`createPerspectives`を呼ぶ(続けて2回`toggle`/再レンダリングしても、1回)
- 作成が成功したら、`state`が`done`になり、意見が出る。失敗したら`error`と文言。閉じて開き直すと、もう一度呼ぶ
- 同じ行を、もう一度`toggle`すると、閉じる(`openCode`が`null`)。別の行を`toggle`すると、切り替わる
- 開いている銘柄が`watchlist`から消えたら、`opened`は`null`(折りたたまれない)
- 開いている行が、「更新」で別の`id`の行に差し替わったら、パネルは閉じる(AIを呼ばない)。そのあと「意見」を押すと、新しい行の分を作る

`PerspectivesPanel.test.tsx`: 作成中の「作成中...」、エラー(`role="alert"`)、3つの目線と作成日時、注記の文言。閉じるボタンが無いこと。

`WatchlistTable.test.tsx` / `WatchlistPage.test.tsx`: 各行に「意見」「詳細」「削除」があり、左上に「意見」ボタンが無い。「意見」を押すと、パネルが開き、`グループ`・`更新日時`・`預かり区分`・`購入金額`・`購入株数`・`損益`の列が隠れる(`minor-col`が、非表示になるクラスで)。もう一度押すと閉じて、元に戻る。開いている行の「意見」が`aria-pressed="true"`。折りたたんでいる間、行のエラー文が、会社名の下に出る。

- [x] **Step 8: テストを実行して、失敗を確認する**

Run: `cd frontend && npx vitest run src/hooks/usePerspectives.test.ts src/components`
Expected: 新しいテストが FAIL。

- [x] **Step 9: フロントを実装する**

型とAPI(`types.ts`・`api/trends.ts`):

```ts
export interface Perspectives { buy: string; sell: string; keep: string; created_at: string }
// Trend に追加
perspectives?: Perspectives | null;
// PerspectiveItem は廃止
```

フック(`usePerspectives.ts`。1銘柄ずつ。保存済み=サーバーの値は`Trend.perspectives`、作った直後の値は`generated`):

```ts
export function usePerspectives(watchlist: Trend[]) {
  const [openId, setOpenId] = useState<number | null>(null);          // 行(trend.id)で覚える。更新で行が差し替わったら、閉じる
  const [generated, setGenerated] = useState<Record<number, Perspectives>>({});
  const [failures, setFailures] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState<Set<number>>(new Set());
  const inflight = useRef<Set<number>>(new Set());          // 二重呼び出しの防止(StrictModeも含む)

  const opened = watchlist.find((t) => t.id === openId) ?? null;
  const perspectives = opened ? (opened.perspectives ?? generated[opened.id] ?? null) : null;

  useEffect(() => {
    if (!opened || perspectives || failures[opened.id] || inflight.current.has(opened.id)) return;
    const { id, code } = opened;
    inflight.current.add(id);
    setLoading((s) => new Set(s).add(id));
    createPerspectives(code)
      .then((p) => setGenerated((g) => ({ ...g, [id]: p })))
      .catch((e) => setFailures((f) => ({ ...f, [id]: e instanceof Error ? e.message : FALLBACK_MESSAGE })))
      .finally(() => {
        inflight.current.delete(id);
        setLoading((s) => { const n = new Set(s); n.delete(id); return n; });
      });
  }, [opened, perspectives, failures]);

  const toggle = (code: string) => {
    const target = watchlist.find((t) => t.code === code);
    if (!target) return;
    if (openId === target.id) { setOpenId(null); return; }
    setFailures((f) => { const { [target.id]: _, ...rest } = f; return rest; });   // 開き直すと、もう一度作る
    setOpenId(target.id);
  };

  const state = !opened ? "closed" : perspectives ? "done" : failures[opened.id] ? "error" : "loading";
  return { openCode: opened?.code ?? null, opened, perspectives, state, error: opened ? failures[opened.id] : undefined, toggle };
}
```
(`createPerspectives`のエラーの文言は、既存の`apiRequest`の挙動に合わせる。実装時に、上のコードを、既存の流儀(型・命名)に整えてよい。振る舞いは、Step 7のテストが定める。)

一覧とパネル:
- `WatchlistRow`: 「詳細」「削除」の2つの`<td className="actions-col">`を、1つにして、「意見」(`btn btn-primary`、`aria-pressed`)・「詳細」・「削除」を並べる。props に`viewing: boolean`・`onToggleOpinion(code)`・`folded: boolean`を足す。隠す6つの列の`<td>`に、`className="minor-col"`を付ける(`checkbox-col`などの既存のクラスと並べる)。`viewing`のとき、行に`is-viewing`(青系。発掘の一覧と同じ見た目)を付ける。`folded`のとき、行のエラー文は、会社名の`<td>`の下に出し、損益の`<td>`の中には出さない。
- `WatchlistTable`: 見出しの6列に`minor-col`、操作の見出しを1つ(「操作」)にする。`<table>`に、`folded`のとき`watchlist-table--folded`を付ける。
- `WatchlistPage`: 左上の「意見」ボタンと、`opinionTargets`、表の下の`<PerspectivesPanel>`を、廃止する。`const perspectivesApi = usePerspectives(watchlist)`を使い、`<div className="watchlist-layout">`の中に、`WatchlistTable`と、(`perspectivesApi.opened`があるとき)`<PerspectivesPanel>`を並べる。
- `PerspectivesPanel`: props を`{ trend, state, perspectives, error }`に変える。見出し「{コード} {銘柄名}」、注記、3つの目線(`dl`。既存の`perspectives-list`)、作成日時(「作成: 2026/10/1 16:43」の形。`toLocaleString("ja-JP")`)。閉じるボタンは置かない。
- `index.css`: `.watchlist-layout { display:flex; gap:16px; align-items:flex-start }`、一覧(`min-width:0; flex:1 1 0; overflow-x:auto`)、`.perspectives-panel { flex:0 0 340px }`、`.watchlist-table--folded .minor-col { display:none }`、`.watchlist-table tbody tr { height: var(--watchlist-row-height) }`(値は、Step 11で実測して決める)、`@media (max-width: 900px)` で縦に積み、折りたたまない(`.watchlist-table--folded .minor-col { display: table-cell }`)。不要になった`.perspectives-cards`・`.perspectives-card`のスタイルは、削除する。

- [x] **Step 10: フロントのテスト・型チェックを実行する**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: すべて PASS、型エラーなし(ベースラインは248件。書き直した分で、件数は変わる)。

- [x] **Step 11: 行の高さを実測して、固定する**

別ポートのスタック(Step 14の準備と同じ)で、閉じた状態の行の高さを、Playwrightで測り(`getBoundingClientRect().height`)、最大値を整数に切り上げて、`--watchlist-row-height`にする。開いた状態でも、同じ高さであることを、Step 14で確かめる。値を、コメントで残す(何pxを、いつ、どの画面幅で測ったか)。

- [x] **Step 12: フロントをコミットする**

```bash
git add frontend/src
git commit -m "feat(frontend): open the AI perspectives from a row button in a side panel (AIDDS-11)"
```
(末尾に、Global Constraints の2行を付ける。)

- [x] **Step 13: 設計書と、実装を突き合わせる**

`docs/design/01-watchlist-foundation.md`に、一覧の列やボタン(「詳細」「削除」を別の列とする記述など)があれば、合わせる。`09`・`06`の記述(列の名前、パネルの幅、折りたたむ列、`aria-pressed`、API、保存の仕様)が、実装と食い違っていないか、1項目ずつ確かめる。食い違いは、実装を仕様に合わせる。仕様のほうが間違っていたときは、設計書を直し、その理由を報告に書く。直したら、コミットする。

```bash
git add docs/design
git commit -m "docs(design): align the watchlist docs with the 意見 side panel (AIDDS-11)"
```
(変更が無ければ、コミットしない。)

- [x] **Step 14: 実機スモークテスト**(`CLAUDE.md`の必須の確認。動いているスタックは止めない)

準備: 別のプロジェクト名`aidds9-smoke`で、ポートを上書きした compose ファイル(DB 3317、バックエンド 8010、フロント 5183、`VITE_API_BASE_URL=http://localhost:8010`。`ports: !override`)を使い、`docker compose -p aidds9-smoke -f docker-compose.yml -f <上書きファイル> up -d --build`。銘柄は、実際の取得(`POST /trends`)で数件入れる。確認は、`frontend/node_modules`のPlaywrightで行い、画面幅1500pxで、ライト・ダークの両方で撮る。

確認する項目:
1. 各行に「意見 / 詳細 / 削除」があり、左上の「意見」ボタンと、表の下のパネルが無い。
2. 「意見」を押すと、右側にパネルが出て、6つの列が隠れ、残る6列が見える。もう一度押すと閉じて、元に戻る。パネルに閉じるボタンが無い。
3. 別の行の「意見」を押すと、パネルが切り替わる。開いている行が、青系で、「意見」が押された状態。
4. 開閉の前後で、行の高さと一覧の高さが、同じ(測った値を報告する)。
5. 保存済み(DBの`trend.perspectives`に、直接値を入れた行)は、AIを呼ばずに表示される(ネットワークの`POST`が出ていないこと)。作成日時が出る。
6. 保存が無い行は、`POST`が1回だけ出る。キー無し・残高不足のときは、エラーの文言が出て、保存されない(DBの列が、空のまま)。成功の経路は、`POST`の応答を差し替えて確かめる。続けて2回押しても、`POST`は1回。
7. 「更新」で新しい行ができると、開いていたパネルが閉じ、`POST`は出ない(「更新」ではAIを呼ばない)。その行の「意見」を押すと、意見は空から始まり、`POST`が1回出る(応答を差し替えて確認)。
8. 開いている銘柄を削除する/グループ絞込で消すと、パネルが閉じ、一覧が折りたたまれたままにならない。
9. 画面幅800pxで、パネルが一覧の下に出る。
10. 折りたたんでいる間に、行の保存を失敗させる(バックエンドを一時的に止める等)と、エラー文が会社名の下に出る。
11. 発掘・詳細の画面に、AIの意見が出ない。ダーク/ライトの切り替えで、崩れない。
12. `CLAUDE.md`に書かれた、最低限の導線(銘柄取得、グループ作成→紐付け→絞込→削除→「すべて」、購入金額等の入力、一覧から詳細へ、テーマ切替)が、壊れていない。

確認が済んだら、`docker compose -p aidds9-smoke ... down -v`で、スモーク用のスタックを片付ける。スクリーンショットを、ユーザーに見せる。

- [x] **Step 15: 自己レビューと報告**

テスト(バックエンド・フロント・型チェック)、差分、画面の確認結果を見直す。問題があれば直す。問題が無ければ、AIDDS-11の状態を「レビュー」に変える。報告に、確認した内容、できなかった確認(本物のAIの呼び出し)、DBの作り直しが要ること、残った点を書く。

---

# 追記: AIDDS-10(種類の名称を扱う汎用マスタと、保有銘柄のトレンド名への適用)

**Goal:** (1) 種類(type)の名称を、汎用的に扱うマスタ`trend_system_type`と、その共通部品を追加する。(2) このマスタを使って、保有銘柄のトレンドの名称を取得する。`trend.daily_trend`(文字)を、数値の列`trend.type_daily_trend`に変え、一覧の取得で JOIN して、名称(`none` / `up` / `down` / `flat`)を、APIの`type_daily_trend`に返す。

**Architecture:** バックエンドは、`trend`の列を改名・型変更し、新しいテーブル`trend_system_type`と、初期値のシーダー(`python -m app.init_db`の中で実行)を足す。汎用の共通部品`trend_system_type_service.attach_names`が、行とマスタを、1回の LEFT JOIN で引き、名称を付ける。トレンドの側(`trend_type_service.attach_daily_trend_names`)は、その共通部品を、トレンドの列で呼ぶ。スキーマ`TrendOut.type_daily_trend`は、この名前を返す。フロントは、項目名を`type_daily_trend`に変え、`none`を「—」と表示する。発掘のAPI・画面は、変えない。

**Spec:** [docs/design/10-trend-type-master.md](../../design/10-trend-type-master.md)。変更する既存の記述は、同じ設計書の末尾の節にある(09・06・01の本文は、書き換えない)。

## 追記: AIDDS-10 の確認してほしい点(2026-10-06)

上の計画(Task 1〜5)の実装後に、AIDDS-10 が、AIDDS-9 の子になった。同じエピックの計画書なので、この計画書に、Task 6 として追記した。確認済みの点は、決まった内容を書いた。変えたい点があれば、教えてほしい。

1. **親エピック**(確認済み): AIDDS-10 の親は、AIDDS-9「機能改善 202610_01」に付け替えられた。エピックごとに、計画書は1本、という決まりなので、別の計画書にせず、AIDDS-9 の計画書に、Task 6 として追記した。設計書は、内容で`10-trend-type-master.md`を作った(09は、書き換えず、先頭の「追記の一覧」で、10を指す)。エピックの定義は、あとで決める。
2. **作業ブランチ**(確認済み): `feature/20261002`は、push・`develop`へのマージ・リモートの削除が、済んでいる。`feature/20261006`を、`origin/develop`から作る。
3. **種類テーブルのデータ**(確認済み): `type_column`には、列名`type_daily_trend`が入る。`type_name`と`type_value`の組(例: `up`と`1`)で、「1: up」の対応表になる。トレンドの列は、数値(SmallInteger)で、判定なしは0。API・画面は、名称(文字)。項目名は`type_daily_trend`。一致する行が無い、データが無いときは、`none`。
4. **シーダーのやり方**(確認済み): マスタのデータなので、開発・stage・運用で、**同じやり方**にする。毎回、**`TRUNCATE`して、初期データを、まとめて入れる**(bulk insert)。こうすると、どの環境でも、マスタの内容と`id`が、同じになる。「足りない行だけ入れる」やり方は、環境ごとに、マスタに差が出て、運用が複雑になるため、取らない。世代管理用の列は、あとで追加する。コンテナ起動時の`python -m app.init_db`の中で、`create_all`のあとに実行する。MySQLは`TRUNCATE TABLE`(`id`の採番も、戻る)。SQLite(テスト)は`TRUNCATE`が無いので、`DELETE`(行が空になるので、`id`は、1から振り直される)。注意: 起動のたびに全行が入れ替わる。別のインスタンスが動いている間に起動すると、入れ替えの一瞬だけ、名称が`none`になりうる(一覧は、表示される)。
5. **発掘のAPIの`daily_trend`は、変えない**(確認済み): 当面は、このままにする。あとで、仕様追加のパターンを試す可能性がある。
6. **意図的な不具合**(取り下げ): 入れない(5で、差し戻しの試験が、できる可能性があるため)。
7. **DBの作り直し**(確認済み): 列名と型が変わる。動作確認(スモークテスト)のときに、`docker compose down -v`で作り直す。
8. **設計書の追記**: 新しい設計書10を作る。09・06・01の先頭に、「追記の一覧」の節を足し、10を指す(元の本文は、書き換えない)。
9. **実機確認の進め方**: 動いているスタックを止めず、別のプロジェクト名(`aidd10-smoke`)・別のポート(DB 3317、バックエンド 8010、フロント 5183)で確認する。
10. **今回は、トレンド以外の`type_`列を、追加しない**。マスタと共通部品は、`type_`で始まる別の数値の列にも、同じ形で足せる(設計書10の「別の`type_`列を足すとき」)。

## 追記分の Global Constraints

上の Global Constraints に加えて、次を守る。

- 全テーブルに、`created_at` / `updated_at` / `deleted_at`を付ける(例外は、先に決まりを作る)。外部キー制約は、付けない
- 時刻は、`app.clock.now_jst`(日本時間)
- 保有銘柄のAPIの形は、項目名`daily_trend`→`type_daily_trend`の改名と、値の文字(`none` / `up` / `down` / `flat`)以外、変えない
- 発掘のAPI・画面は、変えない(`daily_trend`のまま)
- `get_active_trend` / `list_active_trends`の`defer(models.Trend.detail)`は、そのまま。JOIN は、`detail`を読まない
- 承認済みの設計書(01・06・09)の元の本文は、書き換えない。追記だけ
- 本物のClaude・J-Quants・yfinanceを、テストで呼ばない(既存のモックの流儀)
- マスタのシーダーは、開発・stage・運用で同じ。全行を`TRUNCATE`して、初期データを入れ直す(`id`も同じになる)。マスタの行を、DBで直しても、次の起動で、初期データに戻る(直すなら、シーダーの定義を直す)。世代管理用の列は、あとで追加する
- コミットメッセージの末尾に、次の2行を付ける: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` と `Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ`
- push・マージ・PRは、この計画に含めない

## 追記分の Review Focus

仕様が示すが、どのタスクのテストも直接は確かめていない、実際に困りやすいもの。

1. **シード前のDBでも、一覧が表示される**: 種類テーブルが空でも、`GET /trends`は200で、`type_daily_trend`は`none`。
2. **JOIN は、1回**: 銘柄ごとの追加の問い合わせ(N+1)が無い。`detail`列を読まない。共通部品は、トレンドに依存しない(別の列の種類にも、そのまま使える)。
3. **旧い名前の取りこぼし**: 保有銘柄の、API・フロント・テストに、`daily_trend`が残っていない(発掘は、残るのが正しい)。
4. **更新で新しい行ができたとき**: 数値が再計算されて保存される(古い行の値を、引き継がない)。
5. **種類テーブルの名前を変えたとき**: APIの名前が、テーブルに従う(コードの定数に、固定していない)。
6. **シーダーの再実行**: 何度実行しても、4行・`id`が1〜4に揃う(DBで直した名前も、初期値に戻る)。マスタに、別の`type_column`の行があっても、全て消えて、初期データだけになる(別の`type_`列を足すときは、その行を、シーダーの定義に足す)。
7. **発掘の画面・API**: 影響が無い。

## 追記分の実装の順番と理由

Task 6(AIDDS-10)は、Task 1〜5 のあとに実装する。Task 6 の中は、次の順に進める。

1. ブランチと設計書のコミット → 2. バックエンド(テスト → 実装) → 3. フロント(テスト → 実装) → 4. 既存の設計書に追記 → 5. 実機確認 → 6. 自己レビューと報告

バックエンドを先にするのは、フロントが、APIの項目名(`type_daily_trend`)に依存するため。

### Task 6: 種類の名称を扱う汎用マスタと、保有銘柄のトレンド名への適用 (AIDDS-10)

**Files:**
- Create: `backend/app/trend_system_type_seeder.py`、`backend/app/trend_system_type_service.py`(汎用の共通部品)、`backend/app/trend_type_service.py`(トレンドの側)
- Modify: `backend/app/models.py`、`backend/app/schemas.py`、`backend/app/trend_service.py`、`backend/app/routers/trends.py`、`backend/app/init_db.py`
- Test: `backend/tests/conftest.py`、`test_models.py`、`test_trend_service.py`、`test_trends_api.py`、新規`test_trend_system_type_seeder.py`・`test_trend_system_type_service.py`・`test_trend_type_service.py`・`test_init_db.py`
- Modify: `frontend/src/types.ts`、`frontend/src/components/TrendBadge.tsx`、`WatchlistRow.tsx`
- Test: `frontend/src/components/TrendBadge.test.tsx`、`WatchlistTable.test.tsx`
- Docs: 新規`docs/design/10-trend-type-master.md`(作成済み)、追記: `09-…`・`06-…`・`01-…`

**Interfaces:**
- Consumes: `trend_service`の`_daily_trend(detail) -> str | None`(`up` / `down` / `flat` / `None`。変えない)、`app.clock.now_jst`
- Produces:
  - `models.Trend.type_daily_trend: int`(SmallInteger、NOT NULL、既定0)
  - `models.TrendSystemType`(`id`・`type_column`・`type_name`・`type_value`・時刻3つ。`(type_column, type_value)`が一意)
  - `trend_system_type_seeder.reset(db) -> int`(全行を`TRUNCATE`して、初期データを入れる。入れた行数を返す)、定数`DAILY_TREND_COLUMN`・`SEED_ROWS`
  - 汎用: `trend_system_type_service.join_condition(type_column, value_column)`、`trend_system_type_service.attach_names(db, rows, *, model, value_column, type_column, target_attr, default) -> None`
  - トレンド: `trend_type_service.daily_trend_value(direction: str | None) -> int`、`trend_type_service.attach_daily_trend_names(db, trends) -> None`(各`trend`に、`type_daily_trend_name`を付ける。中で、汎用の`attach_names`を呼ぶ)
  - `schemas.TrendOut.type_daily_trend: str`(既定`none`。`type_daily_trend_name`から読む)
  - フロント: `Trend.type_daily_trend?: TrendDirection | "none" | null`

- [x] **Step 1: ブランチを作り、設計書と計画書をコミットする**

```bash
cd /var/www/bc.aidd-trend-compass
git fetch origin
git checkout -b feature/20261006 origin/develop
git add docs/design/10-trend-type-master.md docs/superpowers/plans/2026-10-01-AIDDS-9-feature-improvement-202610-01.md
git commit -m "docs(design): add the design doc and append the plan for the trend type master (AIDDS-10)"
```
(末尾に、Global Constraints の2行を付ける。`.superpowers/`・`.idea/`は含めない。)

- [x] **Step 2: バックエンドの失敗するテストを書く**

`backend/tests/conftest.py`: シーダーのimportを足し、2つのフィクスチャで、`create_all`のあとに、シードする。

```python
from app import market_analysis_service, models, trend_service, trend_system_type_seeder  # noqa: F401  Trendをメタデータに登録するため
```

```python
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
```

```python
    Base.metadata.create_all(engine)
    test_session_local = sessionmaker(bind=engine)
    with test_session_local() as seed_session:
        trend_system_type_seeder.reset(seed_session)
```
(`client`フィクスチャの`create_all`と`test_session_local = ...`の間に、`with`ブロックを足す。)

`backend/tests/test_trend_system_type_seeder.py`(新規):

```python
from sqlalchemy import select

from app import models, trend_system_type_seeder
from app.clock import now_jst

EXPECTED = [
    (1, "type_daily_trend", "none", 0),
    (2, "type_daily_trend", "up", 1),
    (3, "type_daily_trend", "down", 2),
    (4, "type_daily_trend", "flat", 3),
]


def _rows(db):
    stmt = select(models.TrendSystemType).order_by(models.TrendSystemType.id)
    return [(r.id, r.type_column, r.type_name, r.type_value) for r in db.execute(stmt).scalars().all()]


def test_reset_inserts_the_four_daily_trend_types_into_an_empty_table(db_session):
    db_session.query(models.TrendSystemType).delete()
    db_session.commit()

    inserted = trend_system_type_seeder.reset(db_session)

    assert inserted == 4
    assert _rows(db_session) == EXPECTED


def test_reset_fills_the_timestamp_columns(db_session):
    trend_system_type_seeder.reset(db_session)

    row = db_session.query(models.TrendSystemType).first()
    assert row.created_at is not None
    assert row.updated_at is not None
    assert row.deleted_at is None


def test_reset_deletes_every_row_and_restores_the_initial_data(db_session):
    db_session.add(models.TrendSystemType(type_column="type_other", type_name="x", type_value=1))
    db_session.query(models.TrendSystemType).filter_by(type_value=1, type_column="type_daily_trend").update(
        {"type_name": "UP"}
    )
    db_session.commit()

    trend_system_type_seeder.reset(db_session)

    assert _rows(db_session) == EXPECTED


def test_reset_gives_the_same_ids_every_time(db_session):
    trend_system_type_seeder.reset(db_session)
    first = _rows(db_session)
    trend_system_type_seeder.reset(db_session)

    assert _rows(db_session) == first == EXPECTED


def test_reset_clears_a_soft_deleted_row_too(db_session):
    db_session.query(models.TrendSystemType).filter_by(type_value=1).update({"deleted_at": now_jst()})
    db_session.commit()

    trend_system_type_seeder.reset(db_session)

    assert db_session.query(models.TrendSystemType).filter(models.TrendSystemType.deleted_at.is_not(None)).count() == 0
```

`backend/tests/test_trend_system_type_service.py`(新規。汎用の共通部品を、トレンドに限らず確かめる):

```python
from sqlalchemy import select

from app import models, trend_system_type_service
from app.clock import now_jst


def _trend(db, code, value):
    trend = models.Trend(
        code=code, opinion="x", detail={}, price_at_fetch=100.0, type_daily_trend=value
    )
    db.add(trend)
    db.commit()
    db.refresh(trend)
    return trend


def _attach(db, trends, type_column="type_daily_trend"):
    trend_system_type_service.attach_names(
        db,
        trends,
        model=models.Trend,
        value_column=models.Trend.type_daily_trend,
        type_column=type_column,
        target_attr="label",
        default="unknown",
    )


def test_attach_names_sets_the_name_from_the_master(db_session):
    trends = [_trend(db_session, "1001", 1), _trend(db_session, "1002", 3)]

    _attach(db_session, trends)

    assert [t.label for t in trends] == ["up", "flat"]


def test_attach_names_uses_the_default_when_there_is_no_row(db_session):
    trend = _trend(db_session, "1001", 9)

    _attach(db_session, [trend])

    assert trend.label == "unknown"


def test_attach_names_only_uses_the_rows_of_the_given_type_column(db_session):
    db_session.add(models.TrendSystemType(type_column="type_other", type_name="other-up", type_value=1))
    db_session.commit()
    trend = _trend(db_session, "1001", 1)

    _attach(db_session, [trend], type_column="type_other")

    assert trend.label == "other-up"


def test_attach_names_ignores_a_soft_deleted_row(db_session):
    db_session.query(models.TrendSystemType).filter_by(type_value=1).update({"deleted_at": now_jst()})
    db_session.commit()
    trend = _trend(db_session, "1001", 1)

    _attach(db_session, [trend])

    assert trend.label == "unknown"


def test_attach_names_accepts_an_empty_list(db_session):
    _attach(db_session, [])


def test_join_condition_selects_the_row_of_a_type_column_and_value(db_session):
    stmt = select(models.TrendSystemType.type_name).where(
        trend_system_type_service.join_condition("type_daily_trend", 2)
    )

    assert db_session.execute(stmt).scalars().all() == ["down"]
```

`backend/tests/test_trend_type_service.py`(新規。トレンドの側。共通部品を、トレンドの列で呼ぶことを、確かめる):

```python
from app import models, trend_type_service
from app.clock import now_jst


def _trend(db, code, value):
    trend = models.Trend(
        code=code, opinion="x", detail={}, price_at_fetch=100.0, type_daily_trend=value
    )
    db.add(trend)
    db.commit()
    db.refresh(trend)
    return trend


def test_daily_trend_value_maps_every_direction():
    assert trend_type_service.daily_trend_value("none") == 0
    assert trend_type_service.daily_trend_value("up") == 1
    assert trend_type_service.daily_trend_value("down") == 2
    assert trend_type_service.daily_trend_value("flat") == 3


def test_daily_trend_value_is_zero_without_a_judgement_or_for_an_unknown_name():
    assert trend_type_service.daily_trend_value(None) == 0
    assert trend_type_service.daily_trend_value("sideways") == 0


def test_attach_names_joins_the_master(db_session):
    trends = [_trend(db_session, "1001", 0), _trend(db_session, "1002", 1),
              _trend(db_session, "1003", 2), _trend(db_session, "1004", 3)]

    trend_type_service.attach_daily_trend_names(db_session, trends)

    assert [t.type_daily_trend_name for t in trends] == ["none", "up", "down", "flat"]


def test_attach_names_follows_the_name_in_the_master(db_session):
    db_session.query(models.TrendSystemType).filter_by(type_value=1).update({"type_name": "rise"})
    db_session.commit()
    trend = _trend(db_session, "1001", 1)

    trend_type_service.attach_daily_trend_names(db_session, [trend])

    assert trend.type_daily_trend_name == "rise"


def test_attach_names_uses_none_when_the_master_has_no_row(db_session):
    trend = _trend(db_session, "1001", 9)

    trend_type_service.attach_daily_trend_names(db_session, [trend])

    assert trend.type_daily_trend_name == "none"


def test_attach_names_uses_none_when_the_master_is_empty(db_session):
    db_session.query(models.TrendSystemType).delete()
    db_session.commit()
    trend = _trend(db_session, "1001", 1)

    trend_type_service.attach_daily_trend_names(db_session, [trend])

    assert trend.type_daily_trend_name == "none"


def test_attach_names_ignores_a_soft_deleted_master_row(db_session):
    db_session.query(models.TrendSystemType).filter_by(type_value=1).update({"deleted_at": now_jst()})
    db_session.commit()
    trend = _trend(db_session, "1001", 1)

    trend_type_service.attach_daily_trend_names(db_session, [trend])

    assert trend.type_daily_trend_name == "none"


def test_attach_names_accepts_an_empty_list(db_session):
    trend_type_service.attach_daily_trend_names(db_session, [])
```

`backend/tests/test_init_db.py`(新規):

```python
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import init_db, models


def test_main_creates_the_tables_and_resets_the_master(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(init_db, "engine", engine)
    monkeypatch.setattr(init_db, "SessionLocal", factory)

    init_db.main()
    with factory() as db:
        db.query(models.TrendSystemType).filter_by(type_value=1).update({"type_name": "UP"})
        db.commit()
    init_db.main()

    with factory() as db:
        rows = db.execute(
            select(models.TrendSystemType.id, models.TrendSystemType.type_name).order_by(models.TrendSystemType.id)
        ).all()
    assert [tuple(row) for row in rows] == [(1, "none"), (2, "up"), (3, "down"), (4, "flat")]
```

`backend/tests/test_models.py`に追加(ファイル末尾。`pytest`・`IntegrityError`・`models`は、すでにimport済み):

```python
def test_trend_type_daily_trend_defaults_to_zero(db_session):
    trend = models.Trend(code="7203", opinion="x", detail={}, price_at_fetch=1.0)
    db_session.add(trend)
    db_session.commit()
    db_session.refresh(trend)

    assert trend.type_daily_trend == 0


def test_trend_system_type_column_and_value_are_unique(db_session):
    db_session.add(models.TrendSystemType(type_column="type_daily_trend", type_name="dup", type_value=1))

    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_trend_system_type_has_the_timestamp_columns(db_session):
    row = db_session.query(models.TrendSystemType).first()

    assert row.created_at is not None
    assert row.updated_at is not None
    assert row.deleted_at is None
```

`backend/tests/test_trend_service.py`: 既存の4つのテストを、次のように直す(アサーションを緩めない。意味は、そのまま、数値に置き換える)。

- `test_create_trend_stores_the_daily_trend`: `assert trend.daily_trend == "up"` → `assert trend.type_daily_trend == 1`
- `…leaves_daily_trend_empty_when_fewer_than_26_days`・`…when_history_is_unavailable`: `assert trend.daily_trend is None` → `assert trend.type_daily_trend == 0`(テスト名の`empty`は、`zero`に直す)
- `test_refresh_recomputes_the_daily_trend`: `assert updated[0].daily_trend == "down"` → `assert updated[0].type_daily_trend == 2`

さらに、同じファイルに追加:

```python
def test_create_trend_attaches_the_trend_name(db_session, monkeypatch):
    _patch_fetch(monkeypatch, _daily_raw_candles([100.0 + i for i in range(40)]))

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.type_daily_trend_name == "up"


def test_list_watchlist_attaches_the_trend_name_from_the_master(db_session, monkeypatch):
    _patch_fetch(monkeypatch, _daily_raw_candles([100.0 + i for i in range(40)]))
    trend_service.create_trend(db_session, "7203")

    listed = trend_service.list_watchlist(db_session)

    assert listed[0].type_daily_trend_name == "up"


def test_list_watchlist_names_a_trend_without_a_judgement_none(db_session, monkeypatch):
    _patch_fetch(monkeypatch, [])
    trend_service.create_trend(db_session, "7203")

    listed = trend_service.list_watchlist(db_session)

    assert listed[0].type_daily_trend == 0
    assert listed[0].type_daily_trend_name == "none"


def test_refresh_attaches_the_trend_name(db_session, monkeypatch):
    _patch_fetch(monkeypatch, _daily_raw_candles([100.0 + i for i in range(40)]))
    original = trend_service.create_trend(db_session, "7203")
    original.created_at = now_jst() - timedelta(minutes=10)
    db_session.commit()
    falling = list(reversed([100.0 + i for i in range(40)]))
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: _daily_raw_candles(falling))

    updated = trend_service.refresh_trends(db_session, ["7203"], 5)

    assert updated[0].type_daily_trend_name == "down"
```

`backend/tests/test_trends_api.py`: 既存の2つのテストを、次に置き換え、追加する。

```python
def test_list_trends_includes_the_daily_trend_name(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends")

    assert response.status_code == 200
    assert response.json()[0]["type_daily_trend"] == "up"
    assert "daily_trend" not in response.json()[0]


def test_list_trends_returns_none_for_rows_without_a_judgement(client, monkeypatch):
    _patch_fetch(monkeypatch, [])
    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends")

    assert response.json()[0]["type_daily_trend"] == "none"


def test_list_trends_still_works_when_the_master_is_empty(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    client.post("/trends", json={"code": "7203"})
    session = client.session_local()
    try:
        session.query(models.TrendSystemType).delete()
        session.commit()
    finally:
        session.close()

    response = client.get("/trends")

    assert response.status_code == 200
    assert response.json()[0]["type_daily_trend"] == "none"


def test_add_trend_response_includes_the_daily_trend_name(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())

    response = client.post("/trends", json={"code": "7203"})

    assert response.status_code == 201
    assert response.json()["type_daily_trend"] == "up"


def test_trend_detail_includes_the_daily_trend_name(client, monkeypatch):
    _patch_fetch(monkeypatch, _rising_raw_candles())
    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends/7203")

    assert response.status_code == 200
    assert response.json()["type_daily_trend"] == "up"
```
(`GET /trends/7203`が、このデータで、200にならないときは、既存の詳細APIのテスト(`test_get_trend_detail_*`)の呼び方に合わせる。アサーションは、緩めない。)

- [x] **Step 3: テストを実行して、失敗を確認する**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: 新しいテストと、直したテストが、`type_daily_trend`・`TrendSystemType`が無い等で FAIL(import エラーを含む)。

- [x] **Step 4: バックエンドを実装する**

`backend/app/models.py`: importを直し、`Trend`の列を変え、`TrendSystemType`を足す(`TrendSystem`クラスの次)。

```python
from sqlalchemy import BigInteger, DateTime, Integer, JSON, Numeric, SmallInteger, String, UniqueConstraint
```

```python
# Trend の中の、daily_trend の行を、次に置き換える
    type_daily_trend: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
```

```python
class TrendSystemType(Base):
    __tablename__ = "trend_system_type"
    __table_args__ = (
        UniqueConstraint("type_column", "type_value", name="uq_trend_system_type_column_value"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    type_column: Mapped[str] = mapped_column(String(100), nullable=False)
    type_name: Mapped[str] = mapped_column(String(100), nullable=False)
    type_value: Mapped[int] = mapped_column(Integer, nullable=False)
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

`backend/app/trend_system_type_seeder.py`(新規):

```python
"""trend_system_type の初期データを入れるシーダー。

開発・stage・運用で、同じやり方。全行を TRUNCATE して、初期データを、まとめて入れる。
どの環境でも、マスタの内容と id が、同じになる。
"""

from sqlalchemy import delete, insert, text
from sqlalchemy.orm import Session

from . import models

DAILY_TREND_COLUMN = "type_daily_trend"

# (type_column, type_name, type_value)
SEED_ROWS = [
    (DAILY_TREND_COLUMN, "none", 0),
    (DAILY_TREND_COLUMN, "up", 1),
    (DAILY_TREND_COLUMN, "down", 2),
    (DAILY_TREND_COLUMN, "flat", 3),
]


def reset(db: Session) -> int:
    """全行を TRUNCATE して、初期データを、まとめて入れる。入れた行数を返す。"""
    table = models.TrendSystemType.__tablename__
    if db.get_bind().dialect.name == "mysql":
        db.execute(text(f"TRUNCATE TABLE {table}"))  # id の採番も、1に戻る
    else:
        db.execute(delete(models.TrendSystemType))  # SQLite(テスト)。空になるので、id は1から
    db.execute(
        insert(models.TrendSystemType),
        [
            {"type_column": column, "type_name": name, "type_value": value}
            for column, name, value in SEED_ROWS
        ],
    )
    db.commit()
    return len(SEED_ROWS)
```

`backend/app/trend_system_type_service.py`(新規。汎用。トレンドを、知らない):

```python
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from . import models


def join_condition(type_column: str, value_column):
    """マスタを、type_column の種類として、数値の列(value_column)に結ぶ JOIN 条件。
    削除済みの行は、結ばない。"""
    return and_(
        models.TrendSystemType.type_column == type_column,
        models.TrendSystemType.type_value == value_column,
        models.TrendSystemType.deleted_at.is_(None),
    )


def attach_names(
    db: Session,
    rows: list,
    *,
    model,
    value_column,
    type_column: str,
    target_attr: str,
    default: str,
) -> None:
    """model の行と、マスタを LEFT JOIN で引き(1回の問い合わせ)、名称(type_name)を、
    各行の target_attr に付ける。一致する行が無いときは default。
    選ぶのは、行の id と type_name だけ(重い列は読まない)。"""
    ids = [row.id for row in rows if row.id is not None]
    names: dict[int, str] = {}
    if ids:
        stmt = (
            select(model.id, models.TrendSystemType.type_name)
            .select_from(model)
            .outerjoin(models.TrendSystemType, join_condition(type_column, value_column))
            .where(model.id.in_(ids))
        )
        names = {row.id: row.type_name for row in db.execute(stmt)}
    for row in rows:
        setattr(row, target_attr, names.get(row.id) or default)
```

`backend/app/trend_type_service.py`(新規。トレンドの側):

```python
from sqlalchemy.orm import Session

from . import models, trend_system_type_service
from .trend_system_type_seeder import DAILY_TREND_COLUMN, SEED_ROWS

NONE_NAME = "none"
NONE_VALUE = 0

_VALUE_BY_NAME = {
    name: value for column, name, value in SEED_ROWS if column == DAILY_TREND_COLUMN
}


def daily_trend_value(direction: str | None) -> int:
    """判定結果(up / down / flat / None)を、type_daily_trend の数値にする。
    判定なし(None)と、想定外の名前は、0(none)。"""
    if direction is None:
        return NONE_VALUE
    return _VALUE_BY_NAME.get(direction, NONE_VALUE)


def attach_daily_trend_names(db: Session, trends: list[models.Trend]) -> None:
    """各 trend に、type_daily_trend_name(none / up / down / flat など)を付ける。
    汎用の共通部品を、トレンドの列で呼ぶ。一致する行が無いときは none。"""
    trend_system_type_service.attach_names(
        db,
        trends,
        model=models.Trend,
        value_column=models.Trend.type_daily_trend,
        type_column=DAILY_TREND_COLUMN,
        target_attr="type_daily_trend_name",
        default=NONE_NAME,
    )
```

`backend/app/trend_service.py`:
- import: `from . import trend_code_name_service, trend_direction, trend_price_service, trend_type_service`
- `create_trend`と`refresh_trends`の`models.Trend(...)`の`daily_trend=_daily_trend(...)`を、`type_daily_trend=trend_type_service.daily_trend_value(_daily_trend(...))`に変える(`detail` / `stored_detail`の引数は、そのまま)
- `create_trend`: `_attach_price_fields(trend, price)`のあと、`return`の前に、`trend_type_service.attach_daily_trend_names(db, [trend])`
- `list_watchlist`: `for`ループのあと、`return trends`の前に、`trend_type_service.attach_daily_trend_names(db, trends)`
- `update_name`: `_attach_price_fields(trend, price)`のあと、`return`の前に、`trend_type_service.attach_daily_trend_names(db, [trend])`
- `refresh_trends`: 最後の`for trend in updated: _attach_name(trend, names)`のあと、`return updated`の前に、`trend_type_service.attach_daily_trend_names(db, updated)`

`backend/app/schemas.py`:

```python
class TrendOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    code: str
    name: str
    opinion: str
    price_at_fetch: float
    created_at: datetime
    trend_group_id: int | None = None
    buy_category: int = 0
    buy_price: float | None = None
    buy_quantity: int | None = None
    type_daily_trend: str = Field(default="none", validation_alias="type_daily_trend_name")
    perspectives: PerspectivesOut | None = None
```
(`ScreeningResultItemOut.daily_trend`は、変えない。)

`backend/app/routers/trends.py`: `get_trend_detail`で、名前を付けて、`TrendDetailOut`に渡す。

```python
    trend_type_service.attach_daily_trend_names(db, [trend])
    names = trend_code_name_service.get_names(db, [trend.code])
    return TrendDetailOut(
        id=trend.id,
        code=trend.code,
        name=names.get(trend.code, ""),
        opinion=trend.opinion,
        price_at_fetch=trend.price_at_fetch,
        created_at=trend.created_at,
        type_daily_trend=trend.type_daily_trend_name,
        detail=detail,
    )
```
(importに`trend_type_service`を足す: `from .. import trend_code_name_service, trend_service, trend_type_service`。)

`backend/app/init_db.py`:

```python
from . import models  # noqa: F401  Trendをメタデータに登録するため
from . import trend_system_type_seeder
from .db import Base, SessionLocal, engine


def main():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        trend_system_type_seeder.reset(db)


if __name__ == "__main__":
    main()
```

- [x] **Step 5: バックエンドの全テストを実行する**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: すべて PASS(ベースラインは339件。増えた分だけ増える)。他のテスト(発掘など)が、`daily_trend`の変更で、壊れたら、保有銘柄の側の名前だけを直す。発掘のテストは、変えない。アサーションを緩めて通さない。

追加で確認: `grep -rn "daily_trend" backend/app | grep -v "trend_candidate_result_service\|schemas.py"`の結果に、保有銘柄の`daily_trend`(列・属性)が残っていないこと(`schemas.py`は、発掘の`ScreeningResultItemOut`だけ)。

- [x] **Step 6: バックエンドをコミットする**

```bash
git add backend/app backend/tests
git commit -m "feat(trend): manage the trend type with a master table and join it on read (AIDDS-10)"
```
(末尾に、Global Constraints の2行を付ける。)

- [x] **Step 7: フロントの失敗するテストを書く**

`frontend/src/components/TrendBadge.test.tsx`: `describe("TrendBadge", ...)`の中に追加し、`trendRowClass`のテストに`none`を足す。

```tsx
  it("shows a dash for none", () => {
    render(<TrendBadge value="none" />);

    expect(screen.getByText("—")).toHaveClass("trend-badge", "trend-unknown");
  });
```
`trendRowClass`のテストの`expect(trendRowClass("flat")).toBeUndefined();`の次に、`expect(trendRowClass("none")).toBeUndefined();`を足す。(`TREND_LABELS`のテストは、変えない。`none`は、ラベルに入れない。)

`frontend/src/components/WatchlistTable.test.tsx`: 保有銘柄の`daily_trend`を、すべて`type_daily_trend`に置き換える。1つ目のテストの、3行目(`daily_trend: null`)は、`type_daily_trend: "none"`にし、4行目として、`null`の行(古いデータの互換)を足して、バッジの期待を`["上昇", "下降", "—", "—"]`にする。

```tsx
    renderTable({
      watchlist: [
        { ...trends[0], type_daily_trend: "up" },
        { ...trends[1], type_daily_trend: "down" },
        { ...trends[1], id: 3, code: "9984", type_daily_trend: "none" },
        { ...trends[1], id: 4, code: "8306", type_daily_trend: null },
      ],
    });
```
(2つ目のテストの`daily_trend: "up"` / `"down"` / `"flat"`も、`type_daily_trend`に置き換える。`flat`の行と、未設定の行が、色なし、の期待は、そのまま。)

- [x] **Step 8: フロントのテストを実行して、失敗を確認する**

Run: `cd frontend && npx vitest run src/components/TrendBadge.test.tsx src/components/WatchlistTable.test.tsx && npx tsc --noEmit`
Expected: `none`のテストと、`type_daily_trend`のテストが FAIL、型エラーも出る。

- [x] **Step 9: フロントを実装する**

`frontend/src/types.ts`:
- 1行目の下に、`export type TrendName = TrendDirection | "none";`を足す
- `Trend`(14行目)の`daily_trend?: TrendDirection | null;`を、`type_daily_trend?: TrendName | null;`に変える
- `ScreeningResultItem`(133行目)の`daily_trend`は、変えない

`frontend/src/components/TrendBadge.tsx`:

```tsx
import type { TrendDirection, TrendName } from "../types";

export const TREND_LABELS: Record<TrendDirection, string> = {
  up: "上昇",
  down: "下降",
  flat: "横ばい",
};

type TrendValue = TrendName | null | undefined;

export function trendRowClass(value: TrendValue): string | undefined {
  if (value === "up") return "row-trend-up";
  if (value === "down") return "row-trend-down";
  return undefined;
}

export function TrendBadge({ value }: { value: TrendValue }) {
  if (!value || value === "none") {
    return <span className="trend-badge trend-unknown">—</span>;
  }
  return <span className={`trend-badge trend-${value}`}>{TREND_LABELS[value]}</span>;
}
```

`frontend/src/components/WatchlistRow.tsx`: `trend.daily_trend`(2か所。126行目と204行目あたり)を、`trend.type_daily_trend`に変える。

- [x] **Step 10: フロントのテスト・型チェックを実行する**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: すべて PASS、型エラーなし(ベースラインは266件)。`grep -rn "daily_trend" frontend/src | grep -v "type_daily_trend"`の結果は、発掘(`ScreeningResultsPanel`・`ScreeningResultItem`)だけ。

- [x] **Step 11: フロントをコミットする**

```bash
git add frontend/src
git commit -m "feat(frontend): read the trend from type_daily_trend and show none as a dash (AIDDS-10)"
```
(末尾に、Global Constraints の2行を付ける。)

- [x] **Step 12: 既存の設計書に追記する**(元の本文は、書き換えない)

`docs/design/09-trend-direction-and-market-colors.md`・`06-position-grouping.md`・`01-watchlist-foundation.md`の、1行目の見出しの直後に、次の節を足す(3つとも、同じ内容。すでに「追記の一覧」の節がある場合は、その節に、1行足す)。

```markdown
## 追記の一覧

元の本文は、合意済みなので、書き換えない。追記が、あとの合意として、有効になる。

- AIDDS-10(2026-10-06): 保有銘柄のトレンドは、列`type_daily_trend`(数値。判定なしは0)になり、APIの項目名も`type_daily_trend`(文字)になる。本文の`daily_trend`(保有銘柄)は、この追記が有効。詳細は[10-trend-type-master.md](10-trend-type-master.md)
```

```bash
git add docs/design
git commit -m "docs(design): add the AIDDS-10 addition list to the trend related design docs"
```
(末尾に、Global Constraints の2行を付ける。)

- [x] **Step 13: 実機スモークテスト**(`CLAUDE.md`の必須の確認。動いているスタックは止めない)

準備: 別のプロジェクト名`aidd10-smoke`で、ポートを上書きする compose ファイル(スクラッチパッドに作る)を使う。

```yaml
services:
  db:
    ports: !override ["3317:3306"]
  backend:
    ports: !override ["8010:8000"]
  frontend:
    ports: !override ["5183:5173"]
    environment:
      VITE_API_BASE_URL: http://localhost:8010
```
`docker compose -p aidd10-smoke -f docker-compose.yml -f <上書きファイル> up -d --build`(DBは新しい。`down -v`で作り直した状態から)。確認は、`frontend/node_modules`のPlaywrightで行い、幅1500pxで、ライト・ダークの両方。

確認する項目:
1. 起動しただけで、`trend_system_type`に4行(none/up/down/flat、`id`は1〜4)が入っている(`docker compose -p aidd10-smoke … exec -T db mysql -utrend -ptrend trend_compass -e "select id,type_column,type_name,type_value from trend_system_type order by id"`)。バックエンドを再起動しても、同じ4行・`id`1〜4のまま(`TRUNCATE`で採番が戻る)。DBで`up`の名前を直してから、再起動すると、初期値に戻る。
2. 銘柄を、実際の取得(`POST /trends`)で数件入れる。`GET /trends`の`type_daily_trend`が、`none`・`up`・`down`・`flat`のどれか。DBの`trend.type_daily_trend`は、数値(`select code,type_daily_trend from trend`)。
3. 画面の「トレンド」列が、上昇・下降・横ばい・「—」で、行の色が、これまでと同じ(上昇=赤、下降=緑、横ばい・「—」=色なし)。ライト・ダークとも。
4. 種類テーブルの行を、DBで消す(`delete from trend_system_type`)と、一覧は表示され、トレンドは「—」。戻す(バックエンドを再起動してシードされる)と、元に戻る。
5. 種類テーブルの`up`の名前を、DBで`rise`に変えると、APIの値が`rise`になる(画面は、未知の値で、「—」にならず、クラッシュしないことを見る)。確認後、元に戻す。
6. 「更新」で、新しい行ができたとき、`type_daily_trend`が、新しい行に、保存されている。
7. 「意見」ボタンと、右側のパネルが、これまでどおり動く。発掘の画面が、開ける(J-Quants のキーが無いので、スキャンは、確認しない)。
8. `CLAUDE.md`の、最低限の導線(銘柄取得、グループ作成→紐付け→絞込→削除→「すべて」、購入金額等の入力、一覧から詳細へ、テーマ切替)が、壊れていない。

確認が済んだら、`docker compose -p aidd10-smoke … down -v`で、スモーク用のスタックを片付ける。スクリーンショットを、ユーザーに見せる。

- [x] **Step 14: 自己レビューと報告**

テスト(バックエンド・フロント・型チェック)、差分、画面の確認結果を見直す。問題があれば直す。問題が無ければ、AIDDS-10 の状態を「レビュー」に変える。報告に、確認した内容、できなかった確認(発掘の実スキャン、本物のClaude)、DBの作り直しが要ること、残った点を書く。

#### 差し戻し対応 1(AIDDS-10。2026-10-07。仕様漏れ)

コメント: 「仕様漏れ: フロントは、API から送られてきた表示文字列(`type_daily_trend`)を、そのまま表示する。フロント側の対応表(上昇・下降・横ばい)は、廃止する。」補足(あなたの回答): `none`は、`none`と表示する。発掘は、別のタスクにする(当面は、いまの表示のまま)。仕様は、設計書10の末尾の追記を参照(ここには、書かない)。

**Files:**
- Modify: `frontend/src/components/TrendBadge.tsx`、`frontend/src/components/ScreeningResultsPanel.tsx`、`frontend/src/index.css`
- Create: `frontend/src/components/screeningTrendLabels.ts`
- Test: `frontend/src/components/TrendBadge.test.tsx`、`WatchlistTable.test.tsx`

- [x] **Step R1-1: 設計書に追記する**(済み。設計書10の末尾の節と、先頭の「追記の一覧」。09・06の「追記の一覧」に1行。元の本文は、書き換えない)

- [x] **Step R1-2: 失敗するテストを書く**

`frontend/src/components/TrendBadge.test.tsx`: `TrendBadge`の`describe`を、次に置き換える(`trendRowClass`の`describe`は、そのまま。importから`TREND_LABELS`を外す)。

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as trendBadge from "./TrendBadge";
import { TrendBadge, trendRowClass } from "./TrendBadge";

describe("TrendBadge", () => {
  it("shows the received string as it is, with the class of the value", () => {
    for (const value of ["up", "down", "flat", "none"] as const) {
      const { unmount } = render(<TrendBadge value={value} />);

      expect(screen.getByText(value)).toHaveClass("trend-badge", `trend-${value}`);
      unmount();
    }
  });

  it("shows a dash only when there is no value", () => {
    const { unmount } = render(<TrendBadge value={null} />);
    expect(screen.getByText("—")).toHaveClass("trend-badge", "trend-unknown");
    unmount();

    render(<TrendBadge value={undefined} />);
    expect(screen.getByText("—")).toHaveClass("trend-unknown");
  });

  it("shows the given label instead of the value (used by the screening list)", () => {
    render(<TrendBadge value="up" label="上昇" />);

    expect(screen.getByText("上昇")).toHaveClass("trend-badge", "trend-up");
  });

  it("no longer exports a table that maps the names to Japanese", () => {
    expect(trendBadge).not.toHaveProperty("TREND_LABELS");
  });
});
```
`trendRowClass`の`describe`は、`"none"`の確認(`toBeUndefined()`)を含むまま、変えない。

`frontend/src/components/WatchlistTable.test.tsx`: 1つ目のテスト(`adds a トレンド column header …`)のバッジの期待を、`["up", "down", "none", "—"]`に変える(行は、`up`・`down`・`none`・`null`の4行のまま)。`ScreeningResultsPanel.test.tsx`は、変えない(発掘は、日本語の表示のまま。このテストが、通り続けることが、確認)。

- [x] **Step R1-3: テストを実行して、失敗を確認する**

Run: `cd frontend && npx vitest run src/components/TrendBadge.test.tsx src/components/WatchlistTable.test.tsx`
Expected: 新しいテストが FAIL。

- [x] **Step R1-4: 実装する**

`frontend/src/components/screeningTrendLabels.ts`(新規):

```ts
// 発掘の一覧の表示用。発掘の API(daily_trend)は、名称(up / down / flat)を返すので、日本語に直す。
// 別のタスクで、API の文字列を、そのまま表示する形に、そろえる(そのときに、このファイルは、なくなる)。
export const SCREENING_TREND_LABELS: Record<string, string> = {
  up: "上昇",
  down: "下降",
  flat: "横ばい",
};
```

`frontend/src/components/TrendBadge.tsx`:

```tsx
import type { TrendName } from "../types";

type TrendValue = TrendName | null | undefined;

export function trendRowClass(value: TrendValue): string | undefined {
  if (value === "up") return "row-trend-up";
  if (value === "down") return "row-trend-down";
  return undefined;
}

// value(API が返す文字列)を、そのまま表示する。label を渡したときだけ、その文字を表示する。
// 値が無いとき(null・未設定)は「—」。
export function TrendBadge({ value, label }: { value: TrendValue; label?: string }) {
  if (!value) {
    return <span className="trend-badge trend-unknown">—</span>;
  }
  return <span className={`trend-badge trend-${value}`}>{label ?? value}</span>;
}
```

`frontend/src/components/ScreeningResultsPanel.tsx`: importに`SCREENING_TREND_LABELS`を足し、`<TrendBadge value={item.daily_trend} />`を、`<TrendBadge value={item.daily_trend} label={item.daily_trend ? SCREENING_TREND_LABELS[item.daily_trend] : undefined} />`に変える(表示は、これまでと同じ)。

`frontend/src/index.css`: `.trend-flat,\n.trend-unknown {`の選択子に、`.trend-none`を足す(`none`も、薄い色)。

- [x] **Step R1-5: テスト・型チェックを実行する**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: すべて PASS(ベースラインは267件。増減は、書き直した分)、型エラーなし。`grep -rn "TREND_LABELS" frontend/src`の結果が、空。

- [x] **Step R1-6: コミットする**

```bash
git add frontend/src docs/design
git commit -m "fix(frontend): show the trend string sent by the API as it is on the watchlist (AIDDS-10)"
```
(末尾に、Global Constraints の2行を付ける。`docs/superpowers/plans/`の変更は、含めない。)

- [x] **Step R1-7: 実機確認**(別ポートのスタック。`aidd10-smoke`)

保有一覧のトレンド列が、`up` / `down` / `flat` / `none`を、そのまま表示し(DBの値を、1・2・3・0に直して確認)、行の色(`up`=赤、`down`=緑)が、そのまま。発掘の画面が、開け、`ScreeningResultsPanel`の日本語の表示が、変わっていない。ライト・ダークとも。

- [x] **Step R1-8: 自己レビューと遷移**

テスト・型チェック・差分・画面を見直し、問題が無ければ、AIDDS-10 を「レビュー」に変える。


## 追記: AIDDS-17・AIDDS-18 の確認してほしい点(2026-10-07)

上の計画(Task 1〜6)の実装後に、AIDDS-17・AIDDS-18 が、AIDDS-9 の子になった。エピックごとに、計画書は1本なので、別の計画書にせず、この計画書に、Task 7(AIDDS-17)・Task 8(AIDDS-18)として追記した。確認済みの点は、決まった内容を書いた。変えたい点があれば、教えてほしい。

1. **親エピックと設計書**(確認済み): 親は AIDDS-9。エピックは、グルーピング(作業の単位)として扱う。設計書は、新しく作らず、仕様の本体がある `docs/design/09-trend-direction-and-market-colors.md` の末尾に、本文を追記した。`07-screening.md` と `10-trend-type-master.md` には、本文の置き場を指す短い節と、先頭の「追記の一覧」の行を足した(07 は、「追記の一覧」を、新しく足した)。元の本文は、書き換えていない。画像は `docs/images/AIDDS-17-89.png`、`AIDDS-18-trend-note-C2.png`。これらは、計画書より先に作り、まだコミットしていない(Task 7 の最初の手順で、計画書と一緒にコミットする)。
2. **実装の順番**: Task 7(AIDDS-17)→ Task 8(AIDDS-18)。理由は、下の「実装の順番と理由」。
3. **発掘のトレンドの表示**(確認済み): 種類マスタの名前(`up` / `down` / `flat` / `none`)を、そのまま表示する。日本語には、変えない。APIの項目名は `type_daily_trend`(保有一覧と同じ)。発掘のトレンドは、保存しない(DBに列を足さない)。表示のときに、日足から判定し、数値に直し、マスタと結んで、名前を付ける。
4. **`none` の扱い**(確認済み): 判定できないとき(日足が26本未満)も、`ma_trend` を条件にして判定が「上昇」でないときも、APIは `none` を返す(従来の `null` でない)。発掘画面では、`none` の銘柄を、一覧から除く(行ごと)。ただし、シグナルの条件を1つも選んでいないときは、全銘柄が対象なので、除かず、`none` と表示する。この制御は、フロントで行う。
5. **ページ分け**(確認済み): サーバーは、ページに分けず、条件に合う全件を返す。フロントが、`none` を除き、1ページ20件で分ける(全体50件のうち `none` が20件なら、1ページ目20件、2ページ目10件)。
6. **行の色**(確認済み): 変えない(上昇=赤っぽい、下降=緑っぽい。SBI証券のアプリの色)。
7. **注記**(確認済み、AIDDS-18): 案C(列見出しの下に、小さな添え書き)。発掘=「J-Quants 日足」「60営業日」、一覧=「5分足を日足に」「更新時の値」。吹き出しは、採らない。見出しは、3行以内。列幅は、原則として変えず、添え書きのためにだけ、広げてよい。意見のパネルを開いて列を折りたたんだとき(一覧)は、出さない。ライト・ダークで読める色にする。ヘルプモードは、今回の範囲外。
8. **私が選んだ既定(確認してほしい)**:
   1. **件数の表示**: 「該当{N}件」と、ページ数は、`none` を除いたあとの件数で数える。APIの `total` は、返した件数(除く前)で、画面には、使わない。
   2. **すべて除かれたとき**: 条件ありで、`none` 以外が1件も無いときは、特別な文言を出さず、「該当0件」と、空の表を出す(「取得後は…」のヒントは、APIの `total` が0のときだけ。従来どおり)。
   3. **全件を返す費用**: 条件なしで検索すると、全候補(設計書では約1600。今の `JQUANTS_MAX_STOCKS` の既定は10)のトレンドを、1回の取得で計算する。実際の費用は、測っていない。Task 7 の実機確認で、候補を1000件入れて、応答時間を測り、報告する。遅いときは、止めて、相談する。
   4. **`page` / `page_size` のクエリ**: APIから、引数を外す。古い呼び出しが、付けて送っても、無視される(エラーにならない)。フロントは、送らない。
   5. **発掘の日本語の対応表**: `screeningTrendLabels.ts` と、`TrendBadge` の `label` 引数を、削除する(使う所が、無くなるため)。
   6. **折りたたみ時の添え書き(一覧)**: 意見のパネルを開いている間は、添え書きを、描画しない(幅が1100px以下で、副次の列が、再び出るときも、出さない)。
   7. **発掘の「トレンド」列の幅**: 今は80px(設計書 07)。添え書きが、折り返さず、列の外へはみ出さない最小の幅(10px 単位で切り上げ。目安 112px)に広げる。ほかの列は、変えない。
   9. **実機確認の進め方**: 動いているスタックを止めず、別のプロジェクト名(`aidd17-smoke`)・別のポート(DB 3317、バックエンド 8010、フロント 5183)で確認する。DBは新しく作り、発掘の候補は、DBに直接入れる(J-Quants のキーが無いため、実スキャンは確認しない)。DBの構造は、変わらない(列を足さない)ので、あなたのスタックの作り直しは、要らない。

## 追記分の Global Constraints

上の Global Constraints に加えて、次を守る。

- 発掘のトレンドは、DBに保存しない。列も、テーブルも、足さない
- 発掘のAPI(`GET /screening/results/{condition_id}`)の項目名は、`type_daily_trend`(`none` / `up` / `down` / `flat`)。`daily_trend` は、残さない。ページ分け(`page`・`page_size`)も、残さない
- マスタの名前は、DBから引く(コードの定数に、固定しない)。マスタに行が無いときは、`none`
- 保有銘柄のAPI・画面の表示は、変えない(Task 6 のまま)。保有一覧への変更は、Task 8 の、見出しの添え書きだけ
- 行の色(`row-trend-up` / `row-trend-down`)と、トレンドの色(`trend-up` など)は、変えない
- 承認済みの設計書(07・09・10)の元の本文は、書き換えない。追記だけ(設計書は、計画書より先に、追記済み)
- 本物のClaude・J-Quants・yfinanceを、テストで呼ばない(既存のモックの流儀)
- コミットメッセージの末尾に、次の2行を付ける: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` と `Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ`
- 作業ブランチは `feature/20261007`(`develop` から作成済み)。push・マージ・PRは、この計画に含めない

## 追記分の Review Focus

仕様が示すが、どのタスクのテストも直接は確かめていない、実際に困りやすいもの。

1. **条件なしのとき**: シグナルを1つも選ばずに検索すると、`none` の銘柄も、一覧に出て、`none` と表示される(除かれない)。→ Task 7 のテスト。
2. **ページを埋める**: `none` を除いたあと、1ページ目が20件、2ページ目が残り(50件のうち20件が `none` なら、20件と10件)。→ Task 7 のテスト。
3. **すべて `none`**: 条件ありで、全件が `none` のとき、画面が壊れず、「該当0件」の空の表になる。ページ番号は1ページだけ。→ Task 7 のテスト。
4. **検索のやり直し**: 別の条件や、再検索のあと、ページが1ページ目に戻る。選択中の銘柄(チェック)は、従来どおり、検索で初期化される。→ Task 7 のテスト。
5. **マスタが空・名前の変更**: マスタが空でも、APIは200で、全件が `none`。マスタの名前を変えると、APIの値が、その名前に従う。→ Task 7 のテスト。
6. **旧い名前の取りこぼし**: 発掘の、API・フロント・テストに、`daily_trend`(保有一覧の `type_daily_trend` でないもの)、`SCREENING_TREND_LABELS`、`page_size` が、残っていない。→ Task 7 の確認。
7. **添え書きで、既存の表示が変わらない**: 列の並び、トレンドの文字・色、行の色、行の高さ(保有一覧の固定の高さ)。→ Task 8 のテストと実機の目視。
8. **ダーク・ライトの両方で、添え書きが読める**: 文字色と背景の、コントラスト比が、4.5以上。→ Task 8 の実機確認。

## 追記分の実装の順番と理由

Task 7(AIDDS-17)を先に、Task 8(AIDDS-18)を後に、実装する。

1. **Task 7(AIDDS-17)**: 発掘のAPIと画面の、表示と取得の仕組みを変える。バックエンドが先、フロントが後(フロントが、APIの項目名 `type_daily_trend` に依存するため)。
2. **Task 8(AIDDS-18)**: 見出しの添え書きを足す。画面のマークアップと、CSSだけで、バックエンドは触らない。Task 7 の後にするのは、次の2つの理由。
   - 同じ `ScreeningResultsPanel.tsx` の表の見出しを、どちらも触る。同時に進めると、衝突する。
   - 添え書きの列幅を、実際の表示の値(`up` / `down` / `flat` / `none`)で、実測したい。日本語の値のまま測ると、後で測り直しになる。

順番を入れ替えたら困る点:
- Task 8 を先にすると、列幅の実測が、日本語の値(旧い表示)で行われ、Task 7 の後に、測り直す二度手間になる。
- Task 7 のバックエンドの前に、フロントを変えると、APIの項目名が合わず、画面が壊れる。

### Task 7: 発掘の一覧のトレンドを、種類マスタの名前(`up` など)で表示し、`none` を除いて、フロントでページ分けする (AIDDS-17)

**Files:**
- Modify: `backend/app/trend_system_type_service.py`(マスタの対応を引く関数を足す)
- Modify: `backend/app/trend_type_service.py`(トレンド用の包み。名前を付ける関数を足す)
- Modify: `backend/app/trend_candidate_result_service.py`(`get_cached_results` を、全件を返す形に)
- Modify: `backend/app/schemas.py`(`ScreeningResultItemOut`・`ScreeningResultsOut`)
- Modify: `backend/app/routers/screening.py`(`get_results` からページの引数を外す)
- Modify: `backend/tests/test_trend_candidate_result_service.py`、`backend/tests/test_screening_results_register_api.py`、`backend/tests/test_trend_system_type_service.py`、`backend/tests/test_trend_type_service.py`(ほか、`daily_trend`・`page`・`page_size` を使う既存のテスト。Step 2 の検索で洗い出す)
- Modify: `frontend/src/types.ts`、`frontend/src/api/screening.ts`、`frontend/src/hooks/useScreening.ts`、`frontend/src/components/ScreeningResultsPanel.tsx`、`frontend/src/components/TrendBadge.tsx`
- Create: `frontend/src/components/screeningListView.ts`(`none` を除く・ページに分ける関数)、`frontend/src/components/screeningListView.test.ts`
- Delete: `frontend/src/components/screeningTrendLabels.ts`
- Modify(テスト): `frontend/src/api/screening.test.ts`、`frontend/src/hooks/useScreening.test.ts`、`frontend/src/components/ScreeningResultsPanel.test.tsx`、`ScreeningResultsPanel.chart.test.tsx`、`ScreeningPage.test.tsx`、`ScreeningConditionPanel.test.tsx`、`TrendBadge.test.tsx`(ほか、旧い名前を使うもの。Step 7 の検索で洗い出す)
- Add(コミット): `docs/design/07-screening.md`、`09-trend-direction-and-market-colors.md`、`10-trend-type-master.md`、`docs/images/AIDDS-17-89.png`、`docs/images/AIDDS-18-trend-note-C2.png`、この計画書

**Interfaces:**
- Consumes: Task 6 の `trend_system_type_service.attach_names` と同じ層の、`models.TrendSystemType`、`trend_type_service.daily_trend_value(direction) -> int`、`trend_type_service.NONE_NAME`、`trend_system_type_seeder.DAILY_TREND_COLUMN`。`trend_direction.classify_history(history)`・`trend_direction.UP`。
- Produces:
  - `trend_system_type_service.names_by_value(db, type_column: str) -> dict[int, str]`
  - `trend_type_service.daily_trend_names(db) -> dict[int, str]`
  - `trend_type_service.daily_trend_name(names: dict[int, str], direction: str | None) -> str`
  - `trend_candidate_result_service.get_cached_results(db, condition_id: int) -> list[dict]`(項目: `code` / `name` / `price` / `matched_signals` / `type_daily_trend`)
  - API `GET /screening/results/{condition_id}` → `{ condition_id, total, items }`(`total` は、返した件数)
  - フロント: `SCREENING_PAGE_SIZE = 20`、`visibleItems(items)`、`pageItems(items, page, pageSize?)`(`screeningListView.ts`)。`useScreening` の `loadResults(conditionId, errorSlot?)`(`loadResultsPage` は廃止)

- [x] **Step 1: 設計書と計画書をコミットする**(設計書は、計画書より先に追記済み。確認の了承後に行う)

```bash
git add docs/design/07-screening.md docs/design/09-trend-direction-and-market-colors.md docs/design/10-trend-type-master.md docs/images/AIDDS-17-89.png docs/images/AIDDS-18-trend-note-C2.png docs/superpowers/plans/2026-10-01-AIDDS-9-feature-improvement-202610-01.md
git commit -m "docs(design): append the AIDDS-17 and AIDDS-18 specs and the plan"
```
(末尾に、Global Constraints の2行を付ける。)

- [x] **Step 2: 旧い名前の使用箇所を洗い出す**

Run: `cd backend && grep -rn "daily_trend\|get_cached_results\|page_size\|/screening/results" app tests | grep -v "type_daily_trend"` と、`cd frontend && grep -rn "daily_trend\|fetchScreeningResults\|loadResultsPage\|page_size\|SCREENING_TREND_LABELS\|screeningTrendLabels" src | grep -v "type_daily_trend"`
Expected: 発掘に関するものだけが出る(保有一覧は、すでに `type_daily_trend`)。出た一覧を、Step 3・7 で直す対象にする。

- [x] **Step 3: バックエンドの失敗するテストを書く**

`backend/tests/test_trend_system_type_service.py` に、足す(`db_session` は、マスタが入った状態):

```python
def test_names_by_value_returns_the_value_to_name_map_of_one_column(db_session):
    names = trend_system_type_service.names_by_value(db_session, "type_daily_trend")

    assert names == {0: "none", 1: "up", 2: "down", 3: "flat"}


def test_names_by_value_is_empty_for_an_unknown_column(db_session):
    assert trend_system_type_service.names_by_value(db_session, "type_unknown") == {}


def test_names_by_value_skips_deleted_rows(db_session):
    from app.clock import now_jst

    db_session.query(models.TrendSystemType).filter_by(type_value=1).update({"deleted_at": now_jst()})
    db_session.commit()

    names = trend_system_type_service.names_by_value(db_session, "type_daily_trend")

    assert 1 not in names
```
(ファイルの先頭の import に、`models`・`trend_system_type_service` が、既にあるか確認し、無ければ足す。)

`backend/tests/test_trend_type_service.py` に、足す:

```python
def test_daily_trend_name_uses_the_master_name_and_falls_back_to_none(db_session):
    names = trend_type_service.daily_trend_names(db_session)

    assert trend_type_service.daily_trend_name(names, "up") == "up"
    assert trend_type_service.daily_trend_name(names, "down") == "down"
    assert trend_type_service.daily_trend_name(names, "flat") == "flat"
    assert trend_type_service.daily_trend_name(names, None) == "none"
    assert trend_type_service.daily_trend_name({}, "up") == "none"
```

`backend/tests/test_trend_candidate_result_service.py`: 次の通りに直す。
- `get_cached_results(db, id, page=1, page_size=20)` の呼び出しは、すべて `get_cached_results(db, id)` に直す。戻り値は、`items`(リスト)だけ。`items, total = ...` / `items, _ = ...` は、`items = ...` に直し、`total == 1` の検査は、`len(items) == 1` に直す。
- **ページ分けの2本のテスト**(`test_get_cached_results_paginates`、`test_get_cached_results_pages_are_disjoint_and_ordered`)は、廃止する(仕様が、ページ分けの廃止に変わったため。テストを緩めて通すのではなく、仕様の変更として、削除し、下の新しいテストに置き換える)。
- `daily_trend` の検査は、`type_daily_trend` に直す。値は、`None` → `"none"`:

```python
def test_get_cached_results_returns_every_item_without_paging(db_session):
    for i in range(25):
        db_session.add(
            models.TrendCandidate(code=f"code{i:02d}", detail={"history": [_bar()] * 30})
        )
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, [])
    trend_candidate_result_service.run_search(db_session, condition)

    items = trend_candidate_result_service.get_cached_results(db_session, condition.id)

    assert len(items) == 25
    assert len({item["code"] for item in items}) == 25


def test_get_cached_results_includes_the_daily_trend_name(db_session):
    rising = [_bar(1000.0 + i * 5) for i in range(40)]
    flat = [_bar(1000.0)] * 30
    short = [_bar(1000.0 + i) for i in range(10)]
    db_session.add_all(
        [
            models.TrendCandidate(code="1111", detail={"history": rising}),
            models.TrendCandidate(code="2222", detail={"history": flat}),
            models.TrendCandidate(code="3333", detail={"history": short}),
        ]
    )
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, [])
    trend_candidate_result_service.run_search(db_session, condition)

    items = trend_candidate_result_service.get_cached_results(db_session, condition.id)

    by_code = {item["code"]: item["type_daily_trend"] for item in items}
    assert by_code == {"1111": "up", "2222": "flat", "3333": "none"}


def test_get_cached_results_follows_the_name_in_the_master(db_session):
    db_session.query(models.TrendSystemType).filter_by(
        type_column="type_daily_trend", type_value=1
    ).update({"type_name": "rise"})
    db_session.commit()
    rising = [_bar(1000.0 + i * 5) for i in range(40)]
    db_session.add(models.TrendCandidate(code="1111", detail={"history": rising}))
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, [])
    trend_candidate_result_service.run_search(db_session, condition)

    items = trend_candidate_result_service.get_cached_results(db_session, condition.id)

    assert items[0]["type_daily_trend"] == "rise"


def test_get_cached_results_returns_none_when_the_master_is_empty(db_session):
    db_session.query(models.TrendSystemType).delete()
    db_session.commit()
    rising = [_bar(1000.0 + i * 5) for i in range(40)]
    db_session.add(models.TrendCandidate(code="1111", detail={"history": rising}))
    db_session.commit()
    condition = trend_candidate_condition_service.create_condition(db_session, [])
    trend_candidate_result_service.run_search(db_session, condition)

    items = trend_candidate_result_service.get_cached_results(db_session, condition.id)

    assert items[0]["type_daily_trend"] == "none"
```
`ma_trend` の2本(「上昇でないとき」「上昇のとき」)も、`type_daily_trend` に直す(「上昇でないとき」は `"none"`、「上昇のとき」は `"up"`)。

`backend/tests/test_screening_results_register_api.py`:
- `body["items"][0]["daily_trend"] == "flat"` → `body["items"][0]["type_daily_trend"] == "flat"`
- `page_size=0`・`page_size=101` が422になる、2行の検査は、削除する(引数が、無くなるため)
- 足す:

```python
def test_get_results_returns_all_items_in_one_response(client):
    session = client.session_local()
    for i in range(25):
        session.add(
            models.TrendCandidate(
                code=f"c{i:02d}",
                detail={"history": [{"date": "2026-09-28", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1}] * 30},
            )
        )
    session.commit()
    session.close()
    condition_id = client.post("/screening/search", json={"enabled_signals": []}).json()["condition_id"]

    body = client.get(f"/screening/results/{condition_id}").json()

    assert body["total"] == 25
    assert len(body["items"]) == 25
    assert "page" not in body and "page_size" not in body
    assert "daily_trend" not in body["items"][0]
    assert body["items"][0]["type_daily_trend"] == "flat"


def test_get_results_ignores_the_old_paging_query(client):
    condition_id = _seed_candidate_and_search(client)

    response = client.get(f"/screening/results/{condition_id}?page=2&page_size=1")

    assert response.status_code == 200
    assert len(response.json()["items"]) == 1
```

- [x] **Step 4: テストを実行して、失敗を確認する**

Run: `cd backend && .venv/bin/python -m pytest tests/test_trend_system_type_service.py tests/test_trend_type_service.py tests/test_trend_candidate_result_service.py tests/test_screening_results_register_api.py -q`
Expected: FAIL(`names_by_value`・`daily_trend_names` が無い、`get_cached_results` の引数が合わない、など)。

- [x] **Step 5: バックエンドを実装する**

`backend/app/trend_system_type_service.py` に、足す:

```python
def names_by_value(db: Session, type_column: str) -> dict[int, str]:
    """type_column の種類の、数値(type_value)から名称(type_name)への対応を、1回の問い合わせで返す。
    削除済みの行は、含めない。行の列に保存していない値(発掘の結果など)に、名称を付けるときに使う。"""
    stmt = select(models.TrendSystemType.type_value, models.TrendSystemType.type_name).where(
        models.TrendSystemType.type_column == type_column,
        models.TrendSystemType.deleted_at.is_(None),
    )
    return {row.type_value: row.type_name for row in db.execute(stmt)}
```

`backend/app/trend_type_service.py` に、足す:

```python
def daily_trend_names(db: Session) -> dict[int, str]:
    """type_daily_trend の、数値から名称への対応。マスタが空なら、空の辞書。"""
    return trend_system_type_service.names_by_value(db, DAILY_TREND_COLUMN)


def daily_trend_name(names: dict[int, str], direction: str | None) -> str:
    """判定結果(up / down / flat / None)を、マスタの名称にする。マスタに行が無いときは none。"""
    return names.get(daily_trend_value(direction), NONE_NAME)
```

`backend/app/trend_candidate_result_service.py`: `get_cached_results` を、次の形にする(`trend_type_service` を import に足す)。

```python
def get_cached_results(db: Session, condition_id: int) -> list[dict]:
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
        select(models.TrendCandidateResult)
        .where(
            models.TrendCandidateResult.condition_id == condition_id,
            models.TrendCandidateResult.deleted_at.is_(None),
        )
        .order_by(models.TrendCandidateResult.id)
    ).scalars().all()
    codes = [r.code for r in result_rows]

    candidates_by_code = {
        c.code: c
        for c in db.execute(
            select(models.TrendCandidate).where(models.TrendCandidate.code.in_(codes))
        ).scalars().all()
    }
    names = trend_code_name_service.get_names(db, codes)
    trend_names = trend_type_service.daily_trend_names(db)

    items = []
    for code in codes:
        candidate = candidates_by_code.get(code)
        if candidate is None:
            continue
        history = candidate.detail.get("history", [])
        price = history[-1]["c"] if history else None
        trend = trend_direction.classify_history(history)
        # ma_trend は閾値が無く、絞り込みが「上昇」と見た銘柄でも、判定は「横ばい」になり得る。
        # 食い違う情報を出さないため、その場合は、判定なし(none)にする。画面は、none の銘柄を除く。
        if "ma_trend" in enabled_signals and trend != trend_direction.UP:
            trend = None
        items.append(
            {
                "code": code,
                "name": names.get(code, ""),
                "price": price,
                "matched_signals": enabled_signals,
                "type_daily_trend": trend_type_service.daily_trend_name(trend_names, trend),
            }
        )

    return items
```

`backend/app/schemas.py`:

```python
class ScreeningResultItemOut(BaseModel):
    code: str
    name: str
    price: float | None
    matched_signals: list[str]
    type_daily_trend: str = "none"


class ScreeningResultsOut(BaseModel):
    condition_id: int
    total: int
    items: list[ScreeningResultItemOut]
```

`backend/app/routers/screening.py`:

```python
@router.get("/results/{condition_id}", response_model=ScreeningResultsOut)
def get_results(condition_id: int, db: Session = Depends(get_db)):
    if trend_candidate_condition_service.get_active_condition(db, condition_id) is None:
        raise HTTPException(status_code=404, detail=f"条件ID {condition_id} は見つかりません")
    items = trend_candidate_result_service.get_cached_results(db, condition_id)
    return ScreeningResultsOut(condition_id=condition_id, total=len(items), items=items)
```
(`Query` の import が、ほかで使われていなければ、外す。)

- [x] **Step 6: バックエンドのテストを実行して、通ることを確認し、コミットする**

Run: `cd backend && .venv/bin/python -m pytest tests/ -q`
Expected: すべて PASS(Task 6 までの、369件に、新しい件数が増え、廃止した2本が減る)。`grep -rn "daily_trend" app tests | grep -v type_daily_trend` が、空(発掘の旧い名前が、残っていない)。

```bash
git add backend/app backend/tests
git commit -m "feat(screening): return every result with the trend name from the type master (AIDDS-17)"
```
(末尾に、Global Constraints の2行を付ける。)

- [x] **Step 7: フロントの失敗するテストを書く**

まず、旧い名前の洗い出し(Step 2 の後半)を、再実行して、直す対象を確認する。

新しいファイル `frontend/src/components/screeningListView.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ScreeningResultItem, TrendName } from "../types";
import { SCREENING_PAGE_SIZE, pageItems, visibleItems } from "./screeningListView";

function item(code: string, trend: TrendName, signals: string[] = ["ma_trend"]): ScreeningResultItem {
  return { code, name: code, price: 100, matched_signals: signals, type_daily_trend: trend };
}

describe("visibleItems", () => {
  it("drops the none rows when at least one signal is selected", () => {
    const items = [item("1", "up"), item("2", "none"), item("3", "down"), item("4", "flat")];

    expect(visibleItems(items).map((i) => i.code)).toEqual(["1", "3", "4"]);
  });

  it("keeps the none rows when no signal is selected", () => {
    const items = [item("1", "up", []), item("2", "none", [])];

    expect(visibleItems(items).map((i) => i.code)).toEqual(["1", "2"]);
  });

  it("returns an empty list for an empty input", () => {
    expect(visibleItems([])).toEqual([]);
  });
});

describe("pageItems", () => {
  const items = Array.from({ length: 30 }, (_, i) => item(String(i + 1), "up"));

  it("uses 20 rows per page", () => {
    expect(SCREENING_PAGE_SIZE).toBe(20);
  });

  it("fills the first page with 20 rows and puts the rest on the second page", () => {
    expect(pageItems(items, 1)).toHaveLength(20);
    expect(pageItems(items, 2)).toHaveLength(10);
    expect(pageItems(items, 2)[0].code).toBe("21");
  });

  it("returns an empty list for a page past the end", () => {
    expect(pageItems(items, 3)).toEqual([]);
  });

  it("makes 20 and 10 rows after dropping the none rows of 50 (20 of them none)", () => {
    const fifty = Array.from({ length: 50 }, (_, i) => item(String(i + 1), i % 5 < 2 ? "none" : "up"));
    // i % 5 が 0・1 のものが none: 50件のうち 20件

    const visible = visibleItems(fifty);

    expect(visible).toHaveLength(30);
    expect(pageItems(visible, 1)).toHaveLength(20);
    expect(pageItems(visible, 2)).toHaveLength(10);
  });
});
```

`frontend/src/api/screening.test.ts`: `fetchScreeningResults` の呼び出しを、`fetchScreeningResults(1)` にし、URL が `/screening/results/1`(`?page=` を含まない)であることを検査する形に直す(既存の「`?page=1&page_size=20`」の期待は、この形に置き換える)。

`frontend/src/hooks/useScreening.test.ts`: `loadResultsPage`・`page`・`pageSize` の期待を、`loadResults(conditionId, errorSlot?)` と、`fetchScreeningResults(conditionId)`(引数1つ)に直す。検索・条件の適用のあとの、読み込みが、`fetchScreeningResults(条件ID)` で呼ばれること、失敗が、適切なエリア(結果/条件)のエラーに出ることを、残す。

`frontend/src/components/ScreeningResultsPanel.test.tsx`:
- `makeScreening` の `results` を、`{ condition_id: 1, total: 1, items: [...] }` にする(`page`・`page_size` を外す)。各項目に `type_daily_trend` を持たせる。`loadResultsPage: vi.fn()` を外す。
- 「トレンドの列と、行の色」のテストは、`daily_trend: "up" / "down" / null` を、`type_daily_trend: "up" / "down" / "flat"` に直し、バッジの文字が `up` / `down` / `flat`(日本語でない)であることを、検査する。
- 「pager」の describe(`loadResultsPage` を検査する7本)は、サーバーを呼ばない、フロントのページ分けのテストに、書き換える。次の関数で、項目を作る:

```tsx
function manyItems(count: number, trend: "up" | "none" = "up", signals: string[] = ["ma_trend"]) {
  return Array.from({ length: count }, (_, i) => ({
    code: String(1000 + i),
    name: `銘柄${i}`,
    price: 100,
    matched_signals: signals,
    type_daily_trend: trend,
  }));
}
function resultsOf(items: ReturnType<typeof manyItems>) {
  return { condition_id: 1, total: items.length, items };
}
```
  書き換えるテスト(それぞれ、`screening.loadResultsPage` の呼び出しでなく、表示される行とページ番号を検査する):
  - 1ページに収まるときは、ページ1だけ。前へ・次へは、無効
  - 200件で、次へを4回押すと、5ページ目。番号は、`1`・`4`・`5`・`6`・`10` と、間の省略記号
  - 連続するページ番号の間には、省略記号を入れない
  - 現在のページは、無効で、`aria-current="page"`
  - 前へ・次へは、ページ−1・ページ+1に動く(行の連番で確かめる。2ページ目の先頭は 21)
  - 1ページ目で、前へは無効。最終ページで、次へは無効
  - (旧い「読み込み中は、すべてのボタンが無効」と、「現在の条件が無いとき、読み込まない」の2本は、サーバーを呼ばなくなるため、廃止する)
- 足す:

```tsx
describe("ScreeningResultsPanel none handling and paging", () => {
  it("drops the none rows and counts only the rest when signals are selected", () => {
    const items = [...manyItems(3, "up"), ...manyItems(2, "none").map((i, n) => ({ ...i, code: `n${n}` }))];

    render(<ScreeningResultsPanel screening={makeScreening({ results: resultsOf(items) }) as never} />);

    expect(screen.getByText("該当3件")).toBeInTheDocument();
    expect(screen.queryByText("none")).not.toBeInTheDocument();
  });

  it("keeps the none rows and shows none when no signal is selected", () => {
    const items = [...manyItems(2, "up", []), ...manyItems(1, "none", []).map((i) => ({ ...i, code: "n0" }))];

    render(<ScreeningResultsPanel screening={makeScreening({ results: resultsOf(items) }) as never} />);

    expect(screen.getByText("該当3件")).toBeInTheDocument();
    expect(screen.getAllByText("none")).toHaveLength(1);
  });

  it("fills the first page with 20 rows and the second with the rest after dropping none rows", () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      code: String(2000 + i),
      name: `銘柄${i}`,
      price: 100,
      matched_signals: ["ma_trend"],
      type_daily_trend: i % 5 < 2 ? "none" : "up",
    }));

    render(<ScreeningResultsPanel screening={makeScreening({ results: resultsOf(items as never) }) as never} />);

    expect(screen.getByText("該当30件")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox", { name: /を選択$/ })).toHaveLength(20);
    fireEvent.click(screen.getByRole("button", { name: "次のページ" }));
    expect(screen.getAllByRole("checkbox", { name: /を選択$/ })).toHaveLength(10);
  });

  it("shows an empty table with 該当0件 and one page when every row is none", () => {
    render(
      <ScreeningResultsPanel
        screening={makeScreening({ results: resultsOf(manyItems(5, "none")) }) as never}
      />
    );

    expect(screen.getByText("該当0件")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox", { name: /を選択$/ })).toHaveLength(0);
    expect(screen.getByRole("button", { name: "次のページ" })).toBeDisabled();
  });

  it("returns to the first page when the results are replaced by a new search", () => {
    const first = makeScreening({ results: resultsOf(manyItems(50)) });
    const { rerender } = render(<ScreeningResultsPanel screening={first as never} />);
    fireEvent.click(screen.getByRole("button", { name: "次のページ" }));

    const second = makeScreening({ results: resultsOf(manyItems(50)), resultsGeneration: 1 });
    rerender(<ScreeningResultsPanel screening={second as never} />);

    expect(screen.getByRole("button", { name: "前のページ" })).toBeDisabled();
  });
});
```
  (`makeScreening` に、`resultsGeneration: 0` の既定が無ければ、足す。)
- ほかの describe(signal labels・register・errors and notices)の `results` の形(`page`・`page_size`)を、新しい形に直す。「空の結果のヒント」は、`total: 0` のときに出る、従来どおりのテストにする。

`ScreeningResultsPanel.chart.test.tsx`・`ScreeningPage.test.tsx`・`ScreeningConditionPanel.test.tsx`: `results` の形と、`daily_trend`・`loadResultsPage` を使う所を、新しい形に直す。

`frontend/src/components/TrendBadge.test.tsx`: `label` 引数のテスト(あれば)を、削除する。「値の文字が、そのまま出る」「null・undefined は、『—』」は、残す。

- [x] **Step 8: フロントのテストを実行して、失敗を確認する**

Run: `cd frontend && npx vitest run 2>&1 | tail -30`
Expected: FAIL(`screeningListView` が無い、型・props が合わない、など)。

- [x] **Step 9: フロントを実装する**

`frontend/src/types.ts`:

```ts
export interface ScreeningResultItem {
  code: string;
  name: string;
  price: number | null;
  matched_signals: string[];
  type_daily_trend: TrendName;
}

export interface ScreeningResultsPage {
  condition_id: number;
  total: number;
  items: ScreeningResultItem[];
}
```

`frontend/src/api/screening.ts`:

```ts
export function fetchScreeningResults(conditionId: number): Promise<ScreeningResultsPage> {
  return apiRequest<ScreeningResultsPage>(`/screening/results/${conditionId}`);
}
```

`frontend/src/hooks/useScreening.ts`: `loadResultsPage(conditionId, page, pageSize, errorSlot)` を、`loadResults(conditionId, errorSlot)` に改める(`page` と `pageSize` を外し、`fetchScreeningResults(conditionId)` を呼ぶ。ほかは、同じ)。`runSearch` は、`await loadResults(searchResult.condition_id)`、`applyCondition` は、`await loadResults(condition.id, "condition")`。返す値の `loadResultsPage` を、`loadResults` に改める。

新しいファイル `frontend/src/components/screeningListView.ts`:

```ts
import type { ScreeningResultItem } from "../types";

export const SCREENING_PAGE_SIZE = 20;

// 発掘画面の業務ルール: トレンドが none の銘柄は、一覧に出さない。
// ただし、シグナルの条件を1つも選んでいないとき(matched_signals が空)は、全銘柄が対象なので、除かない。
export function visibleItems(items: ScreeningResultItem[]): ScreeningResultItem[] {
  return items.filter((item) => item.type_daily_trend !== "none" || item.matched_signals.length === 0);
}

export function pageItems<T>(items: T[], page: number, pageSize = SCREENING_PAGE_SIZE): T[] {
  return items.slice((page - 1) * pageSize, page * pageSize);
}
```

`frontend/src/components/TrendBadge.tsx`: `label` 引数を外し、値の型を `TrendName | null | undefined` にする。`{label ?? value}` は、`{value}` にする。`trendRowClass` は、そのまま(`up` → `row-trend-up`、`down` → `row-trend-down`)。

`frontend/src/components/ScreeningResultsPanel.tsx`: 次のとおりに直す。
- import: `SCREENING_TREND_LABELS` を外し、`import { SCREENING_PAGE_SIZE, pageItems, visibleItems } from "./screeningListView";` を足す
- state: `const [page, setPage] = useState(1);`
- 検索・条件が変わったときの `useEffect`(`resultsConditionId`・`resultsGeneration`)に、`setPage(1);` を足す
- 表示中の銘柄が消えたら、チャートを未選択に戻す `useEffect` を、現在のページの行で調べる形に直す:

```tsx
  useEffect(() => {
    if (viewingCode === null) return;
    const rows = results ? pageItems(visibleItems(results.items), page) : [];
    if (!rows.some((item) => item.code === viewingCode)) {
      setViewingCode(null);
    }
  }, [results, viewingCode, page]);
```
- `if (!results) { ... }` の後(フックの呼び出しは、すべて、この前にある)で、次を計算する:

```tsx
  const visible = visibleItems(results.items);
  const totalPages = Math.max(Math.ceil(visible.length / SCREENING_PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages);
  const pageRows = pageItems(visible, currentPage);
  const pageNumbers = pageNumbersToShow(currentPage, totalPages);
  const viewingItem = pageRows.find((item) => item.code === viewingCode);
```
  (既存の `goToPage`・`totalPages`・`pageNumbers`・`viewingItem` の定義は、削除する)
- 「該当{results.total}件」→「該当{visible.length}件」。空のヒント(`results.total === 0`)は、そのまま
- 行: `results.items.map` → `pageRows.map`。連番は `(currentPage - 1) * SCREENING_PAGE_SIZE + index + 1`。行のクラスは `trendRowClass(item.type_daily_trend)`。トレンドの欄は `<TrendBadge value={item.type_daily_trend} />`
- ページ送り: `results.page` → `currentPage`、`goToPage(n)` → `setPage(n)`。`loadingResults` による無効化は、外す(サーバーを呼ばないため)。次へ: `disabled={currentPage >= totalPages}`、前へ: `disabled={currentPage <= 1}`

`frontend/src/components/screeningTrendLabels.ts` を、削除する(`git rm`)。

- [x] **Step 10: フロントのテスト・型チェックを実行して、通ることを確認し、コミットする**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: すべて PASS、型チェックにエラー無し。`grep -rn "daily_trend\|loadResultsPage\|page_size\|SCREENING_TREND_LABELS\|screeningTrendLabels" src | grep -v type_daily_trend` が、空。

```bash
git add frontend/src
git commit -m "feat(screening): show the trend name as it is and drop the none rows on the screening list (AIDDS-17)"
```
(末尾に、Global Constraints の2行を付ける。)

- [x] **Step 11: 設計書と実装の食い違いを見直す**

追記した、09 の節(AIDDS-17)の、各項目(表示・保存しない・APIの形・画面の業務ルール・ページ分け・行の色)が、実装と合っているかを、1つずつ、確かめる。食い違えば、設計書でなく、実装を直す(設計書は、合意済み)。実装が正しく、設計書の記述が足りないときは、設計書に、追記する(元の本文は、書き換えない)。

- [x] **Step 12: 実機スモークテスト**(`CLAUDE.md` の必須の確認。動いているスタックは止めない)

準備: 別のプロジェクト名 `aidd17-smoke`で、ポートを上書きする compose ファイル(Task 6 の手順13と同じ内容。スクラッチパッドの `aidd10.override.yml` を使ってよい)を使う。`docker compose -p aidd17-smoke -f docker-compose.yml -f <上書きファイル> up -d --build`(DBは新しい)。確認は、`frontend/node_modules` の Playwright で行い、幅1500pxで、ライト・ダークの両方。

発掘の候補は、DBに直接入れる(`trend_candidate` に、`code` と `detail={"history": [...]}`)。`history` の各要素は、`{"date","o","h","l","c","v"}`。日足が、上昇・下降・横ばい・26本未満になる銘柄を、それぞれ数件ずつ作る(終値の並びで作る)。

確認する項目:
1. **条件なしの検索**(シグナルを選ばずに「検索」): 全銘柄が出る。トレンド欄が、`up` / `down` / `flat` / `none` の、英語の文字(日本語でない)。行の色が、これまでと同じ(上昇=赤っぽい、下降=緑っぽい、ほか=色なし)。
2. **条件あり**(例: 移動平均トレンド): 判定が「上昇」の銘柄だけが出る。`none`(上昇でない)の銘柄が、一覧に、いない。「該当N件」が、出ている件数と一致する。
3. **ページを埋める**: 条件なしで、候補を50件(うち26本未満=`none` を20件)入れる。条件ありで検索し直し、30件が、1ページ目20件・2ページ目10件で出る。条件なしでは、50件が、20・20・10件。ページを往復して、連番が続く。
4. **マスタを変える**: DBで、`trend_system_type` の `up` の名前を `rise` に変えると、画面が `rise` になる(確認後、バックエンドを再起動して、初期データに戻す)。マスタを空にしても、一覧は表示され、すべて `none`(条件なしのとき表示される)。
5. **応答時間**: 候補を1000件、各90本の日足で入れ、条件なしで検索し、`GET /screening/results/{id}` の応答時間を測る(`curl -w "%{time_total}"`)。結果を、報告する。数秒を超えるなら、止めて、相談する。
6. **保有一覧と、そのほかの導線が、壊れていない**: 保有一覧のトレンド列(Task 6 の表示)、意見ボタンと右側パネル、発掘の行をクリックしたときのチャート、「選択をウォッチリストへ」、一覧から詳細への遷移、テーマ切替。

確認が済んだら、`docker compose -p aidd17-smoke … down -v` で、スモーク用のスタックを片付ける。スクリーンショットを、ユーザーに見せる。

- [x] **Step 13: 自己レビューと遷移**

テスト(バックエンド・フロント・型チェック)、差分、画面の確認結果を見直す。問題があれば直す。問題が無ければ、AIDDS-17 の状態を「レビュー」に変える。報告に、確認した内容、できなかった確認(発掘の実スキャン)、応答時間の実測、残った点を、書く。

### Task 8: 発掘と一覧の「トレンド」列の見出しに、出どころの添え書きを付ける (AIDDS-18)

**Files:**
- Modify: `frontend/src/components/ScreeningResultsPanel.tsx`(見出しの添え書き)
- Modify: `frontend/src/components/WatchlistTable.tsx`(見出しの添え書き。意見のパネルを開いているときは、描画しない)
- Modify: `frontend/src/index.css`(`.trend-note`、発掘の「トレンド」列の幅)
- Modify(テスト): `frontend/src/components/ScreeningResultsPanel.test.tsx`、`frontend/src/components/WatchlistTable.test.tsx`

**Interfaces:**
- Consumes: Task 7 の `ScreeningResultsPanel`(`pageRows` などの表の描画)。`WatchlistTable` の `folded`(`openCode !== null`)。
- Produces: CSS クラス `.trend-note`。

- [x] **Step 1: 失敗するテストを書く**

`ScreeningResultsPanel.test.tsx` に、足す:

```tsx
describe("ScreeningResultsPanel trend note", () => {
  it("shows where the trend comes from under the トレンド header", () => {
    render(<ScreeningResultsPanel screening={makeScreening() as never} />);

    const header = screen.getByRole("columnheader", { name: /トレンド/ });
    expect(header).toHaveTextContent(/J-Quants 日足/);
    expect(header).toHaveTextContent(/60営業日/);
  });
});
```

`WatchlistTable.test.tsx` に、足す(既存のテストが、表を描画する形に合わせる。`openCode` を渡す形は、既存のテストを見て、同じ書き方にする):

```tsx
describe("WatchlistTable trend note", () => {
  it("shows where the trend comes from under the トレンド header", () => {
    renderTable({ openCode: null });

    const header = screen.getByRole("columnheader", { name: /トレンド/ });
    expect(header).toHaveTextContent(/5分足を日足に/);
    expect(header).toHaveTextContent(/更新時の値/);
  });

  it("hides the note while the opinion panel is open and the columns are folded", () => {
    renderTable({ openCode: "7203" });

    const header = screen.getByRole("columnheader", { name: /トレンド/ });
    expect(header).not.toHaveTextContent(/5分足を日足に/);
    expect(header).not.toHaveTextContent(/更新時の値/);
  });
});
```
(`renderTable` は、既存のテストの、表を描画する補助の関数。名前や引数が違えば、既存の書き方に合わせる。補助が無ければ、既存のテストの描画の仕方を、そのまま使う。)

- [x] **Step 2: テストを実行して、失敗を確認する**

Run: `cd frontend && npx vitest run src/components/ScreeningResultsPanel.test.tsx src/components/WatchlistTable.test.tsx 2>&1 | tail -20`
Expected: 新しい3本が FAIL(添え書きが、まだ無い)。

- [x] **Step 3: 実装する**

`ScreeningResultsPanel.tsx` の、見出しの「トレンド」を、次の形にする:

```tsx
                <th className="trend-col">
                  トレンド
                  <span className="trend-note">
                    J-Quants 日足
                    <br />
                    60営業日
                  </span>
                </th>
```

`WatchlistTable.tsx` の、見出しの「トレンド」を、次の形にする(折りたたみのときは、添え書きを描画しない):

```tsx
          <th className="trend-col">
            トレンド
            {!folded && (
              <span className="trend-note">
                5分足を日足に
                <br />
                更新時の値
              </span>
            )}
          </th>
```

`frontend/src/index.css` に、足す(`.trend-badge` の近くに置く):

```css
/* トレンド列の見出しの、出どころの添え書き(AIDDS-18)。小さく、2行(<br> で区切る) */
.trend-note {
  display: block;
  font-size: 0.75em;
  font-weight: 400;
  line-height: 1.4;
  color: var(--text-muted);
  white-space: nowrap;
}
```
発掘の「トレンド」列の幅(いまは80px)を、添え書きが、折り返さず、列の外へはみ出さない最小の幅に、広げる。まず、112px にして、Step 5 の実測で、確かめる:

```css
.screening-results-table .trend-col {
  width: 112px;
}
```
(既存の `.screening-results-table .trend-col { width: 80px; }` を、この値に直す。ほかの列の幅は、変えない。)

- [x] **Step 4: テスト・型チェックを実行して、通ることを確認し、コミットする**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: すべて PASS、型チェックにエラー無し。

```bash
git add frontend/src
git commit -m "feat(ui): add a note under the trend header telling where the trend comes from (AIDDS-18)"
```
(末尾に、Global Constraints の2行を付ける。)

- [x] **Step 5: 実機スモークテスト**(動いているスタックは止めない。Task 7 の手順12と同じ、別のスタック `aidd17-smoke` を使う。片付けていれば、同じ手順で、作り直す。保有銘柄は、`POST /trends` で、実際の取得をするか、DBに入れる)

幅1500pxで、ライト・ダークの両方で確認する。

1. **添え書きの表示**: 発掘の「トレンド」の見出しの下に、「J-Quants 日足」「60営業日」。保有一覧の「トレンド」の見出しの下に、「5分足を日足に」「更新時の値」。どちらも、小さな文字で、2行。
2. **見出しの高さ**: 見出し1行と添え書き2行の、3行以内。`th` の高さと、`.trend-note` の高さ(`getBoundingClientRect().height / lineHeight` が、2行)を、Playwright で測る。
3. **列幅**: 発掘の「トレンド」列で、添え書きが、折り返さず、列の外へはみ出さない(`.trend-note` の `scrollWidth` が、親の `th` の内側の幅以下)。収まらなければ、`112px` を、収まる最小の値(10px 単位で切り上げ)に直す。直したら、その値を、報告する。ほかの列の幅が、変わっていないこと(`checkbox-col`・`seq-col`・`code-col`・`name-col`・`price-col`)を、確かめる。
4. **保有一覧の、折りたたみ**: 「意見」を押して、パネルを開くと、「トレンド」の見出しの下の添え書きが、消える。閉じると、戻る。
5. **読める色**: 添え書きの文字色と、見出しの背景色の、コントラスト比が、4.5以上(ライト・ダークの両方)。Playwright で、`getComputedStyle` の色と、背景色(`th` の、不透明な背景まで、親をたどる)を取り、次の式で計算する(相対輝度 L = 0.2126R + 0.7152G + 0.0722B。各成分は、`c/255` を、`c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)^2.4` で直す。比 = (明るい方の L + 0.05) / (暗い方の L + 0.05))。4.5を下回れば、文字色を、調整する(`--text-muted` を使っているので、その変数を直すのでなく、`.trend-note` の色だけを、直す)。
6. **既存の表示が、変わっていない**: 列の並び、トレンドの文字(`up` など)と色、行の色、保有一覧の行の高さ(固定の高さ)。Task 7 の確認(条件なしの発掘の一覧)と、保有一覧の画面を、見て、確かめる。

確認が済んだら、`docker compose -p aidd17-smoke … down -v` で、スモーク用のスタックを片付ける。スクリーンショットを、ユーザーに見せる。

- [x] **Step 6: 設計書と実装の食い違いを見直す**

追記した、09 の節(AIDDS-18)の、添え書きの文言、表示の条件(3行以内・列幅・折りたたみ・読める色・既存の表示)が、実装と合っているかを、確かめる。列幅を、112px から変えたときは、設計書の記述(「広げてよい」)の範囲内なので、追記は、要らない。食い違えば、実装を直す。

- [x] **Step 7: 自己レビューと遷移**

テスト(フロント・型チェック)、差分、画面の確認結果を見直す。問題があれば直す。問題が無ければ、AIDDS-18 の状態を「レビュー」に変える。報告に、確認した内容(測った列幅、コントラスト比)、残った点を、書く。計画書のチェックボックスが、すべて済んでいるかも、示す。

---

## 追記: AIDDS-19 の確認してほしい点(2026-10-19)

上の計画(Task 1〜8)の実装後に、AIDDS-19 が、AIDDS-9 の子になった。エピックごとに、計画書は1本なので、別の計画書にせず、この計画書に、Task 9(AIDDS-19)を足す。

1. **親エピックと設計書**(確認済み): 親は AIDDS-9。設計書は、新しく作らず、仕様の本体がある `docs/design/06-position-grouping.md` の末尾に、「追記: AIDDS-19 入力項目のラベル表示」を、計画書より先に、追記した。仕様は、そこと Jira(AIDDS-19 の説明欄)に有り、この計画書には、書き写さない。
2. **ADR**(採用済み、2026-10-19): `docs/decisions/adr-0006-click-to-edit-inline-fields.md`。一般則として書いた(対象は、一覧の中のセレクトボックス・テキストボックス。画面は問わない。一覧以外は、通常の表示)。動機・採らなかった理由は、見た目(ユーザー)。
3. **実装の順番**: Task 9 のみ。
4. **発掘一覧**(ADR で解決): コードを読んだ(`ScreeningResultsPanel.tsx`)。入力する項目は、行のチェックボックスだけで、セレクトボックス・テキストボックスは無い。ADR-0006 で、対象は、セレクトボックス・テキストボックスに限り、チェックボックスは、対象外と決めたので、発掘一覧は、変えない。
5. **私が選んだ既定(確認してほしい)**:
   1. **既存の小数の値**: DB は `Numeric(12,2)` で、小数の単価(例: 580.5)が、すでに入っているかもしれない。編集に入って、何も変えずに閉じたときは、値も、保存も、そのまま(小数のまま)。文字を打つと、小数点は消え、整数になる(ユーザーの決定: 整数のみ)。
   2. **保存の失敗**: 行の `error` が出たとき、ラベルを、保存前の値(`trend`)に戻す。保存の成功までの間は、確定した値を、先に見せる(待たせない)。
   3. **損益の更新**: 確定したとき(入力の途中では、更新しない)。いまは、打つたびに更新している。仕様の「ラベル表示」の副作用。
   4. **数値欄の作り**: `type="text"` と `inputMode="numeric"`。入力のたびに、半角の数字以外を除く。日本語入力の変換中は、触らず、変換の確定後に除く。`type="number"` は、採らない(`e`・`+`・`-`・小数点が入る、日本語入力が使えない、矢印が付く)。
   5. **幅・高さの揃え**: 表示のボタンと、編集欄に、同じクラス(`.amount-input` など)を付け、高さを `34px`、グループの幅を `120px` に固定する。実機で、実測して、合わなければ、直す。
   6. **既存テストの直し**: 入力欄を触る前に、ヘルパー `openField(label)`(ラベルにフォーカスして、編集へ入る)を呼ぶ形に直す。範囲は、落ちるテストで確定する。
   7. **実機確認の進め方**: フロントエンドだけの変更なので、動いているスタックを止めず、作業ツリーの Vite を、別のポート(5190)で起動し、動いているバックエンド(8000)に向ける(AIDDK-4 と同じ)。試験データは、終わったら戻す。日本語入力(変換の確定の Enter と、保存の Enter の、2回)は、Playwright で再現できないので、ユーザーに確認してもらう。

## 追記分の Global Constraints

上の Global Constraints に加えて、次を守る。

- バックエンド・API・DBは、変えない。保存の条件(`WatchlistRow.savePositionIfChanged` の、変わったときだけ保存する)も、変えない
- 入力欄とラベルの `aria-label`(「{コード}の会社名」「…のグループ」「…の預かり区分」「…の購入金額」「…の購入株数」「…の売却価格(予定)」)は、いまの文言のまま、変えない
- 選択式の未設定の表示は、「未選択」(グループの「選択」を、「未選択」に変える)
- 確定のタイミングは、種類ごとに固定(テキスト=blur か Enter、セレクト=選んだ時点)。項目ごとに変える設定は、部品に持たせない(ADR-0006)
- 数値欄は、半角の数字だけ。小数点・負号・全角の数字は、入らない
- 承認済みの設計書(06)の元の本文は、書き換えない。追記だけ(追記済み)
- 本物のClaude・J-Quants・yfinanceを、テストで呼ばない(既存のモックの流儀)
- コミットメッセージの末尾に、次の2行を付ける: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` と `Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ`
- 作業ブランチは `feature/20261019`(`develop` から作成済み)。push・マージ・PRは、この計画に含めない。AIDDK-21 の、未コミットの変更(`CLAUDE.md`、`jira-exec`)は、この計画に含めない(コミットは、ユーザーが頼んだとき)

## 追記分の Review Focus

仕様が示すが、どのタスクのテストも直接は確かめていない、実際に困りやすいもの。

1. **二重に確定しない**: Enter で確定したあとに、フォーカスが外れても、保存が、2回呼ばれない。→ Task 9 の部品のテスト。
2. **Esc のあとに、保存しない**: Esc で戻ったあとの、フォーカスの移動で、保存が呼ばれない。→ 部品のテスト。
3. **日本語入力の変換中の Enter**: 会社名で、変換の確定の Enter(`isComposing`)では、確定しない。→ 部品のテスト。
4. **数値欄に、文字・全角の数字が入らない**: `a１2` を打つと、`2` だけが残る。→ 部品のテスト。
5. **触らなかった小数の値**: `580.5` の欄を、編集に入って、そのまま閉じても、保存が呼ばれない。→ 部品のテスト。
6. **保存の失敗**: 保存に失敗したとき、ラベルが、保存前の値に戻り、行のエラーが出る。→ 行のテスト。
7. **Tab で、次の項目へ進む**: Tab で着いた項目が編集に入り、次の Tab で確定して、次の項目が編集に入る。壊れない。→ 実機の確認。
8. **表示と編集で、幅・高さが同じ**: 列が揺れない。長い会社名は、省略記号で切れる。→ 実機の確認(実測)。
9. **`showPicker()` の例外**: 例外が出ても、握りつぶして、2回クリックの形に落ちる。→ 部品のテスト。

## 追記分の実装の順番と理由

Task 9(AIDDS-19)のみ。Task 内の順番は、「部品 → 行への適用と、既存テストの直し → CSS → 実機確認」。部品を先に作るのは、行の変更が、部品の使い方(`onCommit` の呼ばれ方)に依存するため。

### Task 9: 保有一覧の入力項目を、「ラベル表示+クリックで編集」にする (AIDDS-19)

**Files:**
- Create: `frontend/src/components/InlineEditField.tsx`(表示と編集を切り替える共通の部品。数字だけに絞る関数 `sanitizeDigits` も、ここに置く)
- Create(テスト): `frontend/src/components/InlineEditField.test.tsx`
- Modify: `frontend/src/components/WatchlistRow.tsx`(6つの入力項目を、部品に置き換える。数値のテキスト状態と、`blurOnEnter` を、無くす)
- Modify: `frontend/src/index.css`(`.inline-edit-view`、幅・高さの揃え)
- Modify(テスト): `frontend/src/components/WatchlistTable.test.tsx`、`frontend/src/components/WatchlistPage.test.tsx`(入力欄を触る手順を、「編集に入る」形に直す)
- Modify(設計書。済み): `docs/design/06-position-grouping.md`(追記済み)
- Create(ADR。済み、採用): `docs/decisions/adr-0006-click-to-edit-inline-fields.md`

**Interfaces:**
- Consumes: `WatchlistRow` の既存の処理(`savePositionIfChanged`、`onSaveName`、`onSavePosition`)。`BUY_CATEGORY_OPTIONS`。
- Produces: `InlineEditField`(props: `label`、`kind: "text" | "digits" | "select"`、`value: string`、`displayText?: string`、`options?: { value: string; label: string }[]`、`placeholder?: string`、`className?: string`、`onCommit: (value: string) => void`)。`sanitizeDigits(text: string): string`。CSS クラス `.inline-edit-view`。

- [x] **Step 1: 設計書・ADR(採用)・計画書を、コミットする(docs のコミット)**

ユーザーが、この計画書を了承した後に行う(了承されたコミットの範囲)。

```bash
git add docs/design/06-position-grouping.md docs/decisions/adr-0006-click-to-edit-inline-fields.md docs/superpowers/plans/2026-10-01-AIDDS-9-feature-improvement-202610-01.md
git commit -m "docs(design): add the AIDDS-19 click-to-edit spec, the accepted ADR-0006 and the plan (AIDDS-19)"
```
(末尾に、Global Constraints の2行を付ける。)

- [x] **Step 2: 部品の、失敗するテストを書く**

`frontend/src/components/InlineEditField.test.tsx` を作る:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineEditField, sanitizeDigits } from "./InlineEditField";

const LABEL = "7203の購入金額";
const groupOptions = [
  { value: "", label: "未選択" },
  { value: "1", label: "テック株" },
  { value: "2", label: "金融株" },
];

function setup(props: Partial<ComponentProps<typeof InlineEditField>> = {}) {
  const onCommit = vi.fn();
  render(<InlineEditField label={LABEL} kind="digits" value="2900" onCommit={onCommit} {...props} />);
  return { onCommit };
}

// ラベルにフォーカスして、編集に入る(クリックでも、Tab でも、同じ)
function open(): HTMLInputElement | HTMLSelectElement {
  fireEvent.focus(screen.getByLabelText(LABEL));
  return screen.getByLabelText(LABEL) as HTMLInputElement | HTMLSelectElement;
}

afterEach(() => {
  Reflect.deleteProperty(HTMLSelectElement.prototype, "showPicker");
});

describe("sanitizeDigits", () => {
  it("keeps only half-width digits", () => {
    expect(sanitizeDigits("a１2-.3 4")).toBe("234");
    expect(sanitizeDigits("")).toBe("");
  });
});

describe("InlineEditField view", () => {
  it("shows the value as a button label with the aria-label", () => {
    setup();

    const button = screen.getByLabelText(LABEL);
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveTextContent("2900");
  });

  it("shows — for an empty text or number value", () => {
    setup({ value: "" });

    expect(screen.getByLabelText(LABEL)).toHaveTextContent("—");
  });

  it("shows the option label for a select, including 未選択", () => {
    setup({ kind: "select", options: groupOptions, value: "" });
    expect(screen.getByLabelText(LABEL)).toHaveTextContent("未選択");
  });

  it("shows displayText instead of the value when given", () => {
    setup({ kind: "text", value: "トヨタ", displayText: "トヨタ自動車" });

    expect(screen.getByLabelText(LABEL)).toHaveTextContent("トヨタ自動車");
  });
});

describe("InlineEditField text and digits", () => {
  it("turns into an input with the same aria-label when the label gets focus", () => {
    setup();

    const input = open();

    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveValue("2900");
  });

  it("commits the changed value once on blur and goes back to the label", () => {
    const { onCommit } = setup();
    const input = open();

    fireEvent.change(input, { target: { value: "3000" } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("3000");
    expect(screen.getByLabelText(LABEL).tagName).toBe("BUTTON");
  });

  it("does not commit when the value is unchanged", () => {
    const { onCommit } = setup();
    const input = open();

    fireEvent.blur(input);

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(LABEL).tagName).toBe("BUTTON");
  });

  it("commits once on Enter", () => {
    const { onCommit } = setup();
    const input = open();

    fireEvent.change(input, { target: { value: "3000" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("3000");
  });

  it("does not commit on the Enter that confirms an IME conversion", () => {
    const { onCommit } = setup({ kind: "text", value: "トヨタ" });
    const input = open();

    fireEvent.change(input, { target: { value: "トヨタ自動車" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(LABEL).tagName).toBe("INPUT");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("トヨタ自動車");
  });

  it("drops the input on Escape and does not commit", () => {
    const { onCommit } = setup();
    const input = open();

    fireEvent.change(input, { target: { value: "3000" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(LABEL)).toHaveTextContent("2900");
  });

  it("lets only half-width digits into a digits field", () => {
    setup();
    const input = open();

    fireEvent.change(input, { target: { value: "ab１2-.3" } });

    expect(input).toHaveValue("23");
  });

  it("keeps a decimal value that was not touched (no commit on open and close)", () => {
    const { onCommit } = setup({ value: "580.5" });
    const input = open();

    expect(input).toHaveValue("580.5");
    fireEvent.blur(input);

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("does not filter a text field", () => {
    const { onCommit } = setup({ kind: "text", value: "" });
    const input = open();

    fireEvent.change(input, { target: { value: "ソニーabc1" } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith("ソニーabc1");
  });

  it("shows the placeholder on the input", () => {
    setup({ kind: "text", value: "", placeholder: "7203" });

    expect(open()).toHaveAttribute("placeholder", "7203");
  });
});

describe("InlineEditField select", () => {
  it("turns into a select, commits the chosen value at once and goes back to the label", () => {
    const { onCommit } = setup({ kind: "select", options: groupOptions, value: "" });
    const select = open();

    expect(select.tagName).toBe("SELECT");
    fireEvent.change(select, { target: { value: "2" } });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("2");
    expect(screen.getByLabelText(LABEL).tagName).toBe("BUTTON");
  });

  it("goes back without committing when the select loses focus", () => {
    const { onCommit } = setup({ kind: "select", options: groupOptions, value: "1" });
    const select = open();

    fireEvent.blur(select);

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(LABEL).tagName).toBe("BUTTON");
  });

  it("opens the list with showPicker when it exists", () => {
    const showPicker = vi.fn();
    Object.defineProperty(HTMLSelectElement.prototype, "showPicker", { configurable: true, value: showPicker });
    setup({ kind: "select", options: groupOptions, value: "" });

    open();

    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it("swallows an error from showPicker and still shows the select", () => {
    const showPicker = vi.fn(() => {
      throw new Error("NotAllowedError");
    });
    Object.defineProperty(HTMLSelectElement.prototype, "showPicker", { configurable: true, value: showPicker });
    setup({ kind: "select", options: groupOptions, value: "" });

    const select = open();

    expect(select.tagName).toBe("SELECT");
  });

  it("works when showPicker does not exist", () => {
    setup({ kind: "select", options: groupOptions, value: "" });

    expect(open().tagName).toBe("SELECT");
  });
});
```

- [x] **Step 3: テストを実行して、失敗することを確認する**

Run: `cd frontend && npx vitest run src/components/InlineEditField.test.tsx`
Expected: FAIL(`./InlineEditField` が、まだ無い)。

- [x] **Step 4: 部品を実装する**

`frontend/src/components/InlineEditField.tsx` を作る:

```tsx
import { useEffect, useRef, useState } from "react";

export interface InlineEditOption {
  value: string;
  label: string;
}

interface InlineEditFieldProps {
  // 表示のボタンと、編集欄の、両方に付ける aria-label
  label: string;
  kind: "text" | "digits" | "select";
  // 現在の値(select は、選択肢の value)
  value: string;
  // 表示のラベル(省略時は value)。select は、選択肢の label を使う
  displayText?: string;
  options?: InlineEditOption[];
  placeholder?: string;
  className?: string;
  // 確定して、値が変わったときだけ呼ぶ
  onCommit: (value: string) => void;
}

const EMPTY_LABEL = "—";

// 半角の数字(0〜9)だけを残す。文字・全角の数字・小数点・負号は、除く。
export function sanitizeDigits(text: string): string {
  return text.replace(/[^0-9]/g, "");
}

// ラベル(枠線つき)で表示し、クリック(または Tab で着いたとき)に、入力欄へ切り替わる。
// 確定(blur・Enter・select の選択)でラベルに戻る。保存そのものは、呼び出し側が持つ。
export function InlineEditField({
  label,
  kind,
  value,
  displayText,
  options = [],
  placeholder,
  className = "",
  onCommit,
}: InlineEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  // 確定・取消のあとに、フォーカスが外れる(blur)イベントが続いても、二重に確定しない
  const done = useRef(false);
  const control = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    if (!editing) return;
    const el = control.current;
    if (!el) return;
    el.focus();
    if (el instanceof HTMLSelectElement) {
      try {
        (el as HTMLSelectElement & { showPicker?: () => void }).showPicker?.();
      } catch {
        // 対応しない、許可されない環境では、リストは開かない(もう1回クリックで開く)
      }
    }
  }, [editing]);

  const enter = () => {
    done.current = false;
    setDraft(value);
    setEditing(true);
  };

  // next が null のときは、取り消し(保存しない)
  const leave = (next: string | null) => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    if (next !== null && next !== value) onCommit(next);
  };

  // 触っていない値(例: DB にある小数 580.5)は、数字だけに直さず、そのまま返す
  const confirmedDraft = () => (kind === "digits" && draft !== value ? sanitizeDigits(draft) : draft);

  if (!editing) {
    const text = kind === "select" ? options.find((o) => o.value === value)?.label ?? "" : displayText ?? value;
    const shown = text === "" ? EMPTY_LABEL : text;
    return (
      <button
        type="button"
        className={`inline-edit-view ${className}`.trim()}
        aria-label={label}
        title={shown}
        onFocus={enter}
        onClick={enter}
      >
        {shown}
      </button>
    );
  }

  if (kind === "select") {
    return (
      <select
        ref={(el) => {
          control.current = el;
        }}
        className={className}
        aria-label={label}
        value={draft}
        onChange={(e) => leave(e.target.value)}
        onBlur={() => leave(null)}
        onKeyDown={(e) => {
          if (e.key === "Escape") leave(null);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      ref={(el) => {
        control.current = el;
      }}
      className={className}
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      inputMode={kind === "digits" ? "numeric" : undefined}
      onChange={(e) =>
        // 日本語入力の変換中は、触らない(変換が壊れる)。確定後(onCompositionEnd)に、除く
        setDraft(
          kind === "digits" && !(e.nativeEvent as InputEvent).isComposing
            ? sanitizeDigits(e.target.value)
            : e.target.value
        )
      }
      onCompositionEnd={(e) => {
        if (kind === "digits") setDraft(sanitizeDigits(e.currentTarget.value));
      }}
      onBlur={() => leave(confirmedDraft())}
      onKeyDown={(e) => {
        // 変換の確定の Enter では、保存の確定にしない(Enter は、2回になる)
        if (e.key === "Enter" && !e.nativeEvent.isComposing) leave(confirmedDraft());
        else if (e.key === "Escape") leave(null);
      }}
    />
  );
}
```

- [x] **Step 5: 部品のテストが通ることを確認し、コミットする**

Run: `cd frontend && npx vitest run src/components/InlineEditField.test.tsx && npx tsc --noEmit`
Expected: すべて PASS、型チェックにエラー無し。

```bash
git add frontend/src/components/InlineEditField.tsx frontend/src/components/InlineEditField.test.tsx
git commit -m "feat(ui): add the click-to-edit field component (AIDDS-19)"
```
(末尾に、Global Constraints の2行を付ける。)

- [x] **Step 6: 既存テストを、新しい操作に直す(この時点では、失敗する)**

`WatchlistTable.test.tsx` と `WatchlistPage.test.tsx` に、ヘルパーを足し、入力欄を触るテストを、直す:

```tsx
// 入力欄は、ラベルにフォーカスして、編集に入ってから触る(クリックでも、Tab でも、同じ)
function openField(label: string): HTMLElement {
  fireEvent.focus(screen.getByLabelText(label));
  return screen.getByLabelText(label);
}
```

直し方(パターンごと。範囲は、`npx vitest run` で落ちるテストを洗い出して確定する):

- **値の表示を確かめるもの**(`toHaveValue`): 編集に入る前のラベルは、`toHaveTextContent` で確かめる。空は「—」、選択式の未設定は「未選択」。
  ```tsx
  expect(screen.getByLabelText("6758の会社名")).toHaveTextContent("ソニーグループ");
  expect(screen.getByLabelText("7203の会社名")).toHaveTextContent("—");
  expect(screen.getByLabelText("6758のグループ")).toHaveTextContent("未選択");
  expect(screen.getByLabelText("6758の売却価格(予定)")).toHaveTextContent("3300");
  ```
- **入力欄の属性**(`placeholder`): 編集に入った入力欄で確かめる。
  ```tsx
  expect(openField("7203の会社名")).toHaveAttribute("placeholder", "7203");
  ```
- **入力して、blur・Enter で確定するもの**: `getByLabelText` を、`openField` に替える。それ以外は、そのまま。
  ```tsx
  const input = openField("7203の購入金額");
  fireEvent.change(input, { target: { value: "2900" } });
  fireEvent.blur(input);
  ```
- **グループ・預かり区分のセレクトボックス**: `openField` で、編集に入り、`fireEvent.change` で選ぶ(選ぶと、確定する)。選択肢の文言は、「未選択」(`getByRole("option", { name: "未選択" })`)。
- **入力の途中の値を、行の更新で巻き戻さないことを確かめるもの**: 編集に入ったまま、`rerender` して、`toHaveValue` で確かめる(編集中は、入力欄のまま)。
- **文字を打つテストが有れば**: 数字だけを使う(文字は、入らなくなったため)。

追加するテスト(`WatchlistTable.test.tsx`):

```tsx
it("does not call onSavePosition when a field is opened and closed without a change", () => {
  const props = renderTable();

  const input = openField("7203の購入金額");
  fireEvent.blur(input);

  expect(props.onSavePosition).not.toHaveBeenCalled();
});

it("lets only half-width digits into the buy price", () => {
  renderTable();

  const input = openField("7203の購入金額");
  fireEvent.change(input, { target: { value: "ab１2.5-3" } });

  expect(input).toHaveValue("253");
});

it("shows the unselected group and category as 未選択", () => {
  renderTable();

  expect(screen.getByLabelText("7203のグループ")).toHaveTextContent("未選択");
  expect(screen.getByLabelText("7203の預かり区分")).toHaveTextContent("未選択");
});
```
(`renderTable()` は、既存のヘルパー。`7203` は、グループ・預かり区分が未設定の行。)

`WatchlistPage.test.tsx` の、AIDDK-4 で足した「保存後に、読み込み時の値へ戻すと、再び保存される」テストは、`fireEvent.change(select, …)` の前に、`openField` で編集に入る形に直す(選ぶたびに、ラベルに戻るため、2回目も、`openField` から)。

行のテスト(保存の失敗で、ラベルが戻る)を、`WatchlistPage.test.tsx` に足す:

```tsx
it("shows the value before the save again when saving the position fails", async () => {
  vi.mocked(trendsApi.fetchTrends).mockResolvedValue([sampleTrend]);
  vi.mocked(trendPricesApi.updateTrendPrice).mockRejectedValue(new Error("保存に失敗しました"));
  renderPage();
  await screen.findByLabelText("7203の購入金額");

  const input = openField("7203の購入金額");
  fireEvent.change(input, { target: { value: "2900" } });
  fireEvent.blur(input);

  expect(await screen.findByText("保存に失敗しました")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText("7203の購入金額")).toHaveTextContent("—"));
});
```
(`renderPage()` は、このファイルにある既存のヘルパー。)

Run: `cd frontend && npx vitest run src/components/WatchlistTable.test.tsx src/components/WatchlistPage.test.tsx`
Expected: FAIL(行が、まだ、入力欄を出しているため。ラベルの表示を確かめるテストなどが、落ちる)。

- [x] **Step 7: `WatchlistRow` を、部品に置き換える**

`frontend/src/components/WatchlistRow.tsx`:

- `import { InlineEditField } from "./InlineEditField";` を足す
- 次の状態と処理を、無くす: `name`・`buyPriceText`・`buyQuantityText`・`salePriceTargetText` の状態、`name` を同期する `useEffect`、`commitBuyPrice`・`commitBuyQuantity`・`commitSalePriceTarget`・`commitName`・`blurOnEnter`、`liveBuyPrice`・`liveBuyQuantity`
- `position` の状態と、`trend` の値からの同期の `useEffect` は、残す。次を足す:

```tsx
  // 保存に失敗したとき(行のエラーが出たとき)は、確定した値を、保存前の値(trend)に戻す
  useEffect(() => {
    if (error) setPosition(toPositionInput(trend));
  }, [error]);
```

- 処理を、次に置き換える:

```tsx
  const numberText = (n: number | null) => (n === null ? "" : String(n));
  const numberOrNull = (text: string) => (text === "" ? null : Number(text));

  const commitNumber = (field: "buy_price" | "buy_quantity" | "sale_price_target") => (text: string) =>
    savePositionIfChanged({ ...position, [field]: numberOrNull(text) });

  const commitName = (text: string) => {
    const trimmed = text.trim();
    if (trimmed !== trend.name) onSaveName(trend.code, trimmed);
  };

  const groupOptions = [
    { value: "", label: "未選択" },
    ...groups.map((g) => ({ value: String(g.id), label: g.name })),
  ];
  const categoryOptions = BUY_CATEGORY_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }));

  const pnl =
    position.buy_price !== null && position.buy_quantity !== null
      ? (trend.price_at_fetch - position.buy_price) * position.buy_quantity
      : null;
```
(`handleGroupChange` と `handleCategoryChange` は、残す。)

- 行の中身を、次に置き換える(6つ。ほかの列は、そのまま):

```tsx
      <td className="minor-col">
        <InlineEditField
          label={`${trend.code}のグループ`}
          kind="select"
          className="group-select"
          value={selectedGroupId}
          options={groupOptions}
          onCommit={handleGroupChange}
        />
      </td>
      ...
      <td>
        <InlineEditField
          label={`${trend.code}の会社名`}
          kind="text"
          className="name-input"
          value={trend.name}
          placeholder={trend.code}
          onCommit={commitName}
        />
        {folded && error && (
          <span role="alert" className="inline-error">
            {error}
          </span>
        )}
      </td>
      ...
      <td className="minor-col">
        <InlineEditField
          label={`${trend.code}の預かり区分`}
          kind="select"
          className="group-select"
          value={String(position.buy_category)}
          options={categoryOptions}
          onCommit={handleCategoryChange}
        />
      </td>
      <td className="minor-col">
        <InlineEditField
          label={`${trend.code}の購入金額`}
          kind="digits"
          className="amount-input"
          value={numberText(position.buy_price)}
          onCommit={commitNumber("buy_price")}
        />
      </td>
      <td className="minor-col">
        <InlineEditField
          label={`${trend.code}の購入株数`}
          kind="digits"
          className="amount-input"
          value={numberText(position.buy_quantity)}
          onCommit={commitNumber("buy_quantity")}
        />
      </td>
      <td className="minor-col">
        <InlineEditField
          label={`${trend.code}の売却価格(予定)`}
          kind="digits"
          className="amount-input"
          value={numberText(position.sale_price_target)}
          onCommit={commitNumber("sale_price_target")}
        />
      </td>
```

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: すべて PASS、型チェックにエラー無し。

- [x] **Step 8: CSS を足し、コミットする**

`frontend/src/index.css` の、`.name-input { … }` の後に、足す:

```css
/* ラベル表示+クリックで編集(InlineEditField)。表示のボタンと、編集欄は、同じクラスで、同じ幅・高さにする */
.watchlist-table .inline-edit-view,
.watchlist-table .amount-input,
.watchlist-table .group-select,
.watchlist-table .name-input {
  box-sizing: border-box;
  height: 34px;
}

.watchlist-table .group-select {
  width: 120px;
}

.inline-edit-view {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  font-family: inherit;
  cursor: text;
}

.inline-edit-view.amount-input {
  text-align: right;
}

.inline-edit-view:hover {
  border-color: var(--text-muted);
}
```
(ボタンには、`.amount-input`・`.group-select`・`.name-input` の、枠線・背景・文字色・余白も、そのまま掛かる。)

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: すべて PASS、型チェックにエラー無し。

```bash
git add frontend/src
git commit -m "feat(watchlist): show the holdings inputs as labels that turn into inputs on click (AIDDS-19)"
```
(末尾に、Global Constraints の2行を付ける。)

- [x] **Step 9: 実機スモークテスト**(動いているスタックは止めない。作業ツリーの Vite を、別のポートで起動し、動いているバックエンドに向ける)

```
cd frontend && VITE_API_BASE_URL=http://localhost:8000 npx vite --port 5190 --strictPort
```
Playwright で、`http://localhost:5190/` を、幅1500pxで、ライト・ダークの両方で確認する。試験データ(6208 と 1301 の、グループ・購入金額など)は、始める前に控え、終わったら、PATCH で戻す。

1. **ラベル表示**: 6つの項目が、枠線つきのラベル(`button`)で出る。入力欄(`input`・`select`)は、出ていない。空の会社名・数値は「—」、グループ・預かり区分の未設定は「未選択」。
2. **編集へ入る(クリック)**: 数値欄をクリックすると、`input` に替わり、フォーカスが当たる。blur で、値が変わっていれば、保存され(`GET /trends` で確かめる)、ラベルに戻る。
3. **セレクトボックス**: グループをクリックすると、リストが開く(`showPicker`)。選ぶと、保存され、ラベルに戻る。2回目に、最初の値へ戻しても、保存される(AIDDK-4 のとおり)。
4. **Tab**: 数値欄で Tab を押すと、確定して、次の項目が、編集に入る。Shift+Tab でも、壊れない。
5. **Esc**: 打った値を捨てて、ラベルに戻り、`GET /trends` の値が、変わっていない。
6. **数値欄の制限**: `ab１2.5-3` を打つと、`253` だけが入る(Playwright の `fill` / `type`)。
7. **幅・高さ**: 各項目で、ラベル(`button`)と、編集欄の、`getBoundingClientRect()` の幅・高さが同じ(誤差 1px 以内)。ちがえば、CSS を直す。行の高さと、列の位置が、編集の前後で、変わらない。
8. **長い会社名**: 長い名前が、枠の幅で、省略記号で切れる。編集に入ると、全体が見える(スクロールできる)。
9. **保存の失敗**: バックエンドの、保存の API を、止められないので、テストで確かめる(Step 7)。実機では、確かめない。
10. **日本語入力(ユーザーに確認してもらう)**: 会社名で、日本語を、変換して、確定の Enter(変換が確定するだけ)と、保存の Enter(保存される)の、2回になること。数値欄で、日本語入力がオンのとき、全角の数字が、入らないこと。

確認が済んだら、Vite を止め、試験データを戻す。スクリーンショット(ライト・ダーク)を、ユーザーに見せる。

- [x] **Step 10: 設計書と実装の食い違いを見直す**

06 に追記した節(AIDDS-19)の、対象・表示・編集へ入る・数値欄の入力・確定と保存・アクセシビリティが、実装と合っているかを、確かめる。食い違いがあれば、設計書の追記を直す(元の本文は、書き換えない)。

- [x] **Step 11: 自己レビューと遷移**

テスト(フロント・型チェック)、差分、画面の確認結果を見直す。問題があれば直す。問題が無ければ、AIDDS-19 の状態を「レビュー」に変える。報告する。

---

## 追記: AIDDS-20 の確認してほしい点(2026-10-19)

上の計画(Task 1〜9)の実装後に、AIDDS-20 が、AIDDS-9 の子になった。エピックごとに、計画書は1本なので、別の計画書にせず、この計画書に、Task 10(AIDDS-20)を足す。

1. **親エピックと設計書**(確認済み): 親は AIDDS-9。設計書は、新しく作らず、`docs/design/01-watchlist-foundation.md` の末尾に、「追記: アプリ名の変更(AIDDS-20)」を、計画書より先に、追記した(本体)。`02-history-market-analysis.md` は、本文を書き換えず、先頭に「追記の一覧」を新設して、1行(読み替えと、01 を指す)。仕様は、そこと Jira(AIDDS-20 の説明欄)に有り、この計画書には、書き写さない。
2. **ADR**(作らない): 名前の選択は、理由と、採らなかった案が、設計書の追記に収まる(`adr.md` の、「設計書の追記に収まるか」の線)。理由と、採らなかった案は、01 の追記に書いた。
3. **実装の順番**: Task 10 のみ。
4. **私が選んだ既定(確認してほしい)**:
   1. **変える範囲**: 旧名を、コードで検索した結果(`frontend/src`、`frontend/index.html`、`backend/app`)の、4か所のみ。画面の見出し、タブの題、API の題、既存のテスト1件。リポジトリ名、コンテナ名、識別子は、名前を含まないので、変えない。
   2. **API の題**: 「トレンド羅針盤 API」(いまの「株価羅針盤 API」の、名前の部分だけを替える)。
   3. **API の題のテスト**: バックエンドに、題を確かめるテストを、1件足す(`backend/tests/test_main.py`)。これまで、題を確かめるテストが無く、画面の名前のテストと対になるため。
   4. **`CLAUDE.md`**: 設計書でなく、見取り図なので、直接、書き換えた(済み)。
   5. **過去の計画書**: 旧名は、そのまま(この計画書の Task 1 の引用も、`archive/` も)。
   6. **実機確認の進め方**: フロントエンドの変更は、動いているスタックを止めず、作業ツリーの Vite を、別のポート(5190)で起動し、動いているバックエンド(8000)に向ける。API の題は、バックエンドのテスト(`/openapi.json` の `info.title`)で確かめる(動いているバックエンドは、旧いコードのため、実機では、確かめない)。

## 追記分の Global Constraints

上の Global Constraints に加えて、次を守る。

- 名前は、「トレンド羅針盤」(「トレンド」はカタカナ、「羅針盤」は漢字)。API の題は、「トレンド羅針盤 API」
- 変えるのは、旧名を含む、4か所(画面の見出し、タブの題、API の題、テスト1件)だけ。ほかの表示・動作は、変えない
- 承認済みの設計書の元の本文は、書き換えない。追記だけ(追記済み)。`docs/brainstorming-intake.md` は、更新しない
- 本物のClaude・J-Quants・yfinanceを、テストで呼ばない
- コミットメッセージの末尾に、次の2行を付ける: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` と `Claude-Session: https://claude.ai/code/session_01XwQxse2Z3wwkbMnpg1F2cJ`
- 作業ブランチは `feature/20261019`(既に有る。PR #13 が開いている)。push・マージ・PRは、この計画に含めない

## 追記分の Review Focus

1. **旧名の取りこぼし**: `frontend/src`、`frontend/index.html`、`backend/app`、各テストに、「株価羅針盤」が、残っていない。→ Task 10 の検索の手順。
2. **タブの題**: `index.html` の `<title>` が、新しい名になる。→ 実機の確認(`document.title`)。
3. **API の題**: `/openapi.json` の `info.title` が、「トレンド羅針盤 API」。→ バックエンドのテスト。
4. **見出しの検索を使うテスト**: 見出しの名前で、要素を探すテスト(`App.test.tsx`)が、新しい名で通る。ほかのテストが、旧名に依存していない。→ 全テストの実行。

## 追記分の実装の順番と理由

Task 10(AIDDS-20)のみ。Task 内の順番は、「docs のコミット → 失敗するテスト → 実装 → 全テスト → 実機確認 → 見直し」。

### Task 10: アプリ名を、「株価羅針盤」から、「トレンド羅針盤」に変更する (AIDDS-20)

**Files:**
- Modify: `frontend/src/components/WatchlistPage.tsx`(見出し)
- Modify: `frontend/index.html`(タブの題)
- Modify: `backend/app/main.py`(API の題)
- Modify(テスト): `frontend/src/App.test.tsx`(見出しの名前)、`backend/tests/test_main.py`(API の題のテストを足す)
- Modify(済み): `CLAUDE.md`(アプリ名の行)、`docs/design/01-watchlist-foundation.md`・`docs/design/02-history-market-analysis.md`(追記)

**Interfaces:**
- Consumes: なし
- Produces: なし(表示の文言のみ)

- [x] **Step 1: 設計書・計画書・`CLAUDE.md` を、コミットする(docs のコミット)**

ユーザーが、この計画書を了承した後に行う(了承されたコミットの範囲)。

```bash
git add docs/design/01-watchlist-foundation.md docs/design/02-history-market-analysis.md docs/superpowers/plans/2026-10-01-AIDDS-9-feature-improvement-202610-01.md CLAUDE.md
git commit -m "docs(design): add the AIDDS-20 app rename spec and the plan (AIDDS-20)"
```
(末尾に、Global Constraints の2行を付ける。)

- [x] **Step 2: 失敗するテストを書く**

`frontend/src/App.test.tsx` の、見出しの名前を、新しい名に直す:

```tsx
    expect(await screen.findByRole("heading", { name: "トレンド羅針盤" })).toBeInTheDocument();
```

`backend/tests/test_main.py` の末尾に、足す:

```python
def test_openapi_title_is_the_app_name():
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert response.json()["info"]["title"] == "トレンド羅針盤 API"
```

Run: `cd frontend && npx vitest run src/App.test.tsx` と、`cd backend && source .venv/bin/activate && python -m pytest tests/test_main.py -v`
Expected: どちらも FAIL(旧名のまま)。

- [x] **Step 3: 名前を変える**

- `frontend/src/components/WatchlistPage.tsx`: `<h1>株価羅針盤</h1>` を `<h1>トレンド羅針盤</h1>` に
- `frontend/index.html`: `<title>株価羅針盤</title>` を `<title>トレンド羅針盤</title>` に
- `backend/app/main.py`: `app = FastAPI(title="株価羅針盤 API")` を `app = FastAPI(title="トレンド羅針盤 API")` に

旧名の取りこぼしを、検索で確かめる:

Run: `grep -rn "株価羅針盤" frontend/src frontend/index.html backend/app backend/tests`
Expected: 出力なし(コード・テストに、旧名が残っていない)。

- [x] **Step 4: 全テストを実行して、通ることを確認し、コミットする**

Run: `cd frontend && npx vitest run && npx tsc --noEmit` と、`cd backend && source .venv/bin/activate && python -m pytest tests/ -q`
Expected: すべて PASS、型チェックにエラー無し。

```bash
git add frontend/src/components/WatchlistPage.tsx frontend/index.html backend/app/main.py frontend/src/App.test.tsx backend/tests/test_main.py
git commit -m "feat(app): rename the app from 株価羅針盤 to トレンド羅針盤 (AIDDS-20)"
```
(末尾に、Global Constraints の2行を付ける。)

- [x] **Step 5: 実機スモークテスト**(動いているスタックは止めない。作業ツリーの Vite を、別のポートで起動し、動いているバックエンドに向ける)

```
cd frontend && VITE_API_BASE_URL=http://localhost:8000 npx vite --port 5190 --strictPort
```
Playwright で、`http://localhost:5190/` を、幅1500pxで確認する。

1. **見出し**: 一覧の見出し(`h1`)が、「トレンド羅針盤」。
2. **タブの題**: `document.title` が、「トレンド羅針盤」。
3. **ほかの表示が、変わっていない**: 見出しの周りのレイアウト(ヘッダの高さ、右側の操作)が、変わらない(旧名と、字数が1字違い。折り返さないこと)。ライト・ダークの両方。
4. **詳細画面など**: `/trends/<コード>` と `/screening` の見出し・ヘッダに、旧名が出ていない。

確認が済んだら、Vite を止める。スクリーンショット(見出しの周りのみ)を、ユーザーに見せる。

- [x] **Step 6: 設計書と実装の食い違いを見直す**

01 に追記した節(AIDDS-20)の、変わる所(画面の見出し・タブの題・API の題)と、範囲外が、実装と合っているかを、確かめる。食い違いがあれば、追記を直す(元の本文は、書き換えない)。

- [x] **Step 7: 自己レビューと遷移**

テスト(フロント・型チェック・バックエンド)、差分、画面の確認結果を見直す。問題があれば直す。問題が無ければ、AIDDS-20 の状態を「レビュー」に変える。報告する。

## 追記: AIDDS-21 の確認してほしい点(2026-10-22)

上の計画(Task 1〜10)の実装後に、AIDDS-21 が、AIDDS-9 の子になった。エピックごとに、計画書は1本なので、別の計画書にせず、この計画書に、Task 11(AIDDS-21)を足す。

1. **親エピックと設計書**(確認済み): 親は AIDDS-9。設計書は、作らない・追記しない(あなたの指示)。アプリの仕様ではなく、ひな形の運用ファイルを取り込む作業のため。取り込む内容は、ひな形のファイルそのもので、Jira(AIDDS-21 の説明欄)に有り、この計画書には、書き写さない。
2. **ADR**(作らない): 判断が分かれる点は、無かった。決まった点(下の 4・5)は、`adr.md` の「設計書の追記に収まるか」の線の内側(単一プロジェクトの運用の取り込み)。
3. **実装の順番**: Task 11 のみ。
4. **あなたが決めた点**(確認済み):
   1. **`TEMPLATE_VERSION` は、更新する**。
   2. **「ルール」節の `TEMPLATE_VERSION` の行**は、「README 参照」を「ひな形の README 参照」に直して入れる。この行以外は、ひな形の文のまま。
   3. **「Git管理」の節**は、ひな形の文のまま入れる。
   4. **`.mcp.json`** は、ひな形のまま入れる(RAG の繋ぎ先 `http://127.0.0.1:8000/mcp` が、backend のポート 8000 と重なる件は、扱わない。あなたの指示)。
5. **私が選んだ既定(確認してほしい)**:
   1. **`TEMPLATE_VERSION` の値**: `commit: 78cb1b2`、`date: 2026-10-19`、`dirty: no`。実際に照合したのは、ひな形の作業ブランチ `feature/20261019` の先頭(78cb1b2)。取り込む3つのファイル(`CLAUDE.md` の該当部分を除く `rag.md`・`.mcp.json`)は、`origin/develop` の先頭(29f0b75、2026-10-21)とも内容が同じ。ただし、78cb1b2 は、ひな形の PR #23 が未マージのため、`develop` には、まだ無い。マージ後に、コミットの番号が変わる(マージコミットが入る)ので、そのときは、値を直す必要が出うる。
   2. **`TEMPLATE_VERSION` の注記**: 「後付け」の注記は、今回の取り込みに合わせて、書き直す(「コピー元の commit は不明。上記は、AIDDS-21 の取り込みで、ひな形と照合した時点の commit」)。
   3. **`CLAUDE.md` の追加の位置**: 「ルール」節では、`rag.md` の行を、`adr.md` の行の次に、`TEMPLATE_VERSION` の行を、「独自ルール」の行の次に足す(ひな形と同じ並び)。「.claude配下の役割」と「Git管理」の節は、ファイルの末尾に足す(ひな形と同じく、「アーキテクチャ」の後)。
   4. **確かめ方**: コードを変えないので、テストと実機のスモークテストは、行わない。ひな形との差分、JSON の構文、リンクで確かめる。
   5. **コミット**: 2つに分ける。計画書の追記(`docs`)と、取り込み(`docs(rules)`)。
   6. **初回の起動**: `.mcp.json` を足すと、次に Claude Code を開いたとき、プロジェクトの MCP サーバー(`rag`)の承認を、求められる。

## 追記分の Global Constraints

上の Global Constraints に加えて、次を守る。

- 取り込むのは、`.claude/rules/rag.md`、`.mcp.json`、`CLAUDE.md` の追加分、`.claude/TEMPLATE_VERSION` の更新だけ。ほかのファイルは、変えない
- `rag.md` と `.mcp.json` は、ひな形(`../aidd-template-claude`)の、`78cb1b2` 時点のファイルを、そのまま複製する。手で書き直さない
- `CLAUDE.md` に足す文は、ひな形の文のまま。変えるのは、`TEMPLATE_VERSION` の行の「README 参照」→「ひな形の README 参照」の1か所だけ
- `CLAUDE.md` の既存の記述(プロジェクト概要、ビルド・テスト・起動、アーキテクチャ)は、変えない
- 承認済みの設計書の元の本文は、書き換えない(今回は、設計書に触れない)
- コミットメッセージの末尾に、次の2行を付ける: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` と `Claude-Session: https://claude.ai/code/session_01JmF3mPe3e1oHPVVskpBRrQ`
- 作業ブランチは `feature/20261019`(既に有る)。push・マージ・PRは、この計画に含めない

## 追記分の Review Focus

1. **ひな形との一致**: `rag.md`・`.mcp.json` が、ひな形と同一。`CLAUDE.md` に足した節が、ひな形の該当部分と同一(「README 参照」の1行を除く)。→ Task 11 の差分の確認。
2. **既存の記述の保全**: `CLAUDE.md` の、プロジェクト概要・ビルド・テスト・起動・アーキテクチャが、変わっていない。→ `git diff` が、追加行のみ(削除行が無い)。
3. **リンクの切れ**: 足した文が指す先(`.claude/rules/rag.md`、`.claude/TEMPLATE_VERSION`、`docs/decisions/`、`docs/design/`)が、すべて存在する。
4. **JSON の構文**: `.mcp.json` が、正しい JSON。

## 追記分の実装の順番と理由

Task 11(AIDDS-21)のみ。Task 内の順番は、「計画書のコミット → ファイルの複製 → `CLAUDE.md` の追記 → `TEMPLATE_VERSION` の更新 → 確認 → コミット → 見直し」。複製を先にするのは、`CLAUDE.md` が指す先を、先に存在させるため。

### Task 11: ひな形の運用ファイルを、trend-compass に取り込む (AIDDS-21)

**Files:**
- Create: `.claude/rules/rag.md`、`.mcp.json`(ひな形から複製)
- Modify: `CLAUDE.md`(「ルール」節に2行、末尾に2節)、`.claude/TEMPLATE_VERSION`
- Modify: この計画書(本節)

**Interfaces:**
- Consumes: ひな形 `../aidd-template-claude` の `.claude/rules/rag.md`、`.mcp.json`、`CLAUDE.md`(`78cb1b2` 時点)
- Produces: なし(運用ファイルのみ。アプリのコードは変えない)

- [x] **Step 1: 計画書を、コミットする(docs のコミット)**

ユーザーが、この計画書を了承した後に行う(了承されたコミットの範囲)。

```bash
git add docs/superpowers/plans/2026-10-01-AIDDS-9-feature-improvement-202610-01.md
git commit -m "docs(plans): add the AIDDS-21 plan (AIDDS-21)"
```
(末尾に、Global Constraints の2行を付ける。)

- [x] **Step 2: ひな形が、照合した時点であることを確かめて、2つのファイルを複製する**

```bash
git -C ../aidd-template-claude rev-parse --short HEAD
git -C ../aidd-template-claude status --short
cp ../aidd-template-claude/.claude/rules/rag.md .claude/rules/rag.md
cp ../aidd-template-claude/.mcp.json .mcp.json
diff -q ../aidd-template-claude/.claude/rules/rag.md .claude/rules/rag.md
diff -q ../aidd-template-claude/.mcp.json .mcp.json
```
Expected: 先頭のコマンドが `78cb1b2`、2つ目が出力なし(ひな形に未コミットの変更が無い)、`diff -q` が出力なし(同一)。`78cb1b2` でないとき、またはひな形に未コミットの変更が有るときは、作業を止めて、ユーザーに聞く。

- [x] **Step 3: `CLAUDE.md` の「ルール」節に、2行を足す**

`adr.md` の行(`- 判断の記録(ADR): ...`)の次に、足す:

```
- 過去の判断の引き当て(RAG)の規則: `.claude/rules/rag.md`
```

「独自ルール」の行(`- このプロジェクト独自のルール: ...`)の次に、足す:

```
- どの時点のひな形からコピーしたかは、`.claude/TEMPLATE_VERSION` に記す(コピー時に書く。ひな形の README 参照)
```

- [x] **Step 4: `CLAUDE.md` の末尾に、2つの節を足す**

ひな形の「.claude配下の役割」(表を含む)と「Git管理」の節を、ひな形の `CLAUDE.md` から、そのまま写す。位置は、ファイルの末尾(「横断的UI基盤」の後)。

```bash
awk '/^## \.claude配下の役割/{f=1} f' ../aidd-template-claude/CLAUDE.md > /tmp/claude-0/-home-user/232a5fb4-52d3-5473-bc63-773709ece3ee/scratchpad/import-sections.md
```
末尾の空行を1行にして、`CLAUDE.md` の末尾に、空行1つを挟んで足す。削除行が出ないことを、`git diff` で確かめる。

- [x] **Step 5: `.claude/TEMPLATE_VERSION` を更新する**

```
source: aidd-template-claude
commit: 78cb1b2
date: 2026-10-19
dirty: no
# 後付け: 実際のコピー元commitは不明。上記は、AIDDS-21 の取り込みで、ひな形と照合した時点のひな形のcommit(コピー元ではなく、照合時点)。ひな形の PR #23 のマージ後は、commit の番号が変わりうる。
```

- [x] **Step 6: 確認する**

```bash
# 1. ひな形との差分(.claude 配下は、TEMPLATE_VERSION のみが差分になる)
diff -rq ../aidd-template-claude/.claude .claude | grep -v 'agent-memory\|settings.local'
diff -q ../aidd-template-claude/.mcp.json .mcp.json
# 2. 足した節が、ひな形と同一
diff <(awk '/^## \.claude配下の役割/{f=1} f' ../aidd-template-claude/CLAUDE.md) <(awk '/^## \.claude配下の役割/{f=1} f' CLAUDE.md)
# 3. 既存の記述が、変わっていない(削除行が無い)
git diff --numstat CLAUDE.md
git diff CLAUDE.md | grep -c '^-[^-]'
# 4. JSON の構文
python3 -c "import json; json.load(open('.mcp.json'))"
# 5. 足した文が指す先が、存在する
ls .claude/rules/rag.md .claude/TEMPLATE_VERSION docs/decisions docs/design > /dev/null
```
Expected: 1 は `TEMPLATE_VERSION` の1件のみ、2 は出力なし、3 の numstat は追加行のみ(削除 0)で、`grep -c` が `0`、4・5 はエラー無し。

- [x] **Step 7: コミットする(取り込みのコミット)**

```bash
git add .claude/rules/rag.md .mcp.json CLAUDE.md .claude/TEMPLATE_VERSION
git commit -m "docs(rules): import the template's RAG rule, .mcp.json and CLAUDE.md sections (AIDDS-21)"
```
(末尾に、Global Constraints の2行を付ける。)

- [x] **Step 8: 見直しと遷移**

差分と、Step 6 の結果を見直す。問題があれば直す。問題が無ければ、AIDDS-21 の状態を「レビュー」に変える。報告する(確認した内容と、残った点として、ひな形の PR #23 のマージ後に `TEMPLATE_VERSION` の commit を直す要否)。
