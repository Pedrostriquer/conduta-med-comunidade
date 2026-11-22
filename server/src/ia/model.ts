/* A chamada ao modelo. Saída sempre em JSON validado; em teste, `setModelCaller` troca a chamada de verdade. */
import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "../lib/secrets";
import type { Usage } from "./pricing";

export type ModelCall = { model: string; effort: string; thinking?: boolean; system: string; user: string; schema: Record<string, unknown>; maxTokens: number };
export type ModelReply = { text: string; usage: Usage; stop: string };
type Caller = (c: ModelCall) => Promise<ModelReply>;
let fake: Caller | null = null;
export const setModelCaller = (f: Caller | null) => { fake = f; };

export class ModelError extends Error {
  /** `kind`: "limite" (acabou a cota ou o crédito da fonte) e "fonte" (credencial, modelo ou pedido recusado) deixam o chat tentar a fonte reserva */
  constructor(message: string, public usage?: Usage, public kind?: "limite" | "fonte") { super(message); }
}

/** desliga o raciocínio onde dá: cada modelo desliga de um jeito (o Opus 5.5 não desliga) */
export const thinkingParam = (model: string, thinking: boolean) =>
  (thinking ? {} : model.includes("haiku") ? { thinking: { type: "disabled" as const } } : model.includes("sonnet") ? { thinking: { type: "between_tools" } as never } : {});

export async function hasApiKey() { return !!fake || !!(await getSecret("anthropic")); }

export async function callModel(c: ModelCall): Promise<ModelReply> {
  if (fake) return fake(c);
  const apiKey = await getSecret("anthropic");
  if (!apiKey) throw new ModelError("Sem chave de API cadastrada.");
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 180_000 });
  try {
    const stream = client.messages.stream({
      model: c.model, max_tokens: c.maxTokens, system: c.system,
      messages: [{ role: "user", content: c.user }],
      output_config: { effort: c.effort as "low" | "medium" | "high", format: { type: "json_schema", schema: c.schema } },
      // o raciocínio é o que mais pesa na conta; cada modelo desliga de um jeito (o Opus 5.5 não desliga)
      ...thinkingParam(c.model, c.thinking !== false),
    });
    const m = await stream.finalMessage();
    const u = m.usage;
    const usage: Usage = { in: u.input_tokens, out: u.output_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 };
    if (m.stop_reason === "refusal") throw new ModelError("O modelo recusou esta análise.", usage);
    if (m.stop_reason === "max_tokens") throw new ModelError("A resposta passou do limite de tamanho.", usage);
    const text = m.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return { text, usage, stop: m.stop_reason ?? "" };
  } catch (e) {
    if (e instanceof ModelError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new ModelError("A chave de API foi recusada.");
    if (e instanceof Anthropic.RateLimitError) throw new ModelError("Muitas chamadas à IA agora. Tente de novo em instantes.");
    if (e instanceof Anthropic.APIError) throw new ModelError(`A API respondeu ${e.status ?? "com erro"}: ${e.message}`.slice(0, 300));
    throw e;
  }
}

/** valida a chave com a menor chamada possível */
export async function pingModel(model: string) {
  const r = await callModel({ model, effort: "low", thinking: false, system: "Responda em JSON.", user: "Diga ok.", schema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } }, maxTokens: 400 });
  return r.usage;
}
