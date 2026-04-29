import { useEffect, useMemo, useRef, useState } from "react";
import {
  activateModel,
  generate,
  generateDialog,
  getActiveModel,
  listModels,
  streamActiveEvents,
  type ModelInfo,
} from "@/lib/api";
import { addHistory, type HistoryRecord, type VoiceRecord } from "@/lib/idb";
import DeviceBadge from "@/components/DeviceBadge";
import DialogComposer, { type DialogSubmit } from "@/components/DialogComposer";
import HistoryList from "@/components/HistoryList";
import LoadingBanner from "@/components/LoadingBanner";
import MadeBy from "@/components/MadeBy";
import ModelPicker from "@/components/ModelPicker";
import ModeToggle, { type Mode } from "@/components/ModeToggle";
import ParamsPanel from "@/components/ParamsPanel";
import ProgressBar from "@/components/ProgressBar";
import TagBar from "@/components/TagBar";
import VoiceComposer from "@/components/VoiceComposer";
import VoiceLibrary from "@/components/VoiceLibrary";
import { cn } from "@/lib/utils";

function SectionHeader({ num, title, hint }: { num: string; title: string; hint?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-3">
        <span className="marker-num">{num}</span>
        <h2 className="display-serif text-[19px] sm:text-[22px] leading-tight">{title}</h2>
      </div>
      {hint && <p className="label-mono">{hint}</p>}
      <div className="rule-dotted mt-2" />
    </div>
  );
}

