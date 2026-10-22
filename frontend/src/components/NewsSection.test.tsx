import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NewsSection } from "./NewsSection";
import type { NewsItem } from "../types";

const sampleNews: NewsItem[] = [
  { headline: "トヨタ、業績見通しを上方修正", sentiment: "positive", url: "https://example.com/1", published_at: "2026-09-18T03:47:37Z" },
  { headline: "業界、半導体供給不安が再燃", sentiment: "negative", url: "https://example.com/2", published_at: "2026-09-17T11:05:00Z" },
  { headline: "国内販売台数、前年同月比横ばい", sentiment: "neutral", url: "https://example.com/3", published_at: "2026-09-17T09:20:00Z" },
];

const NOT_AVAILABLE = "ニュースは今のところ取得できていません。";

function openSection() {
  fireEvent.click(screen.getByRole("button", { name: /開/ }));
}

describe("NewsSection", () => {
  it("is collapsed by default: only the heading and an open button are shown", () => {
    render(<NewsSection news={sampleNews} />);

    expect(screen.getByRole("heading", { name: "最新ニュース" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /開/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("トヨタ、業績見通しを上方修正")).not.toBeInTheDocument();
    expect(screen.queryByText("断定的な見解ではなく、参考情報として掲載")).not.toBeInTheDocument();
  });

  it("expands to show the disclaimer and the news when the open button is clicked", () => {
    render(<NewsSection news={sampleNews} />);

    openSection();

    expect(screen.getByRole("button", { name: "閉じる" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("断定的な見解ではなく、参考情報として掲載")).toBeInTheDocument();
    expect(screen.getByText("トヨタ、業績見通しを上方修正")).toBeInTheDocument();
  });

  it("collapses again when the close button is clicked", () => {
    render(<NewsSection news={sampleNews} />);

    openSection();
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(screen.getByRole("button", { name: /開/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("トヨタ、業績見通しを上方修正")).not.toBeInTheDocument();
  });

  it("hides the not-yet-available message while collapsed", () => {
    render(<NewsSection news={undefined} />);

    expect(screen.queryByText(NOT_AVAILABLE)).not.toBeInTheDocument();
  });

  it("shows a not-yet-available message when expanded and news is undefined", () => {
    render(<NewsSection news={undefined} />);

    openSection();

    expect(screen.getByText(NOT_AVAILABLE)).toBeInTheDocument();
  });

  it("shows a not-yet-available message when expanded and news is an empty array", () => {
    render(<NewsSection news={[]} />);

    openSection();

    expect(screen.getByText(NOT_AVAILABLE)).toBeInTheDocument();
  });

  it("renders one row per news item with headline, sentiment pill, and time", () => {
    render(<NewsSection news={sampleNews} />);

    openSection();

    expect(screen.getByText("トヨタ、業績見通しを上方修正")).toBeInTheDocument();
    expect(screen.getByText("ポジティブ")).toBeInTheDocument();
    expect(screen.getByText("ネガティブ")).toBeInTheDocument();
    expect(screen.getByText("中立")).toBeInTheDocument();
  });

  it("links each headline to its article url", () => {
    render(<NewsSection news={sampleNews} />);

    openSection();

    const link = screen.getByText("トヨタ、業績見通しを上方修正");
    expect(link.closest("a")).toHaveAttribute("href", "https://example.com/1");
  });

  it("applies a distinct pill class per sentiment", () => {
    render(<NewsSection news={sampleNews} />);

    openSection();

    expect(screen.getByText("ポジティブ")).toHaveClass("news-pill-positive");
    expect(screen.getByText("ネガティブ")).toHaveClass("news-pill-negative");
    expect(screen.getByText("中立")).toHaveClass("news-pill-neutral");
  });
});
