/* O tipo real de um arquivo, pelos primeiros bytes. O nome e o Content-Type vêm de quem envia e não valem nada. */
export type Sniffed = { kind: "image" | "audio"; ext: string };

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HEIF = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);
const AVIF = new Set(["avif", "avis"]);
const M4A = new Set(["m4a", "m4b", "m4p", "f4a"]);
const DIB_SIZES = new Set([12, 40, 52, 56, 108, 124]);

export function sniff(b: Buffer): Sniffed | null {
  if (b.length < 12) return null;
  const ascii = (at: number, n: number) => b.toString("latin1", at, at + n);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: "image", ext: "jpg" };
  if (b.subarray(0, 8).equals(PNG)) return { kind: "image", ext: "png" };
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return { kind: "image", ext: "gif" };
  // "BM" sozinho seria qualquer texto: confere também o tamanho do cabeçalho interno
  if (ascii(0, 2) === "BM" && b.length >= 18 && DIB_SIZES.has(b.readUInt32LE(14))) return { kind: "image", ext: "bmp" };
  if (ascii(0, 4) === "RIFF") {
    if (ascii(8, 4) === "WEBP") return { kind: "image", ext: "webp" };
    if (ascii(8, 4) === "WAVE") return { kind: "audio", ext: "wav" };
    return null;
  }
  if (ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4).trim().toLowerCase();
    if (HEIF.has(brand)) return { kind: "image", ext: "heic" };
    if (AVIF.has(brand)) return { kind: "image", ext: "avif" };
    if (M4A.has(brand)) return { kind: "audio", ext: "m4a" };
    return null;
  }
  if (ascii(0, 4) === "OggS") return { kind: "audio", ext: "ogg" };
  if (ascii(0, 4) === "fLaC") return { kind: "audio", ext: "flac" };
  if (ascii(0, 3) === "ID3") return { kind: "audio", ext: "mp3" };
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0) return { kind: "audio", ext: "mp3" };
  return null;
}
