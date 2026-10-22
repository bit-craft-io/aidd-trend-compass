import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroupControls } from "./GroupControls";

const groups = [
  { id: 1, name: "成長株" },
  { id: 2, name: "配当株" },
];

function renderControls(overrides = {}) {
  const props = {
    groups,
    onCreate: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn(),
    error: null,
    ...overrides,
  };
  render(<GroupControls {...props} />);
  return props;
}

describe("GroupControls", () => {
  it("calls onCreate with the entered name and clears the input", async () => {
    const props = renderControls();

    fireEvent.change(screen.getByLabelText("グループ名"), { target: { value: "テック株" } });
    fireEvent.click(screen.getByRole("button", { name: "作成" }));

    expect(props.onCreate).toHaveBeenCalledWith("テック株");
    await waitFor(() => expect(screen.getByLabelText("グループ名")).toHaveValue(""));
  });

  it("shows an inline error message when the error prop is set", () => {
    renderControls({ error: "グループ名は既に使用されています" });

    expect(screen.getByRole("alert")).toHaveTextContent("グループ名は既に使用されています");
  });

  it("keeps the typed name in the input when onCreate rejects", async () => {
    let rejectCreate: (err: Error) => void = () => {};
    const onCreate = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectCreate = reject;
        })
    );
    const props = renderControls({ onCreate });

    fireEvent.change(screen.getByLabelText("グループ名"), { target: { value: "テック株" } });
    fireEvent.click(screen.getByRole("button", { name: "作成" }));

    expect(props.onCreate).toHaveBeenCalledWith("テック株");
    rejectCreate(new Error("作成に失敗しました"));

    // Give the rejected promise's catch handler a turn to run, then
    // confirm the input still holds what the user typed.
    await waitFor(() => expect(screen.getByLabelText("グループ名")).toHaveValue("テック株"));
  });

  it("does not call onCreate when the name is blank", () => {
    const props = renderControls();

    fireEvent.click(screen.getByRole("button", { name: "作成" }));

    expect(props.onCreate).not.toHaveBeenCalled();
  });

  it("deletes the group matching the typed name and clears the input", () => {
    const props = renderControls();

    fireEvent.change(screen.getByLabelText("グループ名"), { target: { value: "配当株" } });
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(props.onDelete).toHaveBeenCalledWith(2);
    expect(screen.getByLabelText("グループ名")).toHaveValue("");
  });

  it("shows an error and does not call onDelete when no group matches the typed name", () => {
    const props = renderControls();

    fireEvent.change(screen.getByLabelText("グループ名"), { target: { value: "存在しない株" } });
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(props.onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("該当するグループがありません");
  });
});
