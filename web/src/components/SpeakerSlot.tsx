import { useEffect, useState } from "react";
import { listVoices, type VoiceRecord } from "@/lib/idb";

type Props = {
  letter: "A" | "B" | "C" | "D";
  voice?: VoiceRecord;
  onChange: (v: VoiceRecord | undefined) => void;
  onRemove?: () => void;
  refreshKey?: number;
};

export default function SpeakerSlot({ letter, voice, onChange, onRemove, refreshKey }: Props) {
  const [voices, setVoices] = useState<VoiceRecord[]>([]);
  useEffect(() => {
    listVoices().then(setVoices);
  }, [refreshKey]);

  return (
    <div className="flex items-center gap-3">
      <span className="display-serif text-[20px] w-7">{letter}</span>
      <select
        aria-label={`Speaker ${letter} voice`}
        value={voice?.id ?? ""}
        onChange={(e) => {
          const id = Number(e.target.value);
          onChange(voices.find((v) => v.id === id));
        }}
        className="field-input flex-1 font-mono text-[12px] py-1"
      >
        <option value="" disabled>pick voice…</option>
        {voices.map((v) => (
          <option key={v.id} value={v.id}>{v.name}</option>
        ))}
      </select>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove speaker ${letter}`}
          className="text-xs text-muted-foreground hover:text-red-400 transition-colors"
        >
          ✕
        </button>
      )}
    </div>
  );
}
