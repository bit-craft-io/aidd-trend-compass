# 詳細画面-ニュース/センチメント(機能C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 詳細画面に、対象銘柄の最新ニュース(日本語要約された見出し・センチメント・掲載時刻)を表示する。

**Architecture:** 「更新」「コード入力し取得」のタイミングでyfinanceからニュース生データを取得し、Claude API(Haiku)へ全件バッチで問い合わせ日本語要約+センチメント判定した結果を`trend.detail["news"]`へ保存する。`GET /trends/{code}`(詳細画面表示・足種切替・指標ON/OFFを含む)は保存済みデータのみを返し、yfinance・Claude APIとも一切呼び出さない(既存の`raw_candles`/`sector_label`/`macro_candles`と同じ不変条件)。

**Tech Stack:** FastAPI, yfinance, anthropic(backend) / React, TypeScript(frontend)

**Spec:** [docs/design/05-news-sentiment.md](../../design/05-news-sentiment.md)

## Global Constraints

- yfinance・Claude API呼出しは`create_trend`/`refresh_trends`の2箇所のみに限定する。`GET /trends/{code}`はいかなる場合もyfinance・Claude APIへ問い合わせない
- ニュース取得・センチメント判定は`raw_candles`/`sector_label`/`macro_candles`と同様、独立してtry/exceptし、失敗しても他のデータ保存・所見表示は妨げられない
- `ticker.news`が空リストの場合はエラーではなく正常系(`detail["news"] = []`)として扱う
- Claude APIへの問い合わせは1銘柄につき1回のバッチ呼出しで行う(記事ごとの個別呼出しはしない)
- センチメント判定は`positive`/`neutral`/`negative`の3値、想定外の値は`"neutral"`にフォールバックする
- Claude APIモデルは`claude-haiku-4-5-20251001`を使用する
- APIキーは`ANTHROPIC_API_KEY`環境変数から読む(ユーザーが`.env`へ設定する前提)
- コミットメッセージ末尾のtrailerは`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`の1行のみ

---

### Task 1: `yfinance_client.get_news`

**Files:**
- Modify: `backend/app/yfinance_client.py`
- Test: `backend/tests/test_yfinance_client.py`

**Interfaces:**
- Produces: `get_news(code: str) -> list[dict]`。返り値は`[{"title": .., "summary": .., "published_at": .., "url": ..}, ...]`

- [ ] **Step 1: 失敗するテストを書く**

```python
def test_get_news_extracts_title_summary_time_url(monkeypatch):
    items = [
        {
            "content": {
                "title": "Toyota raises full-year forecast",
                "summary": "Toyota Motor raised its earnings outlook.",
                "pubDate": "2026-09-18T03:47:37Z",
                "canonicalUrl": {"url": "https://example.com/article-1"},
            }
        },
        {
            "content": {
                "title": "Sector Update: Auto stocks rise",
                "summary": "",
                "pubDate": "2026-09-17T08:38:43Z",
                "canonicalUrl": {"url": "https://example.com/article-2"},
            }
        },
    ]
    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: FakeNewsTicker(items))

    news = yfinance_client.get_news("7203")

    assert news == [
        {
            "title": "Toyota raises full-year forecast",
            "summary": "Toyota Motor raised its earnings outlook.",
            "published_at": "2026-09-18T03:47:37Z",
            "url": "https://example.com/article-1",
        },
        {
            "title": "Sector Update: Auto stocks rise",
            "summary": "",
            "published_at": "2026-09-17T08:38:43Z",
            "url": "https://example.com/article-2",
        },
    ]


def test_get_news_skips_items_without_title(monkeypatch):
    items = [
        {"content": {"title": "", "summary": "x", "pubDate": "2026-09-18T00:00:00Z", "canonicalUrl": {"url": "https://example.com/x"}}},
        {"content": {"title": "Valid headline", "summary": "y", "pubDate": "2026-09-17T00:00:00Z", "canonicalUrl": {"url": "https://example.com/y"}}},
    ]
    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: FakeNewsTicker(items))

    news = yfinance_client.get_news("7203")

    assert len(news) == 1
    assert news[0]["title"] == "Valid headline"


def test_get_news_returns_empty_list_when_no_news(monkeypatch):
    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: FakeNewsTicker([]))

    assert yfinance_client.get_news("7203") == []


def test_get_news_wraps_unexpected_exception(monkeypatch):
    class RaisingTicker:
        @property
        def news(self):
            raise RuntimeError("boom")

    monkeypatch.setattr(yfinance_client.yf, "Ticker", lambda symbol: RaisingTicker())

    with pytest.raises(yfinance_client.InvalidCodeError):
        yfinance_client.get_news("7203")
```

