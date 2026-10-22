import { useState } from "react";
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

function formatPublishedAt(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function NewsSection({ news }: NewsSectionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="detail-card news-section">
      <div className={expanded ? "news-header news-header-open" : "news-header"}>
        <h2>最新ニュース</h2>
        <button
          type="button"
          className="btn btn-dark"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "閉じる" : "開\u3000く"}
        </button>
      </div>
      {expanded && (
        <>
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
                  <span className="news-time">{formatPublishedAt(item.published_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p>ニュースは今のところ取得できていません。</p>
          )}
        </>
      )}
    </section>
  );
}