export default function Studio() {
  const [mode, setMode] = useState<Mode>("single");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialogEngineId, setDialogEngineId] = useState<string>("chatterbox-en");
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
      if (m[0]) {
        setActiveId((cur) => cur ?? m[0].id);
        setDialogEngineId((cur) => cur || m[0].id);
      }
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
      const result = await generate({
        modelId: active.id,
        text: inputText,
        language: inputLang,
        params: inputParams,
        reference: refBlob,
      });
      setOutputUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return URL.createObjectURL(result.blob);
      });
      await addHistory({
        text: inputText,
        modelId: active.id,
        voiceId: selectedVoice?.id,
        language: inputLang,
        params: inputParams,
        audioBlob: result.blob,
        kind: "single",
        seedUsed: result.seedUsed ?? undefined,
      });
      setHistoryKey((k) => k + 1);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDialogSubmit(input: DialogSubmit) {
    setErr(null);
    setBusy(true);
    try {
      const result = await generateDialog({
        engineId: input.engineId,
        text: input.text,
        language: input.language,
        params: input.params,
        speakers: input.speakers.map((s) => ({
          letter: s.letter,
          reference: s.voice.blob,
        })),
      });
      setOutputUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return URL.createObjectURL(result.blob);
      });
      await addHistory({
        text: input.text,
        modelId: input.engineId,
        language: input.language,
        params: input.params,
        audioBlob: result.blob,
        kind: "dialog",
        seedUsed: result.seedUsed ?? undefined,
        speakers: input.speakers.map((s) => ({ letter: s.letter, voiceId: s.voice.id! })),
      });
      setHistoryKey((k) => k + 1);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen relative-z animate-fade-up">
      <header className="border-b border-border">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 py-4 sm:py-5 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 lg:gap-6">
          <div className="flex items-end gap-3 sm:gap-4">
            <span className="display-serif text-[26px] sm:text-[34px] leading-none">Chatterbox</span>
            <span className="label-mono pb-0.5 sm:pb-1 whitespace-nowrap">voice studio · v0.2</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-6">
            <ModeToggle mode={mode} onChange={setMode} />
            {mode === "single" && (
              <ModelPicker
                models={models}
                activeId={activeId}
                loading={loadingModel || busy}
                onPick={pickModel}
              />
            )}
            <DeviceBadge />
          </div>
        </div>
      </header>

      <LoadingBanner
        visible={loadingModel}
        message="Loading model — first activation can take 30–60s"
      />
      <ProgressBar />
      {err && (
        <div className="border-b border-red-900/40 bg-red-950/30 px-4 sm:px-8 py-2.5">
          <span className="label-mono text-red-400">error</span>
          <span className="ml-3 text-sm text-red-300/90 break-words">{err}</span>
        </div>
      )}

      <main className="mx-auto max-w-[1280px] px-4 sm:px-8 py-6 sm:py-10 grid lg:grid-cols-[minmax(0,1fr)_400px] gap-8 lg:gap-12">
        <section className="space-y-12">
          {mode === "single" ? (
            <>
              <div className="space-y-5">
                <SectionHeader num="01" title="Reference voice" hint="upload, record, or pick from your library" />
                <VoiceComposer onSaved={() => setLibraryKey((k) => k + 1)} />
                <VoiceLibrary
                  selectedId={selectedVoice?.id}
                  onSelect={setSelectedVoice}
                  refreshKey={libraryKey}
                />
              </div>

              <div className="space-y-4">
                <SectionHeader num="02" title="Script" hint="what should the voice say?" />
                {active?.languages && active.languages.length > 1 && (
                  <div className="flex items-center gap-3">
                    <label htmlFor="lang-select" className="label-mono">language</label>
                    <select
                      id="lang-select"
                      value={language ?? ""}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="field-input !w-auto font-mono text-[12px] py-1"
                    >
                      {active.languages.map((l) => (
                        <option key={l.code} value={l.code}>{l.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                <textarea
                  id="prompt"
                  ref={textRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={7}
                  className="field-input font-display text-[18px] leading-relaxed"
                  placeholder="Once upon a midnight dreary, while I pondered, weak and weary…"
                />
                <div className="flex items-center justify-between">
                  <TagBar tags={active?.paralinguistic_tags ?? []} targetRef={textRef} />
                  <span className="label-mono">{text.length} chars</span>
                </div>
              </div>

              {active && (
                <div className="space-y-5">
                  <SectionHeader num="03" title="Parameters" hint={active.description} />
                  <ParamsPanel specs={active.params} values={params} onChange={setParams} />
                </div>
              )}

              <div className="space-y-4 pt-2">
                <button
                  type="button"
                  onClick={() => onGenerate()}
                  disabled={busy || loadingModel || !text.trim()}
                  className="btn-primary w-full flex items-center justify-center gap-3 ember-ring"
                >
                  {busy ? (
                    <>
                      <span className="size-1.5 rounded-full bg-current animate-pulse-dot" />
                      Generating
                    </>
                  ) : (
                    <>Generate <span className="opacity-60">→</span></>
                  )}
                </button>

                {outputUrl && (
                  <div className="card-paper p-4 space-y-3">
                    <div className="flex items-baseline justify-between">
                      <span className="label-mono">latest output</span>
                      <a href={outputUrl} download="chatterbox.wav" className="label-mono hover:text-foreground">
                        ↓ download
                      </a>
                    </div>
                    <audio controls src={outputUrl} className="w-full h-10" />
                  </div>
                )}
              </div>
            </>
          ) : (
            <DialogComposer
              models={models}
              engineId={dialogEngineId}
              onEngineChange={setDialogEngineId}
              onSubmit={onDialogSubmit}
              loadingModel={loadingModel}
              busy={busy}
              libraryRefreshKey={libraryKey}
            />
          )}

          {mode === "dialog" && outputUrl && (
            <div className="card-paper p-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="label-mono">latest output</span>
                <a href={outputUrl} download="dialog.wav" className="label-mono hover:text-foreground">
                  ↓ download
                </a>
              </div>
              <audio controls src={outputUrl} className="w-full h-10" />
            </div>
          )}
        </section>

        <aside className="space-y-5 lg:sticky lg:top-8 self-start">
          <div className="flex border-b border-border">
            {(["voices", "history"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 label-mono py-2 transition-colors border-b-2",
                  tab === t
                    ? "text-foreground border-[hsl(var(--ember))]"
                    : "border-transparent hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "voices" ? (
            <VoiceLibrary
              selectedId={selectedVoice?.id}
              onSelect={setSelectedVoice}
              refreshKey={libraryKey}
            />
          ) : (
            <HistoryList
              refreshKey={historyKey}
              onRegenerate={onGenerate}
              onReuseSeed={(seed) => setParams((p) => ({ ...p, seed }))}
            />
          )}
        </aside>
      </main>

      <footer className="border-t border-border mt-10 sm:mt-16">
        <MadeBy />
        <div className="rule-dotted mx-4 sm:mx-8" />
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8 py-5 sm:py-6 flex flex-col sm:flex-row items-center sm:justify-between gap-2 sm:gap-0">
          <span className="label-mono">chatterbox · resemble ai</span>
          <span className="label-mono">stateless · browser-persisted</span>
        </div>
      </footer>
    </div>
  );
}
