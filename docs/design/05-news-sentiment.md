# doc-spec: 詳細画面-ニュース/センチメント(機能C)

## 機能概要

詳細画面に、対象銘柄に関する最新ニュース(見出し・センチメント判定・掲載時刻)を表示する。
機能A(基盤+一覧画面)・機能B(履歴/市場分析)・機能B拡張(足種切替+テクニカル指標)に続く、
企画当初から予定されていた3つ目の業務機能(`docs/brainstorming-intake.md`参照)。

見出しの取得元はyfinance(`Ticker.news`)、日本語要約・センチメント判定はClaude API
(Haiku系モデル)を用いる。配置は承認済みモックアップ通り、詳細画面の履歴データ/市場分析
2カラムグリッドの下に、全幅の「最新ニュース」カードを追加する形。
モックアップ: https://claude.ai/artifact/FbL6RBf5wKMUe3FXhgDJo2

## 実装背景

`docs/brainstorming-intake.md`に企画当初から記載されていた機能。取得元・実装詳細は
「改善の段にて再検討する」とされていたため、機能A〜機能B拡張の完了後、改めて
brainstormingを実施した。事前のspike(`yfinance.Ticker(code).news`の実データ確認、
7203/6758/9984で検証)により、以下が判明している:

- 銘柄あたり安定して10件取得できる(yfinance内部の固定上限)
- 見出し(`title`)・要約(`summary`)・掲載時刻(`pubDate`, ISO8601)・元記事URL
  (`canonicalUrl`)が取得できる
- **見出し・要約は全て英語**。既存アプリの文言(所見等)は日本語のみのため、
  日本語化が必要
- 対象銘柄との関連度はyfinance側の判定に依存し、やや緩い(グループ会社・投資先
  絡みの記事等も混じる)。今回はyfinanceの判定をそのまま採用し、追加のフィルタリング
  は行わない

## 影響・対象範囲

- 対象:
  - backend: `yfinance_client.py`(ニュース取得関数追加)、`news_service.py`(新規、
    Claude APIによる日本語要約+センチメント判定)、`trend_service.py`(`_build_detail`
    拡張)、`requirements.txt`(`anthropic`追加)、`docker-compose.yml`/`.env.example`
    (`ANTHROPIC_API_KEY`追加)
  - frontend: `types.ts`(`NewsItem`型追加)、`NewsSection.tsx`(新規)、`index.css`
    (センチメントpill用トークン追加)、`DetailPage.tsx`
- 対象外: 一覧画面、機能A/B/機能B拡張の既存ロジック、アラート・経済カレンダー
  (`docs/brainstorming-intake.md`の別途検討事項)

## ゴール

- 詳細画面の履歴データ/市場分析カードの下に、全幅の「最新ニュース」カードが表示される
- 各ニュースは、日本語要約された見出し・センチメントラベル(ポジティブ/中立/ネガティブ)・
  掲載時刻を1行で表示する(モックアップ通り)
- ニュース取得・Claude APIによるセンチメント判定は、既存の`raw_candles`/`sector_label`/
  `macro_candles`と同じく「更新」「コード入力し取得」のタイミングでのみ実行する。
  詳細画面の表示・足種切替・指標ON/OFFでは、yfinance・Claude APIとも一切呼び出さない
  (既存の不変条件をそのまま維持する)
- ニュース取得・センチメント判定に失敗しても、銘柄の取得・所見表示・履歴データ・
  市場分析の表示自体は妨げられない

## 対象外

- 対象銘柄との関連度によるフィルタリング(yfinanceが返す10件をそのまま採用)
- ニュース見出しの原文(英語)表示(日本語要約のみを表示、対象外リストは無いが
  UIには出さない方針)
- センチメント判定結果の手動訂正・フィードバック機能
- ニュース既読管理・通知
- アラート・経済カレンダー(別途、前提を詰めた上で別doc-specとして扱う)

## 解決策・技術アーキテクチャ

### 全体構成

生データ(`raw_candles`)・業種ラベル(`sector_label`)・マクロ系列(`macro_candles`)と
同じ方針を踏襲する。「更新」「コード入力し取得」のタイミングでyfinanceからニュース
生データを1回取得し、Claude API(Haiku系モデル)へ全件バッチで問い合わせ、日本語要約+
センチメント判定結果を`trend.detail["news"]`へ保存する。`GET /trends/{code}`
(足種切替・指標ON/OFF・詳細画面表示を含む)は保存済みデータのみを返し、yfinance・
Claude APIともに一切呼び出さない。

