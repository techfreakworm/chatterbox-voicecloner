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
    <div className="space-y-4">
      {specs.map((s) => {
        const id = `param-${s.name}`;
        const current = (values[s.name] ?? s.default) as never;
        if (s.type === "float" || s.type === "int") {
          return (
            <label key={s.name} htmlFor={id} className="block space-y-1">
              <span className="text-sm">{s.label}</span>
              <input
                id={id}
                aria-label={s.label}
                type="range"
                min={s.min}
                max={s.max}
                step={s.step ?? 0.01}
                value={current as number}
                onChange={(e) => set(s.name, Number(e.target.value))}
                className="w-full"
              />
              <span className="text-xs text-muted-foreground">{String(current)}</span>
            </label>
          );
        }
        if (s.type === "bool") {
          return (
            <label key={s.name} htmlFor={id} className="flex items-center justify-between text-sm">
              <span>{s.label}</span>
              <input
                id={id}
                aria-label={s.label}
                type="checkbox"
                checked={!!current}
                onChange={(e) => set(s.name, e.target.checked)}
              />
            </label>
          );
        }
        return (
          <label key={s.name} htmlFor={id} className="block space-y-1">
            <span className="text-sm">{s.label}</span>
            <select
              id={id}
              aria-label={s.label}
              value={current as string}
              onChange={(e) => set(s.name, e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1"
            >
              {(s.choices ?? []).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}
