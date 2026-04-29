export type Lang = { code: string; label: string };

export type ParamSpec = {
  name: string;
  label: string;
  type: "float" | "int" | "bool" | "enum";
  default: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  choices?: string[];
  help?: string;
  group?: "basic" | "advanced";
};

export type ModelInfo = {
  id: string;
  label: string;
  description: string;
  languages: Lang[];
  paralinguistic_tags: string[];
  supports_voice_clone: boolean;
  params: ParamSpec[];
};

export type ActiveStatus = {
  id: string | null;
  status: "idle" | "loading" | "loaded" | "error";
  last_error: string | null;
};

export async function listModels(): Promise<ModelInfo[]> {
  const r = await fetch("/api/models");
  if (!r.ok) throw new Error(`listModels: ${r.status}`);
  return r.json();
}

export async function getActiveModel(): Promise<ActiveStatus> {
  const r = await fetch("/api/models/active");
  if (!r.ok) throw new Error(`getActiveModel: ${r.status}`);
  return r.json();
}

export async function activateModel(id: string): Promise<void> {
  const r = await fetch(`/api/models/${encodeURIComponent(id)}/activate`, { method: "POST" });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err?.error?.code ?? `activateModel: ${r.status}`);
  }
}

export type GenerateInput = {
  modelId: string;
  text: string;
  language?: string;
  params: Record<string, unknown>;
  reference?: Blob;
};

export type GenerateResult = {
  blob: Blob;
  seedUsed: number | null;
};

export async function generate(input: GenerateInput): Promise<GenerateResult> {
  const fd = new FormData();
  fd.set("text", input.text);
  fd.set("model_id", input.modelId);
  fd.set("params", JSON.stringify(input.params ?? {}));
  if (input.language) fd.set("language", input.language);
  if (input.reference) fd.set("reference_wav", input.reference, "ref.wav");
  const r = await fetch("/api/generate", { method: "POST", body: fd });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    const code = err?.error?.code ?? `generate: ${r.status}`;
    const msg = err?.error?.message;
    throw new Error(msg ? `${code}: ${msg}` : code);
  }
  const seedHeader = r.headers.get("x-seed-used");
  const seedUsed = seedHeader != null ? Number(seedHeader) : null;
  const blob = await r.blob();
  return { blob, seedUsed };
}

export function streamActiveEvents(
  onEvent: (e: { id: string | null; status: string; error?: string }) => void,
) {
  const es = new EventSource("/api/models/active/events");
  es.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data));
    } catch {
      /* ignore malformed */
    }
  };
  return () => es.close();
}