これを`backend/tests/test_yfinance_client.py`の末尾へ追記する。ファイル冒頭付近(既存の`FakeTicker`クラス定義の近く)に以下のヘルパークラスも追加する:

```python
class FakeNewsTicker:
    def __init__(self, items):
        self.news = items
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_yfinance_client.py -v`
Expected: FAIL(`get_news`未定義)

- [ ] **Step 3: 実装**

`backend/app/yfinance_client.py`の末尾(`_to_yf_symbol`の直前)に追加:

```python
def get_news(code: str) -> list[dict]:
    symbol = _to_yf_symbol(code)
    try:
        ticker = yf.Ticker(symbol)
        items = ticker.news
    except Exception as exc:
        raise InvalidCodeError(code) from exc

    news = []
    for item in items:
        content = item.get("content", {})
        title = content.get("title")
        if not title:
            continue
        news.append(
            {
                "title": title,
                "summary": content.get("summary") or "",
                "published_at": content.get("pubDate") or "",
                "url": (content.get("canonicalUrl") or {}).get("url") or "",
            }
        )
    return news
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_yfinance_client.py -v`
Expected: PASS(既存テストも含め全件)

- [ ] **Step 5: コミット**

```bash
cd backend && git add app/yfinance_client.py tests/test_yfinance_client.py
git commit -m "feat(backend): add get_news to fetch raw headlines from yfinance"
```

---

### Task 2: `news_service.py`(新規) + 依存・環境変数追加

**Files:**
- Create: `backend/app/news_service.py`
- Test: `backend/tests/test_news_service.py`
- Modify: `backend/requirements.txt`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: なし(`news_items`は`{"title": .., "summary": .., "published_at": .., "url": ..}`形状のlistを直接受け取る、Task1の`get_news`と同じ形)
- Produces: `summarize_and_analyze(code: str, news_items: list[dict]) -> list[dict]`。返り値は
  `[{"headline": .., "sentiment": "positive"|"neutral"|"negative", "url": .., "published_at": ..}, ...]`

- [ ] **Step 1: 依存追加**

`backend/requirements.txt`へ追記:

```
anthropic==1.6.0
```

Run: `cd backend && source .venv/bin/activate && pip install anthropic==1.6.0`

- [ ] **Step 2: `docker-compose.yml`/`.env.example`更新**

`docker-compose.yml`の`backend`サービスの`environment`ブロックへ1行追加
(既存の`DATABASE_URL`の下):

```yaml
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
```

`.env.example`の末尾へ追記:

```
ANTHROPIC_API_KEY=
```

- [ ] **Step 3: 失敗するテストを書く**

