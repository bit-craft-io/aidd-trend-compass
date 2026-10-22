import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Pager, pageNumbersToShow } from "./Pager";

function numberLabels(): string[] {
  return screen
    .getAllByRole("button")
    .map((b) => b.textContent ?? "")
    .filter((t) => /^\d+$/.test(t));
}

describe("pageNumbersToShow", () => {
  it("returns 1, the previous, the current, the next and the last page in ascending order", () => {
    expect(pageNumbersToShow(5, 10)).toEqual([1, 4, 5, 6, 10]);
  });

  it("keeps the numbers inside 1..last and drops duplicates", () => {
    expect(pageNumbersToShow(1, 1)).toEqual([1]);
    expect(pageNumbersToShow(1, 10)).toEqual([1, 2, 10]);
    expect(pageNumbersToShow(10, 10)).toEqual([1, 9, 10]);
    expect(pageNumbersToShow(2, 3)).toEqual([1, 2, 3]);
  });
});

describe("Pager", () => {
  it("shows just page 1 with prev and next disabled when there is one page", () => {
    render(<Pager currentPage={1} totalPages={1} onPageChange={vi.fn()} />);

    expect(numberLabels()).toEqual(["1"]);
    expect(screen.queryByText("…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "前のページ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "次のページ" })).toBeDisabled();
  });

  it("shows 1 … 4 5 6 … 10 for page 5 of 10", () => {
    render(<Pager currentPage={5} totalPages={10} onPageChange={vi.fn()} />);

    expect(numberLabels()).toEqual(["1", "4", "5", "6", "10"]);
    expect(screen.getAllByText("…")).toHaveLength(2);
  });

  it("does not put an ellipsis between consecutive page numbers", () => {
    render(<Pager currentPage={2} totalPages={10} onPageChange={vi.fn()} />);

    expect(numberLabels()).toEqual(["1", "2", "3", "10"]);
    expect(screen.getAllByText("…")).toHaveLength(1);
  });

  it("marks the current page as disabled with aria-current=page", () => {
    render(<Pager currentPage={5} totalPages={10} onPageChange={vi.fn()} />);

    const current = screen.getByRole("button", { name: "5" });
    expect(current).toBeDisabled();
    expect(current).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "4" })).not.toHaveAttribute("aria-current");
  });

  it("calls onPageChange with the page number that was clicked", () => {
    const onPageChange = vi.fn();
    render(<Pager currentPage={5} totalPages={10} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByRole("button", { name: "10" }));

    expect(onPageChange).toHaveBeenCalledWith(10);
  });

  it("calls onPageChange with page-1 and page+1 for prev and next", () => {
    const onPageChange = vi.fn();
    render(<Pager currentPage={5} totalPages={10} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByRole("button", { name: "前のページ" }));
    fireEvent.click(screen.getByRole("button", { name: "次のページ" }));

    expect(onPageChange).toHaveBeenNthCalledWith(1, 4);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 6);
  });

  it("disables prev on the first page and next on the last page", () => {
    const { rerender } = render(<Pager currentPage={1} totalPages={10} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "前のページ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "次のページ" })).toBeEnabled();

    rerender(<Pager currentPage={10} totalPages={10} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "前のページ" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "次のページ" })).toBeDisabled();
  });

  it("uses the shared pager classes instead of inline styles", () => {
    const { container } = render(<Pager currentPage={5} totalPages={10} onPageChange={vi.fn()} />);

    expect(container.querySelector(".pager")).not.toBeNull();
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((b) => {
      expect(b).toHaveClass("pager-button");
      expect(b.getAttribute("style")).toBeNull();
    });
    expect(container.querySelectorAll(".pager-arrow")).toHaveLength(2);
  });
});
