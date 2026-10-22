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

    client = anthropic.Anthropic(
        api_key=os.environ.get("ANTHROPIC_API_KEY"),
        timeout=30.0,
        max_retries=1,
    )
    response = client.messages.create(
        model=MODEL,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
    raw_text = response.content[0].text.strip()

    analyzed = json.loads(raw_text)
    if not isinstance(analyzed, list):
        raise ValueError(f"Claude APIの返却がJSON配列でない: {type(analyzed).__name__}")

    for parsed in analyzed:
        if not isinstance(parsed, dict):
            raise ValueError(f"Claude API返却の要素がJSONオブジェクトでない: {type(parsed).__name__}")

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