```python
import json
from unittest.mock import MagicMock

import pytest

from app import news_service

NEWS_ITEMS = [
    {"title": "Toyota raises forecast", "summary": "Positive earnings news.", "published_at": "2026-09-18T03:47:37Z", "url": "https://example.com/1"},
    {"title": "Sector stocks fall on rate fears", "summary": "Negative market news.", "published_at": "2026-09-17T08:38:43Z", "url": "https://example.com/2"},
]


def _fake_anthropic_client(response_text):
    client = MagicMock()
    message = MagicMock()
    message.content = [MagicMock(text=response_text)]
    client.messages.create.return_value = message
    return client


def test_summarize_and_analyze_returns_empty_list_for_no_news():
    assert news_service.summarize_and_analyze("7203", []) == []


def test_summarize_and_analyze_parses_valid_json_response(monkeypatch):
    response_text = json.dumps(
        [
            {"headline_ja": "トヨタ、業績見通しを上方修正", "sentiment": "positive"},
            {"headline_ja": "金利懸念でセクター株が下落", "sentiment": "negative"},
        ]
    )
    fake_client = _fake_anthropic_client(response_text)
    monkeypatch.setattr(news_service.anthropic, "Anthropic", lambda api_key: fake_client)

    result = news_service.summarize_and_analyze("7203", NEWS_ITEMS)

    assert result == [
        {
            "headline": "トヨタ、業績見通しを上方修正",
            "sentiment": "positive",
            "url": "https://example.com/1",
            "published_at": "2026-09-18T03:47:37Z",
        },
        {
            "headline": "金利懸念でセクター株が下落",
            "sentiment": "negative",
            "url": "https://example.com/2",
            "published_at": "2026-09-17T08:38:43Z",
        },
    ]


def test_summarize_and_analyze_raises_when_count_mismatches(monkeypatch):
    response_text = json.dumps([{"headline_ja": "見出しのみ1件", "sentiment": "neutral"}])
    fake_client = _fake_anthropic_client(response_text)
    monkeypatch.setattr(news_service.anthropic, "Anthropic", lambda api_key: fake_client)

    with pytest.raises(ValueError):
        news_service.summarize_and_analyze("7203", NEWS_ITEMS)


def test_summarize_and_analyze_falls_back_to_neutral_for_unknown_sentiment(monkeypatch):
    response_text = json.dumps(
        [
            {"headline_ja": "見出し1", "sentiment": "unknown_value"},
            {"headline_ja": "見出し2", "sentiment": "positive"},
        ]
    )
    fake_client = _fake_anthropic_client(response_text)
    monkeypatch.setattr(news_service.anthropic, "Anthropic", lambda api_key: fake_client)

    result = news_service.summarize_and_analyze("7203", NEWS_ITEMS)

    assert result[0]["sentiment"] == "neutral"
    assert result[1]["sentiment"] == "positive"


def test_summarize_and_analyze_raises_on_invalid_json(monkeypatch):
    fake_client = _fake_anthropic_client("this is not json")
    monkeypatch.setattr(news_service.anthropic, "Anthropic", lambda api_key: fake_client)

    with pytest.raises(ValueError):
        news_service.summarize_and_analyze("7203", NEWS_ITEMS)
```

これを`backend/tests/test_news_service.py`として新規作成する。

- [ ] **Step 4: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_news_service.py -v`
Expected: FAIL(`news_service`モジュール未定義)

- [ ] **Step 5: 実装**

`backend/app/news_service.py`を新規作成:

```python
import json
import logging
import os

import anthropic

logger = logging.getLogger(__name__)

MODEL = "claude-haiku-4-5-20251001"

PROMPT_TEMPLATE = """以下は{code}という銘柄に関する英語ニュース記事の一覧です。
各記事について、日本語で1文(40字程度)に要約した見出しと、
市場センチメント(positive/neutral/negative のいずれか1つ)を判定してください。

断定的な株価予測(「上がる」「下がる」等)ではなく、記事の内容・論調そのものを
客観的に要約・分類してください。

出力は以下のJSON配列の形式のみとし、他の文章は一切含めないでください。
入力と同じ順序・同じ件数で出力してください。

[{{"headline_ja": "...", "sentiment": "positive|neutral|negative"}}, ...]

記事一覧:
{articles}
"""


