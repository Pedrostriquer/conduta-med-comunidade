/* Para onde mandar quem abre o app: enquanto não sabemos se há sessão, espera; sem conta → entrar. As boas-vindas
   (prova-alvo, meta, cronograma) são opcionais: ninguém é obrigado a passar por elas. */
import { useAuth } from "../../state/auth";

/** abertas para quem não tem conta */
const OPEN = ["/entrar", "/criar-conta", "/conectar", "/termos"];

const within = (path: string, base: string) => path === base || path.startsWith(base + "/");

/** só endereços daqui de dentro: `next` vem da URL */
export function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export type Gate = { wait: boolean; to: string | null };

export function useAuthGate(path: string, search: string): Gate {
  const status = useAuth((s) => s.status), user = useAuth((s) => s.user);
  if (path === "/termos") return { wait: false, to: null };
  if (status === "loading" && !user) return { wait: true, to: null };
  const params = new URLSearchParams(search);
  if (OPEN.some((p) => within(path, p))) {
    // já tem conta: entrar e criar conta não têm o que fazer aqui, a não ser redefinir a senha por um link
    if (user && (path === "/entrar" || path === "/criar-conta") && !params.has("redefinir")) return { wait: false, to: safeNext(params.get("next")) || "/" };
    return { wait: false, to: null };
  }
  if (!user) return { wait: false, to: "/entrar" + (path !== "/" ? "?next=" + encodeURIComponent(path + search) : "") };
  return { wait: false, to: null };
}
