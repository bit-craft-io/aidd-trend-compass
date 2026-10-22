import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineEditField, sanitizeDigits } from "./InlineEditField";

const LABEL = "7203の購入金額";
const groupOptions = [
  { value: "", label: "未選択" },
  { value: "1", label: "テック株" },
  { value: "2", label: "金融株" },
];

function setup(props: Partial<ComponentProps<typeof InlineEditField>> = {}) {
  const onCommit = vi.fn();
  render(<InlineEditField label={LABEL} kind="digits" value="2900" onCommit={onCommit} {...props} />);
  return { onCommit };
}

// ラベルにフォーカスして、編集に入る(クリックでも、Tab でも、同じ)
function open(): HTMLInputElement | HTMLSelectElement {
  fireEvent.focus(screen.getByLabelText(LABEL));
  return screen.getByLabelText(LABEL) as HTMLInputElement | HTMLSelectElement;
}

afterEach(() => {
  Reflect.deleteProperty(HTMLSelectElement.prototype, "showPicker");
});

describe("sanitizeDigits", () => {
  it("keeps only half-width digits", () => {
    expect(sanitizeDigits("a１2-.3 4")).toBe("234");
    expect(sanitizeDigits("")).toBe("");
  });
});

describe("InlineEditField view", () => {
  it("shows the value as a button label with the aria-label", () => {
    setup();

    const button = screen.getByLabelText(LABEL);
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveTextContent("2900");
  });

  it("shows — for an empty text or number value", () => {
    setup({ value: "" });

    expect(screen.getByLabelText(LABEL)).toHaveTextContent("—");
  });

  it("shows the option label for a select, including 未選択", () => {
    setup({ kind: "select", options: groupOptions, value: "" });
    expect(screen.getByLabelText(LABEL)).toHaveTextContent("未選択");
  });

  it("shows displayText instead of the value when given", () => {
    setup({ kind: "text", value: "トヨタ", displayText: "トヨタ自動車" });

    expect(screen.getByLabelText(LABEL)).toHaveTextContent("トヨタ自動車");
  });
});

describe("InlineEditField text and digits", () => {
  it("turns into an input with the same aria-label when the label gets focus", () => {
    setup();

    const input = open();

    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveValue("2900");
  });

  it("commits the changed value once on blur and goes back to the label", () => {
    const { onCommit } = setup();
    const input = open();

    fireEvent.change(input, { target: { value: "3000" } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("3000");
    expect(screen.getByLabelText(LABEL).tagName).toBe("BUTTON");
  });

  it("does not commit when the value is unchanged", () => {
    const { onCommit } = setup();
    const input = open();

    fireEvent.blur(input);

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(LABEL).tagName).toBe("BUTTON");
  });

  it("commits once on Enter", () => {
    const { onCommit } = setup();
    const input = open();

    fireEvent.change(input, { target: { value: "3000" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("3000");
  });

  it("does not commit on the Enter that confirms an IME conversion", () => {
    const { onCommit } = setup({ kind: "text", value: "トヨタ" });
    const input = open();

    fireEvent.change(input, { target: { value: "トヨタ自動車" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(LABEL).tagName).toBe("INPUT");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("トヨタ自動車");
  });

  it("drops the input on Escape and does not commit", () => {
    const { onCommit } = setup();
    const input = open();

    fireEvent.change(input, { target: { value: "3000" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(LABEL)).toHaveTextContent("2900");
  });

  it("lets only half-width digits into a digits field", () => {
    setup();
    const input = open();

    fireEvent.change(input, { target: { value: "ab１2-.3" } });

    expect(input).toHaveValue("23");
  });

  it("keeps a decimal value that was not touched (no commit on open and close)", () => {
    const { onCommit } = setup({ value: "580.5" });
    const input = open();

    expect(input).toHaveValue("580.5");
    fireEvent.blur(input);

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("does not filter a text field", () => {
    const { onCommit } = setup({ kind: "text", value: "" });
    const input = open();

    fireEvent.change(input, { target: { value: "ソニーabc1" } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith("ソニーabc1");
  });

  it("shows the placeholder on the input", () => {
    setup({ kind: "text", value: "", placeholder: "7203" });

    expect(open()).toHaveAttribute("placeholder", "7203");
  });
});

describe("InlineEditField select", () => {
  it("turns into a select, commits the chosen value at once and goes back to the label", () => {
    const { onCommit } = setup({ kind: "select", options: groupOptions, value: "" });
    const select = open();

    expect(select.tagName).toBe("SELECT");
    fireEvent.change(select, { target: { value: "2" } });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("2");
    expect(screen.getByLabelText(LABEL).tagName).toBe("BUTTON");
  });

  it("goes back without committing when the select loses focus", () => {
    const { onCommit } = setup({ kind: "select", options: groupOptions, value: "1" });
    const select = open();

    fireEvent.blur(select);

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(LABEL).tagName).toBe("BUTTON");
  });

  it("opens the list with showPicker when it exists", () => {
    const showPicker = vi.fn();
    Object.defineProperty(HTMLSelectElement.prototype, "showPicker", { configurable: true, value: showPicker });
    setup({ kind: "select", options: groupOptions, value: "" });

    open();

    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it("swallows an error from showPicker and still shows the select", () => {
    const showPicker = vi.fn(() => {
      throw new Error("NotAllowedError");
    });
    Object.defineProperty(HTMLSelectElement.prototype, "showPicker", { configurable: true, value: showPicker });
    setup({ kind: "select", options: groupOptions, value: "" });

    const select = open();

    expect(select.tagName).toBe("SELECT");
  });

  it("works when showPicker does not exist", () => {
    setup({ kind: "select", options: groupOptions, value: "" });

    expect(open().tagName).toBe("SELECT");
  });
});
