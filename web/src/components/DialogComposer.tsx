import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelInfo } from "@/lib/api";
import { type VoiceRecord } from "@/lib/idb";
import ParamsPanel from "@/components/ParamsPanel";
import SpeakerSlot from "@/components/SpeakerSlot";
import TagBar from "@/components/TagBar";

export type DialogSubmit = {
  text: string;
  engineId: string;
  language?: string;
  params: Record<string, unknown>;
  speakers: { letter: "A" | "B" | "C" | "D"; voice: VoiceRecord }[];
};

type Props = {
  models: ModelInfo[];
  engineId: string;
  onEngineChange: (id: string) => void;
  onSubmit: (input: DialogSubmit) => void;
  loadingModel: boolean;
  busy: boolean;
  libraryRefreshKey?: number;
};

const ALL_LETTERS = ["A", "B", "C", "D"] as const;

export default function DialogComposer({
  models,
  engineId,
  onEngineChange,
  onSubmit,
  loadingModel,
  busy,
  libraryRefreshKey,
}: Props) {
  const [count, setCount] = useState(2);
  const [speakers, setSpeakers] = useState<Record<string, VoiceRecord | undefined>>({});
  const [text, setText] = useState("SPEAKER A: \nSPEAKER B: \n");
  const [language, setLanguage] = useState<string | undefined>(undefined);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const textRef = useRef<HTMLTextAreaElement>(null);

  const engine = useMemo(() => models.find((m) => m.id === engineId), [models, engineId]);

  useEffect(() => {
    setParams(
      Object.fromEntries((engine?.params ?? []).map((p) => [p.name, p.default])),
    );
    setLanguage(engine?.languages[0]?.code);
  }, [engine?.id]);

  function setSpeaker(letter: string, v: VoiceRecord | undefined) {
    setSpeakers((s) => ({ ...s, [letter]: v }));
  }

  function addSpeaker() {
    setCount((c) => Math.min(4, c + 1));
  }

  function removeSpeaker(letter: string) {
    setSpeakers((s) => ({ ...s, [letter]: undefined }));
    setCount((c) => Math.max(2, c - 1));
  }

  function insertPrefix(letter: string) {
    const el = textRef.current;
    if (!el) return;
    const tag = `SPEAKER ${letter}: `;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const native = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    native?.call(el, before + tag + after);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    const cursor = start + tag.length;
    el.setSelectionRange(cursor, cursor);
    el.focus();
  }

  function handleSubmit() {
    if (!engine) return;
    const speakerList: DialogSubmit["speakers"] = [];
    for (let i = 0; i < count; i++) {
      const letter = ALL_LETTERS[i];
      const v = speakers[letter];
      if (v) speakerList.push({ letter, voice: v });
    }
    onSubmit({
      text,
      engineId: engine.id,
      language,
      params,
      speakers: speakerList,
    });
  }

  const visibleLetters = ALL_LETTERS.slice(0, count);
  const canSubmit = !!engine && !busy && !loadingModel && text.trim().length > 0;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h3 className="label-mono">Speakers</h3>
        <div className="space-y-2">
          {visibleLetters.map((letter) => (
            <SpeakerSlot
              key={letter}
              letter={letter}
              voice={speakers[letter]}
              onChange={(v) => setSpeaker(letter, v)}
              onRemove={count > 2 ? () => removeSpeaker(letter) : undefined}
              refreshKey={libraryRefreshKey}
            />
          ))}
        </div>
        {count < 4 && (
          <button
            type="button"
            onClick={addSpeaker}
            className="btn-ghost"
          >
            + add speaker
          </button>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="label-mono">Engine</h3>
        <div className="flex flex-col gap-1">
          {models.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="dialog-engine"
                checked={engineId === m.id}
                onChange={() => onEngineChange(m.id)}
                className="accent-[hsl(var(--ember))]"
              />
              {m.label}
            </label>
          ))}
        </div>
        {engine?.languages && engine.languages.length > 1 && (
          <div className="flex items-center gap-3 pt-2">
            <label htmlFor="dialog-lang" className="label-mono">Language</label>
            <select
              id="dialog-lang"
              value={language ?? ""}
              onChange={(e) => setLanguage(e.target.value)}
              className="field-input !w-auto font-mono text-[12px] py-1"
            >
              {engine.languages.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="label-mono">Script</h3>
        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          className="field-input font-mono text-[13px] leading-relaxed"
          placeholder="SPEAKER A: ...&#10;SPEAKER B: ..."
        />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="label-mono mr-1">insert</span>
            {visibleLetters.map((letter) => (
              <button
                key={letter}
                type="button"
                onClick={() => insertPrefix(letter)}
                className="font-mono text-[11px] px-2 py-0.5 rounded-sm border border-border text-muted-foreground hover:text-[hsl(var(--ember))] hover:border-[hsl(var(--ember))]/50 transition-colors"
              >
                SPEAKER {letter}:
              </button>
            ))}
          </div>
          <TagBar tags={engine?.paralinguistic_tags ?? []} targetRef={textRef} />
        </div>
      </div>

      {engine && (
        <div className="space-y-2">
          <h3 className="label-mono">Parameters</h3>
          <ParamsPanel specs={engine.params} values={params} onChange={setParams} />
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="btn-primary w-full flex items-center justify-center gap-3 ember-ring"
      >
        {busy ? (
          <>
            <span className="size-1.5 rounded-full bg-current animate-pulse-dot" />
            Generating dialog
          </>
        ) : (
          <>Generate dialog <span className="opacity-60">→</span></>
        )}
      </button>
    </div>
  );
}
