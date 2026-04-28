/**
 * Encode a decoded AudioBuffer as a 16-bit PCM mono WAV Blob.
 * Used at upload/record time so the server (libsndfile) can always decode it.
 */
export function encodeWav(buf: AudioBuffer): Blob {
  const sr = buf.sampleRate;
  const length = buf.length;
  const numCh = 1;

  // Mix down to mono in float32
  const mono = new Float32Array(length);
  const ch0 = buf.getChannelData(0);
  if (buf.numberOfChannels === 1) {
    mono.set(ch0);
  } else {
    const ch1 = buf.getChannelData(1);
    for (let i = 0; i < length; i++) mono[i] = (ch0[i] + ch1[i]) / 2;
  }

  // Convert to int16
  const dataSize = length * numCh * 2;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  let p = 0;
  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i));
  };
  const writeU32 = (n: number) => {
    view.setUint32(p, n, true);
    p += 4;
  };
  const writeU16 = (n: number) => {
    view.setUint16(p, n, true);
    p += 2;
  };

  writeStr("RIFF");
  writeU32(36 + dataSize);
  writeStr("WAVE");
  writeStr("fmt ");
  writeU32(16);
  writeU16(1); // PCM
  writeU16(numCh);
  writeU32(sr);
  writeU32(sr * numCh * 2);
  writeU16(numCh * 2);
  writeU16(16);
  writeStr("data");
  writeU32(dataSize);

  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([out], { type: "audio/wav" });
}
