/* Peças da página "Sua IA" que o onboarding também usa: dados de /api/plugin, copiar com plano B e os passos de conexão. */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiGet } from "../../api/client";
import type { PluginSetup, PluginStatus } from "../../api/types";
import { Button, Chip } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Pulse } from "../../ds/medical";
import { Sheet } from "../../ds/overlay";
import { num } from "../../lib/format";

/** o que dá para pedir de verdade, com as palavras de quem estuda */
export const IDEAS = [
  "Por que eu ando errando em cardiologia?",
  "Monte uma lista de 30 questões com base no meu cronograma",
  "Crie flashcards das questões que errei essa semana",
  "Aqui estão os prints do cronograma que eu usava em outro app: monte igual",
  "Como eu faço para importar meu baralho do Anki aqui?",
];

export function agoText(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "agora há pouco";
  const m = Math.round(s / 60);
  if (m < 60) return `há ${num(m)} min`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? "há 1 hora" : `há ${num(h)} horas`;
  const d = Math.round(h / 24);
  if (d < 30) return d === 1 ? "ontem" : `há ${num(d)} dias`;
  return new Date(ms).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
}

/** roda agora e a cada `ms`, só com a aba visível */
export function usePoll(fn: () => void, ms: number, on = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!on) return;
    ref.current();
    const t = setInterval(() => { if (document.visibilityState === "visible") ref.current(); }, ms);
    const back = () => { if (document.visibilityState === "visible") ref.current(); };
    document.addEventListener("visibilitychange", back);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", back); };
  }, [ms, on]);
}

export function usePluginSetup() {
  const [setup, setSetup] = useState<PluginSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    apiGet<PluginSetup>("/plugin/setup").then(setSetup).catch((e) => setError(e instanceof ApiError ? e.message : "Não foi possível carregar agora."));
  }, []);
  useEffect(load, [load]);
  return { setup, error, retry: load };
}

/** o estado da conexão, consultado a cada 5 s enquanto a tela está aberta: muda sozinho quando a IA conecta */
export function usePluginStatus() {
  const [status, setStatus] = useState<PluginStatus | null>(null);
  const refresh = useCallback(() => apiGet<PluginStatus>("/plugin/status").then(setStatus).catch(() => { /* a próxima consulta tenta de novo */ }), []);
  usePoll(refresh, 5000);
  return { status, refresh };
}

export const isConnected = (s: PluginStatus | null) => !!s && (s.connections.length > 0 || s.sharedSessions.length > 0);

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    // navegador sem permissão: o jeito antigo ainda funciona na maioria
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/** copiar. Se o navegador não deixar, abre o texto para a pessoa copiar na mão */
export function CopyButton({ text, label, done = "Copiado", variant = "filled", size, block, icon = "clipboard", title = "Copie este texto", onCopied }: {
  text: string; label: string; done?: string; variant?: "filled" | "gray" | "tinted" | "plain"; size?: "sm" | "lg"; block?: boolean; icon?: string; title?: string; onCopied?: () => void;
}) {
  const [ok, setOk] = useState(false), [manual, setManual] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <>
      <Button variant={variant} size={size} block={block} icon={ok ? "check" : icon} aria-live="polite" onClick={async () => {
        if (await copyText(text)) { setOk(true); onCopied?.(); clearTimeout(timer.current); timer.current = window.setTimeout(() => setOk(false), 2500); }
        else setManual(true);
      }}>{ok ? done : label}</Button>
      <Sheet open={manual} onClose={() => setManual(false)} title={title} subtitle="Selecione tudo e copie." width={640}>
        <textarea className="fc-input fc-input--area fc-input--mono plg-manual" readOnly rows={14} value={text} aria-label={title} onFocus={(e) => e.currentTarget.select()} />
      </Sheet>
    </>
  );
}

/** recolhido: passos manuais, avançado, o que ela faz */
export function More({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="plg-more" open={defaultOpen}>
      <summary><Icon name="chevron-right" size={16} strokeWidth={2} className="plg-more__chev" />{title}</summary>
      <div className="plg-more__body">{children}</div>
    </details>
  );
}

/** os passos para conectar: qual IA, copiar o prompt, e o estado que muda sozinho */
/** "Claude (site e aplicativo de computador)" → "Claude" */
const shortName = (name: string) => name.replace(/\s*\(.*\)\s*$/, "");

