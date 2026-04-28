import type { ModelInfo } from "@/lib/api";

type Props = {
  models: ModelInfo[];
  activeId: string | null;
  loading: boolean;
  onPick: (id: string) => void;
};

export default function ModelPicker({ models, activeId, loading, onPick }: Props) {
  return (
    <select
      aria-label="Model"
      disabled={loading || models.length === 0}
      value={activeId ?? ""}
      onChange={(e) => onPick(e.target.value)}
      className="rounded-md border border-border bg-background px-2 py-1 text-sm"
    >
      <option value="" disabled>
        Choose model…
      </option>
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
