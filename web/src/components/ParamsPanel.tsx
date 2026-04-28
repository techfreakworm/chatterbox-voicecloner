import type { ParamSpec } from "@/lib/api";

type Props = {
  specs: ParamSpec[];
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

export default function ParamsPanel({ specs, values, onChange }: Props) {
  function set(name: string, v: unknown) {
    onChange({ ...values, [name]: v });
  }
  return (
    <div className="space-y-5">
      {specs.map((s) => {
        const id = `param-${s.name}`;
        const current: unknown = values[s.name] ?? s.default;
        if (s.type === "float" || s.type === "int") {
          const n = typeof current === "number" ? current : Number(current);
          return (
            <div key={s.name} className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <label htmlFor={id} className="label-mono">{s.label}</label>
                <span className="font-mono text-[12px] text-foreground tracking-wider">
                  {Number.isFinite(n) ? n.toFixed(2) : String(current)}
                </span>
              </div>
              <input
                id={id}
                aria-label={s.label}
                type="range"
                min={s.min}
                max={s.max}
                step={s.step ?? 0.01}
                value={Number.isFinite(n) ? n : 0}
                onChange={(e) => set(s.name, Number(e.target.value))}
                className="w-full accent-[hsl(var(--ember))]"
              />
              {s.help && (
                <p className="text-[11px] text-muted-foreground/80 italic">{s.help}</p>
              )}
            </div>
          );
        }
        if (s.type === "bool") {
          return (
            <label
              key={s.name}
              htmlFor={id}
              className="flex items-center justify-between cursor-pointer"
            >
              <span className="label-mono">{s.label}</span>
              <input
                id={id}
                aria-label={s.label}
                type="checkbox"
                checked={!!current}
                onChange={(e) => set(s.name, e.target.checked)}
                className="accent-[hsl(var(--ember))]"
              />
            </label>
          );
        }
        return (
          <div key={s.name} className="space-y-1.5">
            <label htmlFor={id} className="label-mono block">{s.label}</label>
            <select
              id={id}
              aria-label={s.label}
              value={String(current)}
              onChange={(e) => set(s.name, e.target.value)}
              className="field-input font-mono text-[12px]"
            >
              {(s.choices ?? []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
