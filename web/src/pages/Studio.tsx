import { useEffect, useMemo, useRef, useState } from "react";
import {
  activateModel,
  generate,
  getActiveModel,
  listModels,
  streamActiveEvents,
  type ModelInfo,
} from "@/lib/api";
import { addHistory, type HistoryRecord, type VoiceRecord } from "@/lib/idb";
import DeviceBadge from "@/components/DeviceBadge";
import HistoryList from "@/components/HistoryList";
import LoadingBanner from "@/components/LoadingBanner";
import ModelPicker from "@/components/ModelPicker";
import ParamsPanel from "@/components/ParamsPanel";
import TagBar from "@/components/TagBar";
import VoiceComposer from "@/components/VoiceComposer";
import VoiceLibrary from "@/components/VoiceLibrary";

export default function Studio() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingModel, setLoadingModel] = useState(false);
  const [tab, setTab] = useState<"voices" | "history">("voices");
  const [text, setText] = useState("");
  const [language, setLanguage] = useState<string | undefined>(undefined);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [selectedVoice, setSelectedVoice] = useState<VoiceRecord | undefined>();
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [libraryKey, setLibraryKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listModels().then((m) => {
      setModels(m);
      if (m[0]) setActiveId((cur) => cur ?? m[0].id);
    });
    getActiveModel().then((s) => setActiveId((cur) => cur ?? s.id));
  }, []);

  useEffect(() => {
    const close = streamActiveEvents((evt) => {
      if (evt.status === "loading") setLoadingModel(true);
      if (evt.status === "loaded" || evt.status === "error") setLoadingModel(false);
      if (evt.status === "loaded" && evt.id) setActiveId(evt.id);
      if (evt.status === "error" && evt.error) setErr(evt.error);
    });
    return close;
  }, []);

  const active = useMemo(
    () => models.find((m) => m.id === activeId),
    [models, activeId],
  );

  useEffect(() => {
    setParams(
      Object.fromEntries((active?.params ?? []).map((p) => [p.name, p.default])),
    );
    setLanguage(active?.languages[0]?.code);
  }, [active?.id]);

  async function pickModel(id: string) {
    setLoadingModel(true);
    setErr(null);
    try {
      await activateModel(id);
      setActiveId(id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingModel(false);
    }
  }

  async function onGenerate(reuse?: HistoryRecord) {
    if (!active) return;
    if (active.supports_voice_clone && !selectedVoice && !reuse?.voiceId) {
      setErr("Pick or record a reference voice first.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const refBlob = selectedVoice?.blob;
      const inputText = reuse?.text ?? text;
      const inputLang = reuse?.language ?? language;
      const inputParams = reuse?.params ?? params;
      const out = await generate({
        modelId: active.id,
        text: inputText,
        language: inputLang,
        params: inputParams,
        reference: refBlob,
      });
      setOutputUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return URL.createObjectURL(out);
      });
      await addHistory({
        text: inputText,
        modelId: active.id,
        voiceId: selectedVoice?.id,
        language: inputLang,
        params: inputParams,
        audioBlob: out,
      });
      setHistoryKey((k) => k + 1);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="size-2.5 rounded-full bg-primary" />
          <span className="font-medium">Chatterbox Voice Studio</span>
        </div>
        <div className="flex items-center gap-3">
          <ModelPicker
            models={models}
            activeId={activeId}
            loading={loadingModel || busy}
            onPick={pickModel}
          />
          <DeviceBadge />
        </div>
      </header>

      <LoadingBanner
        visible={loadingModel}
        message="Loading model… first activation can take 30–60s."
      />
      {err && <div className="bg-red-500/10 text-red-400 text-sm px-6 py-2">{err}</div>}

      <main className="flex-1 grid lg:grid-cols-[1fr_420px] gap-6 p-6">
        <section className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-sm font-medium">Reference voice</h2>
            <VoiceComposer onSaved={() => setLibraryKey((k) => k + 1)} />
            <VoiceLibrary
              selectedId={selectedVoice?.id}
              onSelect={setSelectedVoice}
              refreshKey={libraryKey}
            />
          </div>

          {active?.languages && active.languages.length > 1 && (
            <div className="space-y-1">
              <label htmlFor="lang-select" className="text-sm font-medium">
                Language
              </label>
              <select
                id="lang-select"
                value={language ?? ""}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                {active.languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="prompt" className="text-sm font-medium">
              Text
            </label>
            <textarea
              id="prompt"
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-border bg-background p-2 text-sm"
              placeholder="Type what the voice should say…"
            />
            <div className="flex items-center justify-between">
              <TagBar tags={active?.paralinguistic_tags ?? []} targetRef={textRef} />
              <span className="text-xs text-muted-foreground">{text.length} chars</span>
            </div>
          </div>

          {active && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium">Parameters</h2>
              <ParamsPanel specs={active.params} values={params} onChange={setParams} />
            </div>
          )}

          <button
            type="button"
            onClick={() => onGenerate()}
            disabled={busy || loadingModel || !text.trim()}
            className="w-full rounded-md bg-primary text-primary-foreground py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Generating…" : "Generate"}
          </button>

          {outputUrl && (
            <div className="space-y-1">
              <h2 className="text-sm font-medium">Output</h2>
              <audio controls src={outputUrl} className="w-full" />
              <a href={outputUrl} download="chatterbox.wav" className="text-xs underline">
                download
              </a>
            </div>
          )}
        </section>

        <aside className="space-y-3">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setTab("voices")}
              className={`flex-1 rounded-md px-2 py-1 text-sm ${tab === "voices" ? "bg-muted" : ""}`}
            >
              Voices
            </button>
            <button
              type="button"
              onClick={() => setTab("history")}
              className={`flex-1 rounded-md px-2 py-1 text-sm ${tab === "history" ? "bg-muted" : ""}`}
            >
              History
            </button>
          </div>
          {tab === "voices" ? (
            <VoiceLibrary
              selectedId={selectedVoice?.id}
              onSelect={setSelectedVoice}
              refreshKey={libraryKey}
            />
          ) : (
            <HistoryList refreshKey={historyKey} onRegenerate={onGenerate} />
          )}
        </aside>
      </main>
    </div>
  );
}
