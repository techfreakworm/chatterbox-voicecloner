export type RecorderState = "idle" | "requesting" | "recording" | "stopping" | "error";

type Deps = {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
};

export class Recorder {
  state: RecorderState = "idle";
  lastError: Error | null = null;
  private chunks: BlobPart[] = [];
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private getUserMedia: NonNullable<Deps["getUserMedia"]>;

  constructor(deps: Deps = {}) {
    this.getUserMedia =
      deps.getUserMedia ?? ((c) => navigator.mediaDevices.getUserMedia(c));
  }

  requestStart() {
    this.state = "requesting";
  }

  async start(): Promise<void> {
    this.requestStart();
    try {
      this.stream = await this.getUserMedia({ audio: true });
    } catch (e) {
      this.lastError = e as Error;
      this.state = "error";
      throw e;
    }
    this.chunks = [];
    this.rec = new MediaRecorder(this.stream);
    this.rec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) this.chunks.push(ev.data);
    };
    this.rec.start();
    this.state = "recording";
  }

  stop(): Promise<Blob | null> {
    if (this.state === "idle") return Promise.resolve(null);
    return new Promise((resolve) => {
      if (!this.rec) {
        this.state = "idle";
        resolve(null);
        return;
      }
      this.state = "stopping";
      this.rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.rec?.mimeType ?? "audio/webm" });
        this.chunks = [];
        this.rec = null;
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;
        this.state = "idle";
        resolve(blob);
      };
      this.rec.stop();
    });
  }
}
