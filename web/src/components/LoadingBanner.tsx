type Props = { visible: boolean; message: string };

export default function LoadingBanner({ visible, message }: Props) {
  if (!visible) return null;
  return (
    <div className="border-b border-[hsl(var(--ember))]/30 bg-[hsl(var(--ember))]/10 px-4 sm:px-8 py-2.5">
      <div className="flex items-center gap-3">
        <span className="size-1.5 rounded-full bg-[hsl(var(--ember))] animate-pulse-dot" />
        <span className="label-mono text-[hsl(var(--ember))]">{message}</span>
      </div>
    </div>
  );
}
