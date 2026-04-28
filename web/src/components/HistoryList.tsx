import { useEffect, useState } from "react";
import { listHistory, type HistoryRecord } from "@/lib/idb";

type Props = {
  refreshKey?: number;
  onRegenerate: (h: HistoryRecord) => void;
};

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function HistoryList({ refreshKey, onRegenerate }: Props) {
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
        return (
          <li key={h.id} className="card-paper p-3 space-y-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="marker-num">
                {String(items.length - i).padStart(2, "0")}
              </span>
              <span className="label-mono">
                {h.modelId.replace("chatterbox-", "")} · {h.language ?? "—"} · {fmtTime(h.createdAt)}
              </span>
            </div>
            <p className="text-[13px] leading-snug line-clamp-3">{h.text}</p>
            <audio controls src={url} className="w-full h-9" />
            <div className="flex justify-end gap-3">
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
          </li>
        );
      })}
    </ul>
  );
}
