import { useRef, useState } from "react";
import { Recorder } from "@/lib/audio";
import { addVoice } from "@/lib/idb";

type Props = {
  onSaved: () => void;
};

export default function VoiceComposer({ onSaved }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const [recState, setRecState] = useState<"idle" | "recording" | "stopping" | "error">("idle");
  const [name, setName] = useState("");

  async function importBlob(blob: Blob, defaultName: string) {
    const arr = new Uint8Array(await blob.arrayBuffer());
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(arr.buffer.slice(0));
    await addVoice({
      name: name || defaultName || `voice-${Date.now()}`,
      blob,
      sampleRate: buf.sampleRate,
      durationMs: Math.round(buf.duration * 1000),
    });
    setName("");
    onSaved();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    await importBlob(f, f.name.replace(/\.[^.]+$/, ""));
    e.target.value = "";
  }

  async function startRec() {
    const r = new Recorder();
    recorderRef.current = r;
    try {
      await r.start();
      setRecState("recording");
    } catch {
      setRecState("error");
    }
  }

  async function stopRec() {
    setRecState("stopping");
    const blob = await recorderRef.current?.stop();
    setRecState("idle");
    if (blob) await importBlob(blob, "recorded");
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Name this voice"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="field-input"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="btn-ghost flex-1"
        >
          ↑ Upload
        </button>
        <input ref={fileRef} type="file" accept="audio/*" hidden onChange={onFile} />
        {recState === "recording" ? (
          <button
            type="button"
            onClick={stopRec}
            className="btn-primary flex-1 !py-2 flex items-center justify-center gap-2"
          >
            <span className="size-1.5 rounded-full bg-current animate-pulse-dot" />
            Stop &amp; save
          </button>
        ) : (
          <button
            type="button"
            onClick={startRec}
            className="btn-ghost flex-1"
          >
            ● Record
          </button>
        )}
      </div>
      {recState === "error" && (
        <p className="text-[11px] text-red-400 font-mono uppercase tracking-wider">
          microphone permission denied
        </p>
      )}
    </div>
  );
}
