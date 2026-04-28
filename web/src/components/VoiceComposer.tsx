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
    <div className="space-y-2">
      <input
        type="text"
        placeholder="Voice name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-md border border-border px-3 py-1.5 text-sm"
        >
          Upload .wav/.mp3
        </button>
        <input ref={fileRef} type="file" accept="audio/*" hidden onChange={onFile} />
        {recState === "recording" ? (
          <button
            type="button"
            onClick={stopRec}
            className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm"
          >
            Stop &amp; save
          </button>
        ) : (
          <button
            type="button"
            onClick={startRec}
            className="rounded-md border border-border px-3 py-1.5 text-sm"
          >
            Record
          </button>
        )}
      </div>
      {recState === "error" && (
        <p className="text-xs text-red-500">Microphone permission denied.</p>
      )}
    </div>
  );
}
