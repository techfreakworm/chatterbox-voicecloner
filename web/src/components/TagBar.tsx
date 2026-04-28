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
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => insert(t)}
          className="text-xs px-2 py-0.5 rounded-md border border-border hover:bg-muted"
        >
          {t}
        </button>
      ))}
    </div>
  );
}
