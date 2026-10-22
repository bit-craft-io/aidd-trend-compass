import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IntervalSelect } from "./IntervalSelect";

describe("IntervalSelect", () => {
  it("calls onChange with the selected interval as a number", () => {
    const onChange = vi.fn();
    render(<IntervalSelect interval={1} onChange={onChange} onRefresh={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("更新間隔"), { target: { value: "5" } });

    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("calls onRefresh when the update button is clicked", () => {
    const onRefresh = vi.fn();
    render(<IntervalSelect interval={1} onChange={vi.fn()} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole("button", { name: "更新" }));

    expect(onRefresh).toHaveBeenCalled();
  });
});
