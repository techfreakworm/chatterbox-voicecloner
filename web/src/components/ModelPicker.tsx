import type { ModelInfo } from "@/lib/api";

type Props = {
  models: ModelInfo[];
  activeId: string | null;
  loading: boolean;
  onPick: (id: string) => void;
};

export default function ModelPicker({ models, activeId, loading, onPick }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="label-mono">model</span>
      <select
        aria-label="Model"
        disabled={loading || models.length === 0}
        value={activeId ?? ""}
        onChange={(e) => onPick(e.target.value)}
        className="rounded-sm border border-border bg-paper/60 px-2.5 py-1 font-mono text-[12px] tracking-wider focus:outline-none focus:border-[hsl(var(--ember))]/60"
      >
        <option value="" disabled>choose…</option>
        {models.map((m) => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>
    </div>
  );
}