def summarize_and_analyze(code: str, news_items: list[dict]) -> list[dict]:
    if not news_items:
        return []

    articles_text = "\n\n".join(
        f"{i + 1}. タイトル: {item['title']}\n   要約: {item['summary']}"
        for i, item in enumerate(news_items)
    )
    prompt = PROMPT_TEMPLATE.format(code=code, articles=articles_text)

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    response = client.messages.create(
        model=MODEL,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
    raw_text = response.content[0].text.strip()

    analyzed = json.loads(raw_text)
    if len(analyzed) != len(news_items):
        raise ValueError(
            f"Claude APIの返却件数({len(analyzed)})が入力件数({len(news_items)})と一致しない"
        )

    results = []
    for item, parsed in zip(news_items, analyzed):
        sentiment = parsed.get("sentiment")
        if sentiment not in ("positive", "neutral", "negative"):
            sentiment = "neutral"
        results.append(
            {
                "headline": parsed.get("headline_ja") or item["title"],
                "sentiment": sentiment,
                "url": item["url"],
                "published_at": item["published_at"],
            }
        )
    return results
```

- [ ] **Step 6: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_news_service.py -v`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
cd . && git add backend/app/news_service.py backend/tests/test_news_service.py backend/requirements.txt docker-compose.yml .env.example
git commit -m "feat(backend): add news_service for Claude API headline summarization and sentiment"
```

(このコミットはリポジトリルートから実行する。`docker-compose.yml`/`.env.example`が
`backend/`配下でなくルート直下にあるため)

---

### Task 3: `trend_service.py`統合 + `conftest.py`更新

**Files:**
- Modify: `backend/app/trend_service.py`
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/test_trend_service.py`
- Modify: `backend/tests/test_trends_api.py`

**Interfaces:**
- Consumes: `get_news`(Task1)、`summarize_and_analyze`(Task2)
- Produces: `_build_detail`が`detail["news"]`を追加保存、`build_detail_view`が
  `view["news"]`を追加返却(既存関数のシグネチャ自体は無変更)

- [ ] **Step 1: `conftest.py`のautouseスタブを更新**

`backend/tests/conftest.py`の`_stub_price_history`フィクスチャへ2行追加:

```python
@pytest.fixture(autouse=True)
def _stub_price_history(monkeypatch):
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: [])
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: [])
    monkeypatch.setattr(trend_service, "get_news", lambda code: [])
    monkeypatch.setattr(trend_service, "summarize_and_analyze", lambda code, items: [])
```

- [ ] **Step 2: `test_trend_service.py`に新規テストを追加**

以下のテストを`backend/tests/test_trend_service.py`の末尾へ追記する
(ファイル冒頭は`from datetime import datetime, timedelta`・`from app import market_analysis_service, trend_service`・`import pytest`が既にある前提、追加import不要):

```python
def test_create_trend_stores_news(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    raw_candles = [
        {"datetime": "2026-09-18T09:00:00+09:00", "open": 99.0, "high": 101.0, "low": 98.0, "close": 100.0, "volume": 1000}
    ]
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "Auto Manufacturers")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: [{"close": 100.0}])
    raw_news = [{"title": "Toyota news", "summary": "s", "published_at": "2026-09-18T00:00:00Z", "url": "https://example.com/1"}]
    monkeypatch.setattr(trend_service, "get_news", lambda code: raw_news)
    monkeypatch.setattr(
        trend_service,
        "summarize_and_analyze",
        lambda code, items: [{"headline": "トヨタ関連ニュース", "sentiment": "neutral", "url": "https://example.com/1", "published_at": "2026-09-18T00:00:00Z"}],
    )

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.detail["news"] == [
        {"headline": "トヨタ関連ニュース", "sentiment": "neutral", "url": "https://example.com/1", "published_at": "2026-09-18T00:00:00Z"}
    ]


def test_create_trend_keeps_raw_candles_when_news_fetch_fails(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    raw_candles = [
        {"datetime": "2026-09-18T09:00:00+09:00", "open": 99.0, "high": 101.0, "low": 98.0, "close": 100.0, "volume": 1000}
    ]
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)

    def raise_error(code):
        raise RuntimeError("yfinance news unreachable")

    monkeypatch.setattr(trend_service, "get_news", raise_error)

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.detail["raw_candles"] == raw_candles
    assert "news" not in trend.detail


def test_create_trend_keeps_raw_candles_when_sentiment_analysis_fails(db_session, monkeypatch):
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    raw_candles = [
        {"datetime": "2026-09-18T09:00:00+09:00", "open": 99.0, "high": 101.0, "low": 98.0, "close": 100.0, "volume": 1000}
    ]
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)
    monkeypatch.setattr(trend_service, "get_news", lambda code: [{"title": "x", "summary": "y", "published_at": "z", "url": "u"}])

    def raise_error(code, items):
        raise ValueError("Claude API returned invalid JSON")

    monkeypatch.setattr(trend_service, "summarize_and_analyze", raise_error)

    trend = trend_service.create_trend(db_session, "7203")

    assert trend.detail["raw_candles"] == raw_candles
    assert "news" not in trend.detail


def test_build_detail_view_includes_news_from_stored_detail():
    stored_detail = {
        "raw_candles": [
            {"datetime": "2026-08-24T09:00:00+09:00", "open": 99.0, "high": 102.0, "low": 98.0, "close": 100.0, "volume": 1000}
        ],
        "news": [{"headline": "見出し", "sentiment": "positive", "url": "https://example.com/1", "published_at": "2026-08-24T00:00:00Z"}],
    }

    view = trend_service.build_detail_view(stored_detail, "1d", [])

    assert view["news"] == stored_detail["news"]


def test_build_detail_view_returns_empty_news_list_when_not_stored():
    stored_detail = {
        "raw_candles": [
            {"datetime": "2026-08-24T09:00:00+09:00", "open": 99.0, "high": 102.0, "low": 98.0, "close": 100.0, "volume": 1000}
        ],
    }

    view = trend_service.build_detail_view(stored_detail, "1d", [])

    assert view["news"] == []
```

- [ ] **Step 3: `test_trends_api.py`に新規テストを追加**

以下を`backend/tests/test_trends_api.py`の末尾へ追記する(ファイル冒頭に既存の
`_make_raw_candles`ヘルパーがある前提、追加定義不要):

```python
def test_get_trend_detail_includes_news(client, monkeypatch):
    raw_candles = _make_raw_candles()
    monkeypatch.setattr(
        trend_service, "get_quote", lambda code: {"name": "トヨタ自動車", "price": 2900.0}
    )
    monkeypatch.setattr(trend_service, "get_intraday_history", lambda code: raw_candles)
    monkeypatch.setattr(trend_service, "get_industry_label", lambda code: "Auto Manufacturers")
    monkeypatch.setattr(trend_service, "get_price_history", lambda ticker: [{"close": 100.0}])
    monkeypatch.setattr(
        trend_service, "get_news", lambda code: [{"title": "t", "summary": "s", "published_at": "p", "url": "u"}]
    )
    monkeypatch.setattr(
        trend_service,
        "summarize_and_analyze",
        lambda code, items: [{"headline": "見出し", "sentiment": "positive", "url": "u", "published_at": "p"}],
    )

    client.post("/trends", json={"code": "7203"})

    response = client.get("/trends/7203")

    assert response.status_code == 200
    detail = response.json()["detail"]
    assert detail["news"] == [{"headline": "見出し", "sentiment": "positive", "url": "u", "published_at": "p"}]
```

- [ ] **Step 4: テストが失敗することを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trend_service.py tests/test_trends_api.py -v`
Expected: FAIL(`get_news`/`summarize_and_analyze`が`trend_service`に無い、`news`キー未実装)

- [ ] **Step 5: 実装**

`backend/app/trend_service.py`のimport文を以下で置き換える:

```python
from .news_service import summarize_and_analyze
from .yfinance_client import (
    InvalidCodeError,
    get_industry_label,
    get_intraday_history,
    get_news,
    get_price_history,
    get_quote,
)
```

`_build_detail`関数の`macro_candles`取得ブロックの直後(`return detail`の直前)に
以下を追加:

```python
    try:
        raw_news = get_news(code)
        detail["news"] = summarize_and_analyze(code, raw_news)
    except Exception:
        logger.warning("failed to fetch/analyze news for %s", code, exc_info=True)
```

`build_detail_view`関数の`return view`の直前に以下を追加:

```python
    view["news"] = stored_detail.get("news", [])
```

- [ ] **Step 6: テストが通ることを確認**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/test_trend_service.py tests/test_trends_api.py -v`
Expected: PASS

- [ ] **Step 7: バックエンド全テストを実行**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/ -v`
Expected: 全件PASS(Task1〜2の変更も含め)

- [ ] **Step 8: コミット**

```bash
cd backend && git add app/trend_service.py tests/conftest.py tests/test_trend_service.py tests/test_trends_api.py
git commit -m "feat(backend): fetch and store news+sentiment at refresh/create time"
```

---

### Task 4: frontend `types.ts` + `index.css`トークン追加

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces: `Sentiment`型(`"positive" | "neutral" | "negative"`)、`NewsItem`型
  (`{headline, sentiment, url, published_at}`)、`TrendDetail.detail.news?: NewsItem[]`

- [ ] **Step 1: `types.ts`を更新**

`frontend/src/types.ts`の`TrendDetail`インターフェースを以下で置き換える
(それ以外の既存の型定義は無変更):

```typescript
export type Sentiment = "positive" | "neutral" | "negative";

export interface NewsItem {
  headline: string;
  sentiment: Sentiment;
  url: string;
  published_at: string;
}

export interface TrendDetail extends Trend {
  detail: {
    history?: HistoryDetail;
    market_analysis?: MarketAnalysisDetail;
    news?: NewsItem[];
  };
}
```

- [ ] **Step 2: `index.css`にセンチメントpill用トークンを追加**

`frontend/src/index.css`の`:root`ブロック(既存の`--pill-red-bg`等が定義されている
箇所の近く)へ追記:

```css
  --pill-green-bg: #e6f4ea;
  --pill-green-text: #1e7e34;
  --pill-neutral-bg: #eef0f3;
  --pill-neutral-text: #55606e;
```

`:root[data-theme="dark"]`ブロックへ追記:

```css
  --pill-green-bg: #16301f;
  --pill-green-text: #6fd88a;
  --pill-neutral-bg: #262c39;
  --pill-neutral-text: #9aa3b2;
```

- [ ] **Step 3: 型チェック**

Run: `cd frontend && npx tsc --noEmit`
Expected: エラー無し(この時点で`NewsSection`はまだ存在しないため、`types.ts`/`index.css`
自体にエラーが無いことのみ確認する)

- [ ] **Step 4: コミット**

```bash
cd frontend && git add src/types.ts src/index.css
git commit -m "feat(frontend): add NewsItem type and sentiment pill tokens"
```

---

### Task 5: `NewsSection.tsx`(新規)

**Files:**
- Create: `frontend/src/components/NewsSection.tsx`
- Test: `frontend/src/components/NewsSection.test.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `NewsItem`型(Task4)
- Produces: `<NewsSection news={NewsItem[] | undefined} />`

- [ ] **Step 1: 失敗するテストを書く**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NewsSection } from "./NewsSection";
import type { NewsItem } from "../types";

