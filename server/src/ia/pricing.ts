/* Preço por milhão de tokens. Claude: conferido em platform.claude.com/docs/en/about-claude/pricing em 22/11/2026.
   O Haiku 5.5 cobra mais caro acima de 100 mil tokens de entrada.
   GPT: conferido em developers.openai.com/api/docs/pricing em 22/11/2026 (entrada e saída). O preço da entrada vinda do cache
   não foi conferido: fica igual ao da entrada cheia, que erra para mais e nunca para menos. */
export type ModelInfo = { label: string; family: "anthropic" | "openai"; in: number; out: number; cacheRead: number; cacheWrite: number; long?: { from: number; in: number; out: number; cacheRead: number; cacheWrite: number } };
export const MODELS: Record<string, ModelInfo> = {
  "claude-haiku-5-5": { label: "Haiku 5.5", family: "anthropic", in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125, long: { from: 100_000, in: 0.5, out: 2.5, cacheRead: 0.05, cacheWrite: 0.625 } },
  "claude-sonnet-5-5": { label: "Sonnet 5.5", family: "anthropic", in: 2, out: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-opus-5-5": { label: "Opus 5.5", family: "anthropic", in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  "gpt-6-luna": { label: "GPT Luna 6", family: "openai", in: 0.1, out: 0.5, cacheRead: 0.1, cacheWrite: 0 },
  "gpt-6.1-terra": { label: "GPT Terra 6.1", family: "openai", in: 1, out: 5, cacheRead: 1, cacheWrite: 0 },
  "gpt-6.2-sol": { label: "GPT Sol 6.2", family: "openai", in: 2, out: 10, cacheRead: 2, cacheWrite: 0 },
  "gpt-6.2-astra": { label: "GPT Astra 6.2", family: "openai", in: 8, out: 40, cacheRead: 8, cacheWrite: 0 },
};
/** as análises (resultado de simulado, flashcards) só rodam no Claude; o chat aceita as duas famílias */
export const isAnalysisModel = (id: string) => MODELS[id]?.family === "anthropic";
export type Usage = { in: number; out: number; cacheRead?: number; cacheWrite?: number };

/** o preço de um modelo; um nome com sufixo (variação do mesmo modelo) usa o do nome mais longo que casa */
export function priceOf(model: string): ModelInfo | null {
  if (MODELS[model]) return MODELS[model];
  const base = Object.keys(MODELS).filter((k) => model.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return base ? MODELS[base] : null;
}

export function costOf(model: string, u: Usage) {
  const m = priceOf(model) || MODELS["claude-sonnet-5-5"];
  const prompt = u.in + (u.cacheRead || 0) + (u.cacheWrite || 0);
  const p = m.long && prompt > m.long.from ? m.long : m;
  return (u.in * p.in + u.out * p.out + (u.cacheRead || 0) * p.cacheRead + (u.cacheWrite || 0) * p.cacheWrite) / 1_000_000;
}

/** português médico, medido nos testes de docs/IA-COMPARATIVO.md; as execuções reais corrigem a estimativa depois (ver runs.ts) */
export const CHARS_PER_TOKEN = 2.3;
export const tokensOf = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);
