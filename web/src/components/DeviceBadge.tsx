import { useEffect, useState } from "react";

export default function DeviceBadge() {
  const [device, setDevice] = useState<string>("?");
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setDevice(d.device))
      .catch(() => setDevice("offline"));
  }, []);
  return (
    <span className="text-xs px-2 py-0.5 rounded-md border border-border text-muted-foreground">
      {device}
    </span>
  );
}
