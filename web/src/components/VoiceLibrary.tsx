import { useEffect, useRef, useState } from "react";
import { deleteVoice, listVoices, setFavorite, type VoiceRecord } from "@/lib/idb";
import { cn } from "@/lib/utils";

type Props = {
  selectedId?: number;
  onSelect: (v: VoiceRecord) => void;
  refreshKey?: number;
};

export default function VoiceLibrary({ selectedId, onSelect, refreshKey }: Props) {
  const [voices, setVoices] = useState<VoiceRecord[]>([]);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    listVoices().then(setVoices);
  }, [refreshKey]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  function stop() {
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setPlayingId(null);
  }

  function play(v: VoiceRecord) {
    stop();
    const url = URL.createObjectURL(v.blob);
    const audio = new Audio(url);
    audio.onended = () => stop();
    audio.onerror = () => stop();
    audioRef.current = audio;
    urlRef.current = url;
    setPlayingId(v.id ?? null);
    audio.play().catch(() => stop());
  }

  function toggle(v: VoiceRecord) {
    if (playingId === v.id) stop();
    else play(v);
  }

  if (voices.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Voices will appear here once you upload or record one.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {voices.map((v, i) => {
        const isPlaying = playingId === v.id;
        return (
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
                <div className="display-serif text-[18px] leading-tight">
                  {v.name}
                </div>
                <div className="label-mono mt-1">
                  {(v.durationMs / 1000).toFixed(1)}s · {v.sampleRate} Hz
                </div>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={isPlaying ? "Stop" : "Play"}
                  onClick={() => toggle(v)}
                  className={cn(
                    "size-7 grid place-items-center rounded-sm border transition-colors",
                    isPlaying
                      ? "border-[hsl(var(--ember))]/60 text-[hsl(var(--ember))] bg-[hsl(var(--ember))]/10"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40",
                  )}
                >
                  {isPlaying ? (
                    <span className="block size-2 bg-current rounded-[1px]" />
                  ) : (
                    <span
                      className="block size-0 ml-[2px]"
                      style={{
                        borderLeft: "7px solid currentColor",
                        borderTop: "5px solid transparent",
                        borderBottom: "5px solid transparent",
                      }}
                    />
                  )}
                </button>
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
                  onClick={() => {
                    if (playingId === v.id) stop();
                    deleteVoice(v.id!).then(() => listVoices().then(setVoices));
                  }}
                  className="text-xs text-muted-foreground hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
