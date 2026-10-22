import { useEffect, useRef, useState } from "react";
import { createPerspectives } from "../api/trends";
import type { Perspectives, Trend } from "../types";

const FALLBACK_MESSAGE = "AIの読み方は今のところ取得できていません";

export type PerspectivesState = "closed" | "loading" | "done" | "error";

export function usePerspectives(watchlist: Trend[]) {
  // 行(trend.id)で覚える。「更新」で行が差し替わると、開いていた行は一覧から消え、パネルは閉じる。
  const [openId, setOpenId] = useState<number | null>(null);
  const [generated, setGenerated] = useState<Record<number, Perspectives>>({});
  const [failures, setFailures] = useState<Record<number, string>>({});
  const inflight = useRef<Set<number>>(new Set()); // 二重呼び出しの防止(StrictModeも含む)

  const opened = watchlist.find((t) => t.id === openId) ?? null;
  const perspectives = opened ? (opened.perspectives ?? generated[opened.id] ?? null) : null;

  // 開いている行が一覧から消えたら、開いた状態を捨てる(戻ってきても、勝手に開き直さない)
  useEffect(() => {
    if (openId !== null && !opened) setOpenId(null);
  }, [openId, opened]);

  useEffect(() => {
    if (!opened || perspectives || opened.id in failures || inflight.current.has(opened.id)) return;
    const { id, code } = opened;
    inflight.current.add(id);
    createPerspectives(code)
      .then((p) => setGenerated((g) => ({ ...g, [id]: p })))
      .catch((e) =>
        setFailures((f) => ({
          ...f,
          [id]: (e instanceof Error && e.message) || FALLBACK_MESSAGE,
        }))
      )
      .finally(() => {
        inflight.current.delete(id);
      });
  }, [opened, perspectives, failures]);

  const toggle = (code: string) => {
    const target = watchlist.find((t) => t.code === code);
    if (!target) return;
    if (openId === target.id) {
      setOpenId(null);
      return;
    }
    // 開き直すと、失敗していた行は、もう一度作る
    setFailures((f) => {
      const { [target.id]: _removed, ...rest } = f;
      return rest;
    });
    setOpenId(target.id);
  };

  const state: PerspectivesState = !opened
    ? "closed"
    : perspectives
      ? "done"
      : failures[opened.id]
        ? "error"
        : "loading";

  return {
    openCode: opened?.code ?? null,
    opened,
    perspectives,
    state,
    error: opened ? failures[opened.id] : undefined,
    toggle,
  };
}
