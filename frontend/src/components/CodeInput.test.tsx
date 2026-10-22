import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CodeInput } from "./CodeInput";

describe("CodeInput", () => {
  it("submits trimmed code and clears input", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CodeInput onSubmit={onSubmit} error={null} />);

    fireEvent.change(screen.getByLabelText("株式コード"), {
      target: { value: " 7203 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "取得" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("7203"));
    expect(screen.getByLabelText("株式コード")).toHaveValue("");
  });

  it("does not submit when code is empty", () => {
    const onSubmit = vi.fn();
    render(<CodeInput onSubmit={onSubmit} error={null} />);

    fireEvent.click(screen.getByRole("button", { name: "取得" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows inline error message under the input", () => {
    render(
      <CodeInput
        onSubmit={vi.fn()}
        error="銘柄コード 0000 のデータを取得できませんでした"
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "銘柄コード 0000 のデータを取得できませんでした"
    );
  });
});
