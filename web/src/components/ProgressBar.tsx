import { useProgress } from "@/lib/progress";

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function ProgressBar() {
  const state = useProgress();
  if (state.phase === "idle") return null;

  if (state.phase === "error") {
    return (
      <div className="sticky top-0 z-40 border-b border-red-900/40 bg-red-950/80 backdrop-blur-md px-8 py-2.5">
        <span className="label-mono text-red-400">progress error</span>
        <span className="ml-3 text-sm text-red-300/90">{state.message}</span>
      </div>
    );
  }

  const isRunning = state.phase === "running";
  const isDialog = isRunning && state.kind === "dialog";
  const fill =
    state.phase === "done"
      ? 1
      : isDialog && state.total > 0
      ? state.turn / state.total
      : null;

  const elapsedS = state.phase === "running" ? state.elapsedS : state.phase === "done" ? state.elapsedS : 0;
  const label =
    state.phase === "done"
      ? `done · ${fmt(elapsedS)}`
      : isDialog
      ? `Turn ${state.turn} of ${state.total} · ${fmt(elapsedS)}`
      : `Generating · ${fmt(elapsedS)}`;

  return (
    <div className="sticky top-0 z-40 border-b border-[hsl(var(--ember))]/30 bg-[hsl(var(--ember))]/15 backdrop-blur-md px-8 py-2">
      <div className="flex items-center gap-4">
        <span className="label-mono text-[hsl(var(--ember))] whitespace-nowrap">
          {label}
        </span>
        <div className="flex-1 h-1 bg-[hsl(var(--ember))]/20 rounded-sm overflow-hidden">
          {fill === null ? (
            <div className="h-full w-1/3 bg-[hsl(var(--ember))] animate-progress-stripe" />
          ) : (
            <div
              className="h-full bg-[hsl(var(--ember))] transition-[width] duration-200 ease-linear"
              style={{ width: `${fill * 100}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
