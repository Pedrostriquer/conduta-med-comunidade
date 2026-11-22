/* Ajustes gerais que o admin muda na tela, sem precisar publicar de novo. */
import { one, q } from "../db";

export type IaConfig = { enabled: boolean; model: string; effort: "low" | "medium" | "high"; thinking: boolean; defaultUsd: number; capUsd: number | null };
/** o chat de IA do app. `includedUsd` é o crédito de API que o plano do dono já traz por mês: só serve para o painel mostrar quanto dele foi usado */
export type ChatConfig = { enabled: boolean; provider: string; model: string; effort: "low" | "medium" | "high"; thinking: boolean; dailyMessages: number; maxRounds: number; includedUsd: number;
  /** se a fonte padrão falhar (limite do plano, chave recusada), a resposta sai por esta; vazio: sem reserva */
  fallbackProvider: string; fallbackModel: string };
export type MailConfig = { from: string; name: string; host: string; port: number };

const DEFAULTS = {
  ia: { enabled: true, model: "claude-haiku-5-5", effort: "low", thinking: true, defaultUsd: 5, capUsd: null } as IaConfig,
  chat: { enabled: false, provider: "anthropic_api", model: "claude-haiku-5-5", effort: "low", thinking: false, dailyMessages: 40, maxRounds: 6, includedUsd: 0, fallbackProvider: "", fallbackModel: "" } as ChatConfig,
  mail: { from: "", name: "Conduta Med", host: "smtp.gmail.com", port: 465 } as MailConfig,
};
type Key = keyof typeof DEFAULTS;
const cache = new Map<Key, unknown>();

export async function getSetting<K extends Key>(key: K): Promise<(typeof DEFAULTS)[K]> {
  if (cache.has(key)) return cache.get(key) as (typeof DEFAULTS)[K];
  const r = await one<{ value: Partial<(typeof DEFAULTS)[K]> }>("SELECT value FROM app_settings WHERE key = $1", [key]);
  const v = { ...DEFAULTS[key], ...(r?.value || {}) };
  cache.set(key, v);
  return v;
}
export async function setSetting<K extends Key>(key: K, patch: Partial<(typeof DEFAULTS)[K]>) {
  const next = { ...(await getSetting(key)), ...patch };
  await q("INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()", [key, JSON.stringify(next)]);
  cache.set(key, next);
  return next;
}
export const clearSettingsCache = () => cache.clear();
