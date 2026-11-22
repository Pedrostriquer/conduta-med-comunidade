/* Chamadas à API. Mesmo domínio em produção e proxy do Vite em desenvolvimento; a sessão vai no cookie. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) { super(message); }
}

type Opts = { method?: string; body?: unknown; signal?: AbortSignal };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const init: RequestInit = { method: opts.method || (opts.body !== undefined ? "POST" : "GET"), credentials: "same-origin", signal: opts.signal };
  if (opts.body instanceof FormData) init.body = opts.body;
  else if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers = { "Content-Type": "application/json" }; }
  let res: Response;
  try { res = await fetch("/api" + path, init); } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "sem_rede", "Sem conexão com o servidor. Confira a internet e tente de novo.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code || "erro", data?.error?.message || "Algo deu errado. Tente de novo.", data || undefined);
  return data as T;
}
export const apiGet = <T = any>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const apiPost = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body });
export const apiPatch = <T = any>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body });
export const apiDelete = <T = any>(path: string, body?: unknown) => api<T>(path, { method: "DELETE", body });
