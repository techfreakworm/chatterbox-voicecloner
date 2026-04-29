import { cn } from "@/lib/utils";

export type Mode = "single" | "dialog";

type Props = {
  mode: Mode;
  onChange: (m: Mode) => void;
};

const MODES: { id: Mode; label: string }[] = [
  { id: "single", label: "Single voice" },
  { id: "dialog", label: "Dialog" },
];

export default function ModeToggle({ mode, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Generation mode"
      className="inline-flex rounded-sm border border-border overflow-hidden"
    >
      {MODES.map((m) => (
        <button
          key={m.id}
          role="tab"
          aria-selected={mode === m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={cn(
            "label-mono px-3 py-1.5 transition-colors",
            mode === m.id
              ? "bg-[hsl(var(--ember))]/15 text-[hsl(var(--ember))]"
              : "hover:text-foreground",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