const sampleNews: NewsItem[] = [
  { headline: "トヨタ、業績見通しを上方修正", sentiment: "positive", url: "https://example.com/1", published_at: "2026-09-18T03:47:37Z" },
  { headline: "業界、半導体供給不安が再燃", sentiment: "negative", url: "https://example.com/2", published_at: "2026-09-17T11:05:00Z" },
  { headline: "国内販売台数、前年同月比横ばい", sentiment: "neutral", url: "https://example.com/3", published_at: "2026-09-17T09:20:00Z" },
];

describe("NewsSection", () => {
  it("shows a not-yet-available message when news is undefined", () => {
    render(<NewsSection news={undefined} />);

    expect(screen.getByText("ニュースは今のところ取得できていません。")).toBeInTheDocument();
  });

  it("shows a not-yet-available message when news is an empty array", () => {
    render(<NewsSection news={[]} />);

    expect(screen.getByText("ニュースは今のところ取得できていません。")).toBeInTheDocument();
  });

  it("renders one row per news item with headline, sentiment pill, and time", () => {
    render(<NewsSection news={sampleNews} />);

    expect(screen.getByText("トヨタ、業績見通しを上方修正")).toBeInTheDocument();
    expect(screen.getByText("ポジティブ")).toBeInTheDocument();
    expect(screen.getByText("ネガティブ")).toBeInTheDocument();
    expect(screen.getByText("中立")).toBeInTheDocument();
  });

  it("links each headline to its article url", () => {
    render(<NewsSection news={sampleNews} />);

    const link = screen.getByText("トヨタ、業績見通しを上方修正");
    expect(link.closest("a")).toHaveAttribute("href", "https://example.com/1");
  });

  it("applies a distinct pill class per sentiment", () => {
    render(<NewsSection news={sampleNews} />);

    expect(screen.getByText("ポジティブ")).toHaveClass("news-pill-positive");
    expect(screen.getByText("ネガティブ")).toHaveClass("news-pill-negative");
    expect(screen.getByText("中立")).toHaveClass("news-pill-neutral");
  });
});
```

これを`frontend/src/components/NewsSection.test.tsx`として新規作成する。

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/components/NewsSection.test.tsx`
Expected: FAIL(モジュール未定義)

