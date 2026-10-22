import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroupFilter } from "./GroupFilter";
import type { ComponentProps } from "react";

const groups = [
  { id: 1, name: "成長株" },
  { id: 2, name: "配当株" },
];

function renderFilter(overrides = {}) {
  const props = {
    groups,
    filterGroupId: null,
    onApplyFilter: vi.fn(),
    ...overrides,
  };
  const { rerender } = render(<GroupFilter {...props} />);
  return {
    ...props,
    rerender: (nextOverrides: Partial<ComponentProps<typeof GroupFilter>>) =>
      rerender(<GroupFilter {...props} {...nextOverrides} />),
  };
}

describe("GroupFilter", () => {
  it("calls onApplyFilter with the selected group id when the filter button is clicked", () => {
    const props = renderFilter();

    fireEvent.change(screen.getByLabelText("グループ絞込"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "絞込" }));

    expect(props.onApplyFilter).toHaveBeenCalledWith(1);
  });

  it("does not apply the filter just from changing the select, only the button click", () => {
    const props = renderFilter();

    fireEvent.change(screen.getByLabelText("グループ絞込"), { target: { value: "1" } });

    expect(props.onApplyFilter).not.toHaveBeenCalled();
  });

  it("calls onApplyFilter with null when 'すべて' is selected", () => {
    const props = renderFilter({ filterGroupId: 1 });

    fireEvent.change(screen.getByLabelText("グループ絞込"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "絞込" }));

    expect(props.onApplyFilter).toHaveBeenCalledWith(null);
  });

  it("falls back to すべて when the selected group disappears from the groups list", () => {
    const props = renderFilter();

    fireEvent.change(screen.getByLabelText("グループ絞込"), { target: { value: "1" } });
    expect(screen.getByLabelText("グループ絞込")).toHaveValue("1");

    // Group 1 was deleted elsewhere, so it's no longer in `groups`.
    props.rerender({ groups: [{ id: 2, name: "配当株" }] });

    expect(screen.getByLabelText("グループ絞込")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "絞込" }));

    expect(props.onApplyFilter).toHaveBeenCalledWith(null);
  });
});
