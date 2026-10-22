import { useEffect, useRef, useState } from "react";

export interface InlineEditOption {
  value: string;
  label: string;
}

interface InlineEditFieldProps {
  // 表示のボタンと、編集欄の、両方に付ける aria-label
  label: string;
  kind: "text" | "digits" | "select";
  // 現在の値(select は、選択肢の value)
  value: string;
  // 表示のラベル(省略時は value)。select は、選択肢の label を使う
  displayText?: string;
  options?: InlineEditOption[];
  placeholder?: string;
  className?: string;
  // 確定して、値が変わったときだけ呼ぶ
  onCommit: (value: string) => void;
}

const EMPTY_LABEL = "—";

// 半角の数字(0〜9)だけを残す。文字・全角の数字・小数点・負号は、除く。
export function sanitizeDigits(text: string): string {
  return text.replace(/[^0-9]/g, "");
}

// ラベル(枠線つき)で表示し、クリック(または Tab で着いたとき)に、入力欄へ切り替わる。
// 確定(blur・Enter・select の選択)でラベルに戻る。保存そのものは、呼び出し側が持つ。
export function InlineEditField({
  label,
  kind,
  value,
  displayText,
  options = [],
  placeholder,
  className = "",
  onCommit,
}: InlineEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  // 確定・取消のあとに、フォーカスが外れる(blur)イベントが続いても、二重に確定しない
  const done = useRef(false);
  const control = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    if (!editing) return;
    const el = control.current;
    if (!el) return;
    el.focus();
    if (el instanceof HTMLSelectElement) {
      try {
        (el as HTMLSelectElement & { showPicker?: () => void }).showPicker?.();
      } catch {
        // 対応しない、許可されない環境では、リストは開かない(もう1回クリックで開く)
      }
    }
  }, [editing]);

  const enter = () => {
    done.current = false;
    setDraft(value);
    setEditing(true);
  };

  // next が null のときは、取り消し(保存しない)
  const leave = (next: string | null) => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    if (next !== null && next !== value) onCommit(next);
  };

  // 触っていない値(例: DB にある小数 580.5)は、数字だけに直さず、そのまま返す
  const confirmedDraft = () => (kind === "digits" && draft !== value ? sanitizeDigits(draft) : draft);

  if (!editing) {
    const text = kind === "select" ? options.find((o) => o.value === value)?.label ?? "" : displayText ?? value;
    const shown = text === "" ? EMPTY_LABEL : text;
    return (
      <button
        type="button"
        className={`inline-edit-view ${className}`.trim()}
        aria-label={label}
        title={shown}
        onFocus={enter}
        onClick={enter}
      >
        {shown}
      </button>
    );
  }

  if (kind === "select") {
    return (
      <select
        ref={(el) => {
          control.current = el;
        }}
        className={className}
        aria-label={label}
        value={draft}
        onChange={(e) => leave(e.target.value)}
        onBlur={() => leave(null)}
        onKeyDown={(e) => {
          if (e.key === "Escape") leave(null);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      ref={(el) => {
        control.current = el;
      }}
      className={className}
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      inputMode={kind === "digits" ? "numeric" : undefined}
      onChange={(e) =>
        // 日本語入力の変換中は、触らない(変換が壊れる)。確定後(onCompositionEnd)に、除く
        setDraft(
          kind === "digits" && !(e.nativeEvent as InputEvent).isComposing
            ? sanitizeDigits(e.target.value)
            : e.target.value
        )
      }
      onCompositionEnd={(e) => {
        if (kind === "digits") setDraft(sanitizeDigits(e.currentTarget.value));
      }}
      onBlur={() => leave(confirmedDraft())}
      onKeyDown={(e) => {
        // 変換の確定の Enter では、保存の確定にしない(Enter は、2回になる)
        if (e.key === "Enter" && !e.nativeEvent.isComposing) leave(confirmedDraft());
        else if (e.key === "Escape") leave(null);
      }}
    />
  );
}