```
[refresh/create]
yfinance.Ticker(code).news(10件、英語)
        ↓
news_service.summarize_and_analyze()
Claude API(Haiku)へ全件バッチ問い合わせ → 日本語要約+センチメント判定
        ↓
trend.detail["news"] = [{headline, sentiment, url, published_at}, ...]

[GET /trends/{code}]
保存済み trend.detail["news"] をそのまま返す(yfinance/Claude API呼出し無し)
```

### backend

#### `yfinance_client.py`(改修)

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

- `ticker.news`が空リストを返す場合は空リストのまま返す(`InvalidCodeError`は送出しない。
  ニュース0件は銘柄コード不正とは別の状態のため)
- yfinance呼出し自体が失敗した場合のみ`InvalidCodeError`を送出する(既存関数と同じ
  パターン)

#### `news_service.py`(新規)

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

- `json.loads`が失敗する(Claude APIがJSON以外を返す)場合は`json.JSONDecodeError`
  (`ValueError`のサブクラス)がそのまま呼び出し元(`trend_service._build_detail`)へ
  伝播し、既存の「該当セクションのみ保存されない」パターンで吸収される
- 件数不一致時も同様に`ValueError`を送出し、部分的に不整合なデータを保存しない
- APIキーは`ANTHROPIC_API_KEY`環境変数から読む(`anthropic.Anthropic()`のデフォルト
  動作でも環境変数を自動参照するが、本doc-specでは明示的に渡す形で統一する)

#### `trend_service.py`(改修)

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


def _build_detail(code: str, macro_cache: dict | None = None) -> dict:
    try:
        raw_candles = get_intraday_history(code)
    except Exception:
        logger.warning("failed to fetch intraday history for %s", code, exc_info=True)
        return {}

    if not raw_candles:
        return {}

    detail: dict = {"raw_candles": raw_candles}

    try:
        detail["sector_label"] = get_industry_label(code)
    except Exception:
        logger.warning("failed to fetch industry label for %s", code, exc_info=True)

    try:
        cache = {} if macro_cache is None else macro_cache
        detail["macro_candles"] = {
            "index": _cached_macro_fetch("^N225", cache),
            "us10y": _cached_macro_fetch("^TNX", cache),
            "usdjpy": _cached_macro_fetch("JPY=X", cache),
        }
    except Exception:
        logger.warning("failed to fetch macro series for %s", code, exc_info=True)

    try:
        raw_news = get_news(code)
        detail["news"] = summarize_and_analyze(code, raw_news)
    except Exception:
        logger.warning("failed to fetch/analyze news for %s", code, exc_info=True)

    return detail
```

(`_cached_macro_fetch`は既存のまま無変更。`raw_candles`/`sector_label`/`macro_candles`の
3ブロックは機能B拡張で実装済みの既存コードそのもの、ニュース取得ブロックのみが今回の追加分)

- 既存の`raw_candles`/`sector_label`/`macro_candles`取得ブロックの後に追加する
  (`raw_candles`が取得できなかった場合は関数が早期return するため、ニュース取得
  ブロックへは到達しない。これは既存の挙動と同じ)
- `build_detail_view`(読み取り専用の組立て関数)は`stored_detail.get("news", [])`を
  そのまま`view["news"]`へ渡すだけで良い(加工不要、yfinance/Claude API呼出し無し)。
  `build_detail_view`の末尾、`return view`の直前に以下を追加する:

```python
    view["news"] = stored_detail.get("news", [])

    return view
```

#### `requirements.txt`

```
anthropic==1.6.0
```

#### `docker-compose.yml` / `.env.example`

`docker-compose.yml`の`backend`サービスの`environment`へ追加:

```yaml
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
```

`.env.example`へ追加:

```
ANTHROPIC_API_KEY=
```

実際のキーはユーザー自身が`.env`(gitignore対象)へ設定する。未設定時は`ANTHROPIC_API_KEY`
が空文字列になり、`anthropic.Anthropic(api_key="")`呼出し自体が失敗する想定
(→`news_service.summarize_and_analyze`内で例外→`_build_detail`側の既存try/exceptで
吸収され、`detail["news"]`が保存されないだけで他のデータ取得・保存は妨げられない)。

#### `routers/trends.py` / `schemas.py`

変更不要。`GET /trends/{code}`は既に`trend_service.build_detail_view`の返り値を
そのまま`detail`として返す構造になっており、`view["news"]`を追加するだけで
自動的にレスポンスへ含まれる。

### frontend

#### `types.ts`(改修)

```typescript
export type Sentiment = "positive" | "neutral" | "negative";

