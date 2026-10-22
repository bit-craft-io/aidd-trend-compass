import { FormEvent, useState } from "react";

interface CodeInputProps {
  onSubmit: (code: string) => Promise<void>;
  error: string | null;
}

export function CodeInput({ onSubmit, error }: CodeInputProps) {
  const [code, setCode] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;
    await onSubmit(code.trim());
    setCode("");
  };

  return (
    <form className="code-input" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="stock-code">株式コード</label>
        <input
          id="stock-code"
          className="code-text-input"
          value={code}
          placeholder="例: 7203"
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      <button type="submit" className="btn btn-primary">
        取得
      </button>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </form>
  );
}