- [ ] **Step 3: 実装**

`frontend/src/components/NewsSection.tsx`を新規作成:

```tsx
import type { NewsItem } from "../types";

interface NewsSectionProps {
  news: NewsItem[] | undefined;
}

const SENTIMENT_LABEL: Record<string, string> = {
  positive: "ポジティブ",
  neutral: "中立",
  negative: "ネガティブ",
};

const SENTIMENT_CLASS: Record<string, string> = {
  positive: "news-pill-positive",
  neutral: "news-pill-neutral",
  negative: "news-pill-negative",
};

export function NewsSection({ news }: NewsSectionProps) {
  return (
    <section className="detail-card news-section">
      <h2>最新ニュース</h2>
      <p className="news-disclaimer">断定的な見解ではなく、参考情報として掲載</p>
      {news && news.length > 0 ? (
        <div>
          {news.map((item, i) => (
            <div className="news-item" key={i}>
              <span className={`pill ${SENTIMENT_CLASS[item.sentiment]}`}>
                {SENTIMENT_LABEL[item.sentiment]}
              </span>
              <a className="news-headline" href={item.url} target="_blank" rel="noreferrer">
                {item.headline}
              </a>
              <span className="news-time">{item.published_at}</span>
            </div>
          ))}
        </div>
      ) : (
        <p>ニュースは今のところ取得できていません。</p>
      )}
    </section>
  );
}
```

