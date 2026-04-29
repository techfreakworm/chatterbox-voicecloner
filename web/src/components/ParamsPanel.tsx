import type { ParamSpec } from "@/lib/api";
import InfoTip from "@/components/InfoTip";

type Props = {
  specs: ParamSpec[];
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

function ParamLabel({ id, label, help }: { id: string; label: string; help?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <label htmlFor={id} className="label-mono">{label}</label>
      {help && <InfoTip text={help} />}
    </span>
  );
}

function renderControl(
  s: ParamSpec,
  values: Record<string, unknown>,
  set: (name: string, v: unknown) => void,
) {
  const id = `param-${s.name}`;
  const current: unknown = values[s.name] ?? s.default;
  if (s.name === "seed") {
    const v = (values[s.name] ?? s.default) as number;
    return (
      <div key={s.name} className="space-y-1.5">
        <ParamLabel id={id} label={s.label} help={s.help} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <input
            id={id}
            aria-label={s.label}
            type="number"
            min={s.min}
            step={s.step ?? 1}
            value={v}
            onChange={(e) => set(s.name, Number(e.target.value))}
            className="field-input !w-40 sm:!w-44 font-mono text-[12px] py-1"
          />
          <button
            type="button"
            onClick={() => set(s.name, -1)}
            className="label-mono hover:text-foreground transition-colors"
          >
            ↻ random
          </button>
          {v === -1 && (
            <span className="label-mono text-muted-foreground">(random per generate)</span>
          )}
        </div>
      </div>
    );
  }
  if (s.type === "float" || s.type === "int") {
    const n = typeof current === "number" ? current : Number(current);
    return (
      <div key={s.name} className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <ParamLabel id={id} label={s.label} help={s.help} />
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
      </div>
    );
  }
  if (s.type === "bool") {
    return (
      <div key={s.name} className="flex items-center justify-between">
        <ParamLabel id={id} label={s.label} help={s.help} />
        <input
          id={id}
          aria-label={s.label}
          type="checkbox"
          checked={!!current}
          onChange={(e) => set(s.name, e.target.checked)}
          className="accent-[hsl(var(--ember))]"
        />
      </div>
    );
  }
  return (
    <div key={s.name} className="space-y-1.5">
      <ParamLabel id={id} label={s.label} help={s.help} />
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
}

export default function ParamsPanel({ specs, values, onChange }: Props) {
  function set(name: string, v: unknown) {
    onChange({ ...values, [name]: v });
  }
  const basic = specs.filter((s) => (s.group ?? "basic") === "basic");
  const advanced = specs.filter((s) => s.group === "advanced");
  return (
    <div className="space-y-5">
      {basic.map((s) => renderControl(s, values, set))}
      {advanced.length > 0 && (
        <details className="card-paper p-3 [&_summary::-webkit-details-marker]:hidden">
          <summary className="label-mono cursor-pointer select-none flex items-center gap-2">
            <span className="inline-block transition-transform [details[open]>summary>&]:rotate-90">▸</span>
            advanced · {advanced.length} params
          </summary>
          <div className="mt-4 space-y-5">
            {advanced.map((s) => renderControl(s, values, set))}
          </div>
        </details>
      )}
    </div>
  );
}
