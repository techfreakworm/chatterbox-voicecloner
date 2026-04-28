import { useEffect, useState } from "react";
import { deleteVoice, listVoices, setFavorite, type VoiceRecord } from "@/lib/idb";
import { cn } from "@/lib/utils";

type Props = {
  selectedId?: number;
  onSelect: (v: VoiceRecord) => void;
  refreshKey?: number;
};

export default function VoiceLibrary({ selectedId, onSelect, refreshKey }: Props) {
  const [voices, setVoices] = useState<VoiceRecord[]>([]);
  useEffect(() => {
    listVoices().then(setVoices);
  }, [refreshKey]);

  if (voices.length === 0) {
    return <p className="text-sm text-muted-foreground">No saved voices yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {voices.map((v) => (
        <li
          key={v.id}
          className={cn(
            "flex items-center justify-between rounded-md border border-border p-2",
            selectedId === v.id && "ring-1 ring-primary",
          )}
        >
          <button
            className="flex-1 text-left text-sm"
            onClick={() => onSelect(v)}
            type="button"
          >
            <div className="font-medium">{v.name}</div>
            <div className="text-xs text-muted-foreground">
              {(v.durationMs / 1000).toFixed(1)}s · {v.sampleRate} Hz
            </div>
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={v.isFavorite ? "Unfavorite" : "Favorite"}
              onClick={() => setFavorite(v.id!, !v.isFavorite).then(() => listVoices().then(setVoices))}
              className="text-xs px-1"
            >
              {v.isFavorite ? "★" : "☆"}
            </button>
            <button
              type="button"
              aria-label="Delete"
              onClick={() => deleteVoice(v.id!).then(() => listVoices().then(setVoices))}
              className="text-xs px-1 text-muted-foreground"
            >
              ✕
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