`frontend/src/index.css`へ追記:

```css
.news-section {
  margin-top: 16px;
}

.news-disclaimer {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.news-item {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--row-border);
}

.news-item:last-child {
  border-bottom: none;
}

.news-headline {
  flex-grow: 1;
  font-size: 14px;
  color: var(--text);
  text-decoration: none;
}

.news-headline:hover {
  text-decoration: underline;
}

.news-time {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.pill {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
  white-space: nowrap;
}

.news-pill-positive {
  background: var(--pill-green-bg);
  color: var(--pill-green-text);
}

.news-pill-neutral {
  background: var(--pill-neutral-bg);
  color: var(--pill-neutral-text);
}

.news-pill-negative {
  background: var(--pill-red-bg);
  color: var(--pill-red-text);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd frontend && npx vitest run src/components/NewsSection.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd frontend && git add src/components/NewsSection.tsx src/components/NewsSection.test.tsx src/index.css
git commit -m "feat(frontend): add NewsSection component for headline/sentiment list"
```

---

### Task 6: `DetailPage.tsx`統合 + 最終検証

**Files:**
- Modify: `frontend/src/components/DetailPage.tsx`
- Modify: `frontend/src/components/DetailPage.test.tsx`

**Interfaces:**
- Consumes: `NewsSection`(Task5)

- [ ] **Step 1: 既存`DetailPage.test.tsx`の`sampleDetail`にnewsを追加、新規テストを追加**

