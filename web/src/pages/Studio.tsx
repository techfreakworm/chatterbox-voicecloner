export default function Studio() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="size-2.5 rounded-full bg-primary" />
          <span className="font-medium">Chatterbox Voice Studio</span>
        </div>
        <div className="text-sm text-muted-foreground">stub</div>
      </header>
      <main className="flex-1 grid lg:grid-cols-[1fr_420px] gap-6 p-6">
        <section className="space-y-4">Composer goes here</section>
        <aside className="space-y-4">Workspace goes here</aside>
      </main>
    </div>
  );
}
