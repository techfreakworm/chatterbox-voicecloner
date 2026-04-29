export type ProgressState =
  | { phase: "idle" }
  | {
      phase: "running";
      kind: "single" | "dialog";
      turn: number;
      total: number;
      elapsedS: number;
    }
  | { phase: "done"; elapsedS: number }
  | { phase: "error"; message: string };

type ProgressEvent = {
  type: "start" | "tick" | "turn_complete" | "done" | "error";
  elapsed_s: number;
  kind?: "single" | "dialog";
  turn?: number;
  total_turns?: number;
  message?: string;
  seed_used?: number | null;
};

export function subscribeProgress(
  onState: (s: ProgressState) => void,
): () => void {
  const es = new EventSource("/api/progress");
  let doneTimer: number | null = null;

  es.onmessage = (m: MessageEvent) => {
    if (doneTimer !== null) {
      window.clearTimeout(doneTimer);
      doneTimer = null;
    }
    let evt: ProgressEvent;
    try {
      evt = JSON.parse(m.data) as ProgressEvent;
    } catch {
      return;
    }
    if (evt.type === "start" || evt.type === "tick" || evt.type === "turn_complete") {
      onState({
        phase: "running",
        kind: (evt.kind ?? "single"),
        turn: evt.turn ?? 0,
        total: evt.total_turns ?? 1,
        elapsedS: evt.elapsed_s ?? 0,
      });
      return;
    }
    if (evt.type === "done") {
      onState({ phase: "done", elapsedS: evt.elapsed_s });
      doneTimer = window.setTimeout(() => onState({ phase: "idle" }), 1000);
      return;
    }
    if (evt.type === "error") {
      onState({ phase: "error", message: evt.message ?? "Generation failed" });
    }
  };

  return () => {
    if (doneTimer !== null) window.clearTimeout(doneTimer);
    es.close();
  };
}

import { useEffect, useState } from "react";

export function useProgress(): ProgressState {
  const [state, setState] = useState<ProgressState>({ phase: "idle" });
  useEffect(() => {
    const close = subscribeProgress(setState);
    return close;
  }, []);
  return state;
}
