import Dexie, { type Table } from "dexie";

export const HISTORY_CAP = 50;

export type VoiceRecord = {
  id?: number;
  name: string;
  blob: Blob;
  sampleRate: number;
  durationMs: number;
  createdAt: number;
  isFavorite: boolean;
};

export type HistoryRecord = {
  id?: number;
  text: string;
  modelId: string;
  voiceId?: number;
  language?: string;
  params: Record<string, unknown>;
  audioBlob: Blob;
  createdAt: number;
};

class DB extends Dexie {
  voices!: Table<VoiceRecord, number>;
  history!: Table<HistoryRecord, number>;

  constructor() {
    super("chatterbox-voice-studio");
    this.version(1).stores({
      voices: "++id, name, createdAt, isFavorite",
      history: "++id, createdAt",
    });
  }
}

export const db = new DB();

export async function addVoice(
  v: Omit<VoiceRecord, "id" | "createdAt" | "isFavorite"> & Partial<Pick<VoiceRecord, "isFavorite">>,
): Promise<number> {
  return db.voices.add({
    ...v,
    isFavorite: v.isFavorite ?? false,
    createdAt: Date.now(),
  });
}

export async function listVoices(): Promise<VoiceRecord[]> {
  return db.voices.orderBy("createdAt").reverse().toArray();
}

export async function deleteVoice(id: number): Promise<void> {
  await db.voices.delete(id);
}

export async function setFavorite(id: number, fav: boolean): Promise<void> {
  await db.voices.update(id, { isFavorite: fav });
}

export async function addHistory(
  h: Omit<HistoryRecord, "id" | "createdAt">,
): Promise<number> {
  const id = await db.history.add({ ...h, createdAt: Date.now() });
  const count = await db.history.count();
  if (count > HISTORY_CAP) {
    const overflow = count - HISTORY_CAP;
    const oldest = await db.history.orderBy("createdAt").limit(overflow).primaryKeys();
    await db.history.bulkDelete(oldest);
  }
  return id;
}

export async function listHistory(): Promise<HistoryRecord[]> {
  return db.history.orderBy("createdAt").reverse().toArray();
}

export async function clearHistory(): Promise<void> {
  await db.history.clear();
}
