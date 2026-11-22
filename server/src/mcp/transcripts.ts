/* Transcrição da correção em vídeo: um arquivo por vídeo, gerado por scripts/gerar-transcricoes.ts. Poucos vídeos ficam em
   memória; cada um tem milhares de linhas e a maioria das chamadas volta aos mesmos. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "../env";

export type Line = [number, string];
const MAX_VIDEOS = 8;
const lru = new Map<string, Line[] | null>();

export async function loadTranscript(videoId: string): Promise<Line[] | null> {
  if (lru.has(videoId)) { const v = lru.get(videoId)!; lru.delete(videoId); lru.set(videoId, v); return v; }
  let lines: Line[] | null = null;
  // o id vem do banco de questões, mas não custa garantir que não sai da pasta
  if (/^[\w-]{6,20}$/.test(videoId)) {
    try { lines = JSON.parse(await readFile(join(env.transcriptsDir, `${videoId}.json`), "utf8")); } catch { lines = null; }
  }
  lru.set(videoId, lines);
  if (lru.size > MAX_VIDEOS) lru.delete(lru.keys().next().value as string);
  return lines;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** as linhas entre dois instantes, com a marca de tempo a cada 30 segundos para a IA poder citar o minuto */
export function slice(lines: Line[], from: number, to: number) {
  const out: string[] = [];
  let mark = -Infinity;
  for (const [t, text] of lines) {
    if (t < from) continue;
    if (t > to) break;
    if (t - mark >= 30) { out.push(`\n[${clock(t)}] `); mark = t; }
    out.push(text + " ");
  }
  return out.join("").trim();
}
