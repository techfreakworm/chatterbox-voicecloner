import { useEffect, useRef, useState } from "react";

type Props = { text: string };

export default function InfoTip({ text }: Props) {
  const [hover, setHover] = useState(false);
  const [sticky, setSticky] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const open = hover || sticky;

  useEffect(() => {
    if (!sticky) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setSticky(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [sticky]);

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label="What does this parameter do?"
        onClick={(e) => {
          e.stopPropagation();
          setSticky((s) => !s);
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="inline-flex size-4 items-center justify-center rounded-full border border-border text-[10px] font-mono italic text-muted-foreground hover:text-[hsl(var(--ember))] hover:border-[hsl(var(--ember))]/60 transition-colors leading-none"
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 px-3 py-2 rounded-sm border border-border bg-paper text-[11px] leading-snug text-foreground shadow-lg z-50 normal-case tracking-normal pointer-events-none"
        >
          {text}
        </span>
      )}
    </span>
  );
}
