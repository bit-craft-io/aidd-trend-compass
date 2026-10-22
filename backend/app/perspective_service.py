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

    metrics["取得期間の高値"] = _fmt(max(closes))
    metrics["取得期間の安値"] = _fmt(min(closes))
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
