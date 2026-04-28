import { useEffect, useState } from "react";

export default function DeviceBadge() {
  const [device, setDevice] = useState<string>("…");
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setDevice(d.device))
      .catch(() => setDevice("offline"));
  }, []);
  return (
    <div className="flex items-center gap-2">
      <span className="label-mono">device</span>
      <span className="font-mono text-[12px] tracking-wider text-foreground">
        {device}
      </span>
    </div>
  );
}
