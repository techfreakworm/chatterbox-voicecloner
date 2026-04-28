import { useEffect, useState } from "react";
import { listHistory, type HistoryRecord } from "@/lib/idb";

type Props = {
  refreshKey?: number;
  onRegenerate: (h: HistoryRecord) => void;
};

export default function HistoryList({ refreshKey, onRegenerate }: Props) {
  const [items, setItems] = useState<HistoryRecord[]>([]);
  useEffect(() => {
    listHistory().then(setItems);
  }, [refreshKey]);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No generations yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((h) => {
        const url = URL.createObjectURL(h.audioBlob);
        return (
          <li key={h.id} className="rounded-md border border-border p-2 space-y-2">
            <div className="text-sm line-clamp-2">{h.text}</div>
            <div className="text-xs text-muted-foreground">
              {h.modelId} · {h.language ?? "—"} · {new Date(h.createdAt).toLocaleTimeString()}
            </div>
            <audio controls src={url} className="w-full" />
            <div className="flex justify-end gap-2">
              <a href={url} download={`${h.id}.wav`} className="text-xs underline">download</a>
              <button type="button" className="text-xs underline" onClick={() => onRegenerate(h)}>
                regenerate
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