`frontend/src/components/DetailPage.test.tsx`の`sampleDetail`オブジェクト内、
`detail: { history: {...}, market_analysis: {...} }`へ`news`キーを追加する:

```typescript
const sampleDetail = {
  id: 1,
  code: "7203",
  name: "トヨタ自動車",
  opinion: "初回取得、履歴データ無し",
  price_at_fetch: 2900,
  created_at: "2026-09-17T00:00:00Z",
  detail: {
    history: {
      candles: [{ time: "2026-08-24", open: 99, high: 101, low: 98, close: 100, volume: 1000 }],
      sma5: [{ time: "2026-08-24", value: 100 }],
      high_60d: 101,
      low_60d: 98,
      volume_change_pct: 5.0,
    },
    market_analysis: {
      sector_label: "Auto Manufacturers",
      relative_strength_5d_pt: 0.5,
      macro_correlation: { us10y: -0.31, usdjpy: 0.62 },
    },
    news: [
      { headline: "トヨタ、業績見通しを上方修正", sentiment: "positive", url: "https://example.com/1", published_at: "2026-09-18T03:47:37Z" },
    ],
  },
};
```

既存の`it("shows the chart, market analysis panel, and chart controls when detail data is available", ...)`テストの末尾に、以下のアサーションを追加する:

```typescript
    expect(screen.getByText("トヨタ、業績見通しを上方修正")).toBeInTheDocument();
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd frontend && npx vitest run src/components/DetailPage.test.tsx`
Expected: FAIL(`NewsSection`が描画されておらず見出しが見つからない)

- [ ] **Step 3: 実装**

`frontend/src/components/DetailPage.tsx`の先頭のimportへ1行追加:

```tsx
import { NewsSection } from "./NewsSection";
```

`.detail-grid`を閉じる`</div>`の直後、`</div>`(`.app-body`を閉じる直前)へ追加:

```tsx
        <NewsSection news={trend.detail.news} />
```

(既存の`<div className="detail-grid">...</div>`ブロックの直後、`.app-body`の
閉じタグの直前に配置する)

- [ ] **Step 4: テストが通ることを確認**

Run: `cd frontend && npx vitest run`
Expected: 全件PASS

- [ ] **Step 5: 型チェック**

Run: `cd frontend && npx tsc --noEmit`
Expected: エラー無し

- [ ] **Step 6: コミット**

```bash
cd frontend && git add src/components/DetailPage.tsx src/components/DetailPage.test.tsx
git commit -m "feat(frontend): wire NewsSection into DetailPage"
```

---

### Task 7: 最終検証(コード変更無し)

**Files:** なし(検証のみ)

- [ ] **Step 1: フロントエンド全テスト + 型チェック**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: 全件PASS、tscエラー無し

- [ ] **Step 2: バックエンド全テスト**

Run: `cd backend && source .venv/bin/activate && python -m pytest tests/ -v`
Expected: 全件PASS

- [ ] **Step 3: `ANTHROPIC_API_KEY`未設定時の劣化動作を確認**

`.env`に`ANTHROPIC_API_KEY`が未設定(または空)の状態で`docker compose up -d --build`し、
銘柄を新規取得する。バックエンドログに news/sentiment 取得失敗の警告が出ること、
かつ銘柄自体の取得・所見表示・履歴データ・市場分析は正常に機能することを確認する
(既存の部分失敗許容の設計通り)。

- [ ] **Step 4: 実データでの動作確認(任意、APIキー設定済みの場合)**

`ANTHROPIC_API_KEY`を実際に設定した状態で銘柄を取得し、詳細画面下部に日本語要約
された見出し・センチメントpill・掲載時刻が表示されることを確認する。Playwright等で
スクリーンショットを撮り、モックアップ(https://claude.ai/artifact/FbL6RBf5wKMUe3FXhgDJo2)
の配置と一致していることを確認する。

- [ ] **Step 5: ダークテーマでの表示確認**

右上の歯車アイコンからダークテーマに切り替え、ニュースセクション(pillの配色含む)が
崩れずに追従することを確認する。

この Task は verification のみでコード変更・コミットを行わない。
