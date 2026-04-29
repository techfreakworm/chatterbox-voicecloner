const URL = "https://mayankgupta.in";

export default function MadeBy() {
  return (
    <a
      href={URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Made by Mayank Gupta — opens mayankgupta.in in a new tab"
      className="group block text-center py-6 select-none"
    >
      <div className="label-mono inline-flex items-center gap-1.5 text-muted-foreground">
        <span>Made with</span>
        <span
          aria-hidden
          className="text-[hsl(var(--ember))] group-hover:animate-pulse-dot"
        >
          ♥
        </span>
        <span>by</span>
      </div>
      <div className="display-serif text-[24px] mt-1 transition-colors duration-200 group-hover:text-[hsl(var(--ember))]">
        techfreakworm
      </div>
      <div className="label-mono mt-1 text-muted-foreground/70">2026</div>
    </a>
  );
}
