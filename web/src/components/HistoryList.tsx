import { useEffect, useState } from "react";
import { listHistory, type HistoryRecord } from "@/lib/idb";

type Props = {
  refreshKey?: number;
  onRegenerate: (h: HistoryRecord) => void;
  onReuseSeed?: (seed: number) => void;
};

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function HistoryList({ refreshKey, onRegenerate, onReuseSeed }: Props) {
  const [items, setItems] = useState<HistoryRecord[]>([]);
  useEffect(() => {
    listHistory().then(setItems);
  }, [refreshKey]);

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Generations will be archived here.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((h, i) => {
        const url = URL.createObjectURL(h.audioBlob);
        const kindLabel =
          h.kind === "dialog"
            ? `dialog · ${(h.speakers ?? []).length} spk · ${h.modelId.replace("chatterbox-", "")}`
            : `${h.modelId.replace("chatterbox-", "")} · ${h.language ?? "—"}`;
        return (
          <li key={h.id} className="card-paper p-3 space-y-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="marker-num">
                {String(items.length - i).padStart(2, "0")}
              </span>
              <span className="label-mono">{kindLabel} · {fmtTime(h.createdAt)}</span>
            </div>
            <p className="text-[13px] leading-snug line-clamp-3">{h.text}</p>
            <audio controls src={url} className="w-full h-9" />
            <div className="flex items-center justify-between">
              {h.seedUsed != null ? (
                <button
                  type="button"
                  onClick={() => onReuseSeed?.(h.seedUsed!)}
                  className="label-mono hover:text-[hsl(var(--ember))] transition-colors"
                  title="Copy this seed into the active params"
                >
                  seed {h.seedUsed} · ↻
                </button>
              ) : (
                <span className="label-mono text-muted-foreground/60">no seed</span>
              )}
              <div className="flex gap-3">
                <a
                  href={url}
                  download={`${h.id}.wav`}
                  className="label-mono hover:text-foreground transition-colors"
                >
                  ↓ download
                </a>
                <button
                  type="button"
                  className="label-mono hover:text-[hsl(var(--ember))] transition-colors"
                  onClick={() => onRegenerate(h)}
                >
                  ↻ regenerate
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
