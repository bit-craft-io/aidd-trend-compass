import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Perspectives, Trend } from "../types";
import { PerspectivesPanel } from "./PerspectivesPanel";

const trend: Trend = {
  id: 1,
  code: "7203",
  name: "トヨタ自動車",
  opinion: "",
  price_at_fetch: 2900,
  created_at: "2026-10-01T00:00:00Z",
  trend_group_id: null,
  buy_category: 0,
  buy_price: null,
  buy_quantity: null,
};

const perspectives: Perspectives = {
  buy: "終値は2900で、上昇の途中と読めます。",
  sell: "終値は2900で、高値圏にあるとも読めます。",
  keep: "終値は2900で、様子を見る見方もあります。",
  created_at: "2026-10-01T16:43:00+09:00",
};

describe("PerspectivesPanel", () => {
  it("shows the heading, the three perspectives and the created time", () => {
    render(<PerspectivesPanel trend={trend} state="done" perspectives={perspectives} />);

    expect(screen.getByRole("heading", { name: "7203 トヨタ自動車" })).toBeInTheDocument();
    expect(screen.getByText("買い目線で見ると")).toBeInTheDocument();
    expect(screen.getByText("売り目線で見ると")).toBeInTheDocument();
    expect(screen.getByText("キープ(様子見)の目線で見ると")).toBeInTheDocument();
    expect(screen.getByText(perspectives.buy)).toBeInTheDocument();
    expect(screen.getByText(perspectives.sell)).toBeInTheDocument();
    expect(screen.getByText(perspectives.keep)).toBeInTheDocument();
    const created = new Date(perspectives.created_at).toLocaleString("ja-JP");
    expect(screen.getByText(`作成: ${created}`)).toBeInTheDocument();
  });

  it("shows the disclaimer that this is reference information", () => {
    render(<PerspectivesPanel trend={trend} state="loading" perspectives={null} />);

    expect(screen.getByText("断定的な見解ではなく、参考情報として掲載")).toBeInTheDocument();
  });

  it("shows a progress text while building", () => {
    render(<PerspectivesPanel trend={trend} state="loading" perspectives={null} />);

    expect(screen.getByText("作成中...")).toBeInTheDocument();
    expect(screen.queryByText("買い目線で見ると")).not.toBeInTheDocument();
  });

  it("shows the failure message as an alert", () => {
    render(
      <PerspectivesPanel
        trend={trend}
        state="error"
        perspectives={null}
        error="AIの読み方は今のところ取得できていません"
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("AIの読み方は今のところ取得できていません");
    expect(screen.queryByText("作成中...")).not.toBeInTheDocument();
  });

  it("has no close button", () => {
    render(<PerspectivesPanel trend={trend} state="done" perspectives={perspectives} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
