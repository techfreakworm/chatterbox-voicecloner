import type { RefObject } from "react";

type Props = {
  tags: string[];
  targetRef: RefObject<HTMLTextAreaElement>;
};

export default function TagBar({ tags, targetRef }: Props) {
  if (tags.length === 0) return null;
  function insert(tag: string) {
    const el = targetRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const native = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    native?.call(el, before + tag + after);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    const cursor = start + tag.length;
    el.setSelectionRange(cursor, cursor);
    el.focus();
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="label-mono mr-1">insert</span>
      {tags.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => insert(t)}
          className="font-mono text-[11px] px-2 py-0.5 rounded-sm border border-border text-muted-foreground hover:text-[hsl(var(--ember))] hover:border-[hsl(var(--ember))]/50 transition-colors"
        >
          {t}
        </button>
      ))}
    </div>
  );
}
