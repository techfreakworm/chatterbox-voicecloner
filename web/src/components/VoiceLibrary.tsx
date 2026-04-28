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
    return (
      <p className="text-sm text-muted-foreground italic">
        Voices will appear here once you upload or record one.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {voices.map((v, i) => (
        <li
          key={v.id}
          className={cn(
            "card-paper p-3 transition-colors",
            selectedId === v.id
              ? "border-[hsl(var(--ember))]/60 bg-[hsl(var(--ember))]/5"
              : "hover:border-foreground/30",
          )}
        >
          <div className="flex items-start gap-3">
            <span className="marker-num pt-0.5">
              {String(i + 1).padStart(2, "0")}
            </span>
            <button
              type="button"
              className="flex-1 text-left"
              onClick={() => onSelect(v)}
            >
              <div className="display-serif text-[18px] leading-tight">{v.name}</div>
              <div className="label-mono mt-1">
                {(v.durationMs / 1000).toFixed(1)}s · {v.sampleRate} Hz
              </div>
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label={v.isFavorite ? "Unfavorite" : "Favorite"}
                onClick={() =>
                  setFavorite(v.id!, !v.isFavorite).then(() =>
                    listVoices().then(setVoices),
                  )
                }
                className={cn(
                  "text-base leading-none transition-colors",
                  v.isFavorite
                    ? "text-[hsl(var(--ember))]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v.isFavorite ? "★" : "☆"}
              </button>
              <button
                type="button"
                aria-label="Delete"
                onClick={() =>
                  deleteVoice(v.id!).then(() => listVoices().then(setVoices))
                }
                className="text-xs text-muted-foreground hover:text-red-400 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