/** os passos na mão para cada IA: normal ou conta compartilhada */
export function ManualSteps({ setup, shared }: { setup: PluginSetup; shared?: boolean }) {
  const [client, setClient] = useState(setup.clients[0]?.id ?? "");
  const cur = setup.clients.find((c) => c.id === client);
  const url = shared ? setup.urlCompartilhado : setup.urlNormal;
  const steps = shared ? cur?.stepsCompartilhado : cur?.steps;
  return (
    <More title="Prefiro fazer os passos na mão">
      <div className="chips" role="group" aria-label="Passos para qual IA">
        {setup.clients.map((c) => <Chip key={c.id} pressed={client === c.id} onChange={() => setClient(c.id)}>{shortName(c.name)}</Chip>)}
      </div>
      {steps?.length ? <ol className="plg-manualsteps">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol> : null}
      <div className="plg-copyrow"><code>{url}</code><CopyButton variant="gray" size="sm" icon="copy" text={url} label="Copiar o endereço" /></div>
    </More>
  );
}

/** Claude: o link abre "Adicionar conector personalizado" já com o nome e o endereço */
export function ClaudeShortcut({ href, shared }: { href: string; shared?: boolean }) {
  return (
    <div className="plg-shortcut">
      <a className="cd-btn cd-hoverable cd-btn--filled cd-btn--lg" href={href} target="_blank" rel="noopener noreferrer"><span>Adicionar ao Claude</span><Icon name="external" size={18} /></a>
      <p className="fc-help">Abre o Claude com tudo preenchido. Toque em Continuar e depois em Conectar.{shared ? " Depois, num chat novo, diga o seu @ e o código." : " Ele abre o Conduta Med para você entrar e tocar em Permitir."}</p>
    </div>
  );
}

export function ConnectSteps({ setup, connected, onCopied, another }: { setup: PluginSetup; connected: boolean; onCopied?: () => void; /** já há uma conectada: é só o caminho para outra */ another?: boolean }) {
  const [client, setClient] = useState<string | null>(null);
  const cur = setup.clients.find((c) => c.id === client);
  return (
    <ol className="plg-steps">
      <li>
        <span className="plg-steps__n num" aria-hidden>1</span>
        <div className="plg-steps__body">
          <h3>Qual IA você usa?</h3>
          <div className="chips" role="group" aria-label="Qual IA você usa">
            {setup.clients.map((c) => <Chip key={c.id} pressed={client === c.id} onChange={() => setClient(c.id)}>{shortName(c.name)}</Chip>)}
          </div>
        </div>
      </li>
      <li>
        <span className="plg-steps__n num" aria-hidden>2</span>
        <div className="plg-steps__body">
          {cur?.id === "claude" ? (
            <>
              <h3>Adicione ao Claude com um toque</h3>
              <ClaudeShortcut href={setup.claudeLinks.normal} />
              <More title="Prefiro que o Claude me guie">
                <p>Copie este pedido, abra um chat novo no Claude e cole. Ele te guia no resto.</p>
                <CopyButton variant="gray" text={setup.prompts.normal} label="Copiar o prompt" title="O pedido para a sua IA" onCopied={onCopied} />
              </More>
            </>
          ) : (
            <>
              <h3>Copie este pedido e cole num chat novo</h3>
              <p>{cur ? `Abra um chat novo no ${shortName(cur.name)} e cole.` : "Abra um chat novo na sua IA e cole."} Ela te guia no resto.</p>
              <CopyButton text={setup.prompts.normal} label="Copiar o prompt" size="lg" title="O pedido para a sua IA" onCopied={onCopied} />
            </>
          )}
          {cur?.steps.length ? (
            <More title={`Prefiro fazer os passos na mão no ${shortName(cur.name)}`}>
              <ol className="plg-manualsteps">{cur.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              <div className="plg-copyrow"><code>{setup.urlNormal}</code><CopyButton variant="gray" size="sm" icon="copy" text={setup.urlNormal} label="Copiar o endereço" /></div>
            </More>
          ) : null}
        </div>
      </li>
      {another ? null : <li>
        <span className="plg-steps__n num" aria-hidden>3</span>
        <div className="plg-steps__body">
          {connected ? (
            <>
              <h3 className="plg-ok"><Icon name="check" size={18} strokeWidth={2.5} />Pronto, ela já está conectada</h3>
              <p>Tudo que ela criar ou mudar pede a sua confirmação antes.</p>
            </>
          ) : (
            <>
              <h3>Quando ela conectar, esta tela muda sozinha</h3>
              <div className="plg-waiting"><Pulse size={64} label="Esperando a conexão" /><span>Esperando a conexão</span></div>
            </>
          )}
        </div>
      </li>}
    </ol>
  );
}
