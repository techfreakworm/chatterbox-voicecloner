type Props = { visible: boolean; message: string };

export default function LoadingBanner({ visible, message }: Props) {
  if (!visible) return null;
  return (
    <div className="bg-primary/15 text-primary text-sm px-6 py-2 border-b border-primary/30">
      {message}
    </div>
  );
}