export interface NewsItem {
  headline: string;
  sentiment: Sentiment;
  url: string;
  published_at: string;
}
```

`HistoryDetail`とは別に、`TrendDetail.detail`へ`news?: NewsItem[]`を追加する
(`history`/`market_analysis`と並ぶ3つ目のトップレベルキー)。

#### `index.css`(改修)

センチメントpill用のトークンを追加する(モックアップで使用した配色をそのまま採用)。

> 日本式の配色に合わせ、ポジティブのpillは赤(`--up-bg`/`--up-text`)、ネガティブのpillは
> 緑(`--down-bg`/`--down-text`)に変えた(09参照)。下の`--pill-red-*`/`--pill-green-*`は、
> 削除ボタンなどのために残している。

```css
:root {
  /* 既存トークンに追加 */
  --pill-green-bg: #e6f4ea;
  --pill-green-text: #1e7e34;
  --pill-neutral-bg: #eef0f3;
  --pill-neutral-text: #55606e;
}

:root[data-theme="dark"] {
  --pill-green-bg: #16301f;
  --pill-green-text: #6fd88a;
  --pill-neutral-bg: #262c39;
  --pill-neutral-text: #9aa3b2;
}
```

(`--pill-red-bg`/`--pill-red-text`は既存トークンをそのまま流用する)

#### `NewsSection.tsx`(新規)

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

`index.css`へ以下を追加する(モックアップのレイアウトに準拠):

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

`.detail-card`は既存クラスをそのまま流用する(カード自体の背景・枠線・角丸等は
`NewsSection`の`className="detail-card news-section"`で既存スタイルを継承する)。

#### `DetailPage.tsx`(改修)

`.detail-grid`の直後、`NewsSection`を全幅で追加する:

```tsx
<div className="detail-grid">
  {/* 既存の履歴データ・市場分析カード */}
</div>
<NewsSection news={trend.detail.news} />
```

### エラー処理

- `get_news`失敗(yfinance側エラー): `InvalidCodeError`を送出、`_build_detail`の
  try/exceptでログのみ出力、`detail["news"]`は保存されない
- `ticker.news`が空リスト: エラーではなく正常系。`detail["news"] = []`として保存され、
  フロントは「ニュースは今のところ取得できていません」を表示する
- Claude API呼出し失敗(APIキー未設定・レート制限・タイムアウト等)、JSON解析失敗、
  返却件数不一致: いずれも`summarize_and_analyze`内で例外が送出され、
  `_build_detail`の既存try/exceptで吸収、`detail["news"]`は保存されない
  (raw_candles/sector_label/macro_candlesの保存・所見表示は妨げられない)
- 詳細画面で`detail.news`が`undefined`または`[]`の場合、「ニュースは今のところ
  取得できていません。」を表示する(既存の履歴データ/市場分析の未取得表示と同じ文言パターン)

### テスト方針

- backend:
  - `yfinance_client.get_news`: `ticker.news`のモック(spike時の実データ構造を模した
    フィクスチャ)から、`title`/`summary`/`published_at`/`url`を正しく抽出することを
    検証。`content`に`title`が無い項目はスキップされることも確認
  - `news_service.summarize_and_analyze`: `anthropic.Anthropic`のクライアントをモックし、
    (1) 正常なJSON配列が返る場合に正しくパースされること、(2) 返却件数が入力と
    不一致の場合`ValueError`を送出すること、(3) `sentiment`が想定外の値の場合
    `"neutral"`にフォールバックすることを検証
  - `trend_service._build_detail`: `get_news`/`summarize_and_analyze`いずれかが
    例外を送出しても、`raw_candles`等の他のデータ保存は妨げられないことを確認する
    既存パターンの回帰テスト
  - API: `GET /trends/{code}`のレスポンスに`detail.news`が含まれることを確認
    (既存の`history`/`market_analysis`と同様のテストパターン)
- frontend:
  - `NewsSection`: `news`が`undefined`/空配列/データありの3パターンで表示分岐を確認。
    センチメントごとに異なるpillクラスが付与されることを確認
  - `DetailPage`: `detail.news`が存在する場合に`NewsSection`が描画されることを確認
