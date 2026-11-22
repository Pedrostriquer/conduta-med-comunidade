/* "Sua IA": para quem não entende de IA. O estado no topo, o caminho principal (qual IA, copiar o prompt, muda sozinho
   quando conecta) e o modo para quem divide a conta de IA com outras pessoas. Conexões e o resto ficam mais abaixo. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "../../api/client";
import type { PluginSetup, PluginStatus } from "../../api/types";
import { Page, Section } from "../../app/Page";
import { Badge, Button, Switch } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Dialog, useToast } from "../../ds/overlay";
import { ProgressRing } from "../../ds/progress";
import { cx } from "../../lib/cx";
import { clock, dayKey, plural, relativeDay } from "../../lib/format";
import { useNow } from "../../lib/hooks";
import { useAuth } from "../../state/auth";
import { agoText, ClaudeShortcut, ConnectSteps, CopyButton, IDEAS, isConnected, ManualSteps, More, usePluginSetup, usePluginStatus, usePoll } from "./parts";

const CODE_MS = 10 * 60_000;
type Mode = "normal" | "compartilhada";
type Code = { code: string; expiresAt: number; handle: string };

export function PluginPage() {
  const { setup, error, retry } = usePluginSetup();
  const { status, refresh } = usePluginStatus();
  // /plugin/codigo: o link que a IA manda na conta compartilhada abre direto no código
  const atCode = useLocation().pathname === "/plugin/codigo";
  const [mode, setMode] = useState<Mode | null>(atCode ? "compartilhada" : null);
  // o modo vem ligado para todo mundo: a aba só abre nele para quem já está usando
  const shown: Mode = mode ?? (status?.sharedMode && status.sharedSessions.length && !status.connections.length ? "compartilhada" : "normal");
  const connected = isConnected(status);

  return (
    <Page title="Sua IA" subtitle="Conecte a IA que você já usa aos seus estudos. Ela organiza, ensina a usar a plataforma e encontra padrões nos seus erros.">
      <StatusBanner status={status} />
      {error ? (
        <div className="empty plg-error"><Icon name="alert" size={22} /><p>{error}</p><Button variant="gray" onClick={retry}>Tentar de novo</Button></div>
      ) : !setup ? <div className="plg-loading" aria-busy="true"><span className="cd-spinner" aria-label="Carregando" /></div> : (
        <div className="cols cols--wide-aside">
          <div className="cols__main">
            <h2 className="plg-modes__q">Primeiro: mais alguém entra com o mesmo login da sua IA?</h2>
            <div className="plg-modes" role="radiogroup" aria-label="Mais alguém entra com o mesmo login da sua IA?">
              <button type="button" role="radio" aria-checked={shown === "normal"} className="plg-mode cd-hoverable" onClick={() => setMode("normal")}>
                <Icon name="user" size={22} /><span><b>Não, só eu</b><span>Conecta uma vez e pronto.</span></span>
              </button>
              <button type="button" role="radio" aria-checked={shown === "compartilhada"} className="plg-mode cd-hoverable" onClick={() => setMode("compartilhada")}>
                <Icon name="users" size={22} /><span><b>Sim, divido o login</b><span>Assinatura dividida com amigos ou família, por exemplo. Assim ninguém mais vê seus estudos: em cada chat você informa o seu @ e um código.</span></span>
              </button>
            </div>
            {shown === "normal" ? (
              status?.connections.length ? (
                <section className="panel plg-connected">
                  <h3 className="plg-ok"><Icon name="check" size={18} strokeWidth={2.5} />Pronto, ela já está conectada</h3>
                  <p>Abra um chat novo na sua IA e peça o que precisar. Tudo que ela criar ou mudar pede a sua confirmação antes.</p>
                  <More title="Conectar outra IA"><ConnectSteps setup={setup} connected another /></More>
                </section>
              ) : <section className="panel"><ConnectSteps setup={setup} connected={false} /></section>
            ) : <SharedPanel setup={setup} status={status} refresh={refresh} />}
          </div>
          <aside className="cols__aside">
            <Ideas highlight={connected} />
            <Section title="O que ela consegue fazer"><Tools setup={setup} /></Section>
          </aside>
        </div>
      )}
      {status ? <Connections status={status} refresh={refresh} /> : null}
      {setup ? <Advanced setup={setup} refresh={refresh} /> : null}
    </Page>
  );
}

function StatusBanner({ status }: { status: PluginStatus | null }) {
  if (!status) return <div className="plg-status" aria-busy="true"><span className="plg-status__dot" /><b>Conferindo a conexão…</b></div>;
  const on = isConnected(status);
  return (
    <div className={cx("plg-status", on && "is-on")} role="status">
      <span className="plg-status__dot" aria-hidden />
      <b>{!on ? "Sua IA ainda não está conectada" : status.lastUsedAt ? `Conectada, usada ${agoText(status.lastUsedAt)}` : "Conectada, ainda sem uso"}</b>
      {on ? <Link to="/plugin/atividade" className="plg-status__link">Ver o que ela fez</Link> : null}
    </div>
  );
}

function Ideas({ highlight }: { highlight: boolean }) {
  return (
    <Section title={highlight ? "O que pedir primeiro" : "O que dá para pedir"}>
      <ul className="plg-ideas">
        {IDEAS.map((t) => (
          <li key={t}><span>“{t}”</span><CopyButton variant="plain" size="sm" icon="copy" text={t} label="Copiar" title="O pedido" /></li>
        ))}
      </ul>
    </Section>
  );
}

function Tools({ setup }: { setup: PluginSetup }) {
  const groups = useMemo(() => {
    const m = new Map<string, string[]>();
    // entrar e sair com código são detalhe do modo compartilhado, que já tem explicação própria
    for (const t of setup.tools) { if (t.group === "Conta compartilhada") continue; const l = m.get(t.group) || []; l.push(t.summary); m.set(t.group, l); }
    return [...m.entries()];
  }, [setup]);
  return (
    <div className="plg-tools">
      {groups.map(([g, list]) => (
        <More key={g} title={g}>
          <ul>{list.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </More>
      ))}
    </div>
  );
}

/* ---------- conta compartilhada ---------- */
function SharedPanel({ setup, status, refresh }: { setup: PluginSetup; status: PluginStatus | null; refresh: () => void }) {
  const toast = useToast();
  const refreshMe = useAuth((s) => s.refreshMe);
  const on = !!status?.sharedMode;
  const [busy, setBusy] = useState(false);
  const toggle = async (v: boolean) => {
    setBusy(true);
    try { await apiPatch("/plugin/settings", { sharedMode: v }); await refresh(); void refreshMe(); }
    catch (e) { toast({ icon: "alert", text: e instanceof ApiError ? e.message : "Não deu para mudar agora." }); }
    setBusy(false);
  };
  return (
    <section className="panel plg-shared">
      <p className="plg-shared__why">Em cada chat você informa o seu @ e um código que muda. Depois de 2 horas sem uso ou 24 horas no total, ela pede outro. Assim, quem usa a mesma conta de IA não entra nos seus estudos.</p>
      <label className="plg-switch"><span><b>Usar este modo</b><span>{on ? "Ligado" : "Desligado: nenhum código funciona"}</span></span>
        <Switch checked={on} onChange={(v) => { if (!busy) void toggle(v); }} label="Usar o modo de conta compartilhada" />
      </label>
      {on ? <SharedCode setup={setup} status={status} refresh={refresh} /> : <p className="fc-help">Ligue este modo para ver o seu código.</p>}
      {on && status?.sharedSessions.length ? <SharedSessions status={status} refresh={refresh} /> : null}
    </section>
  );
}

function SharedCode({ setup, status, refresh }: { setup: PluginSetup; status: PluginStatus | null; refresh: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState<Code | null>(null);
  const [rotating, setRotating] = useState(false);
  const now = useNow(1000);
  const sessions = status?.sharedSessions.length ?? 0;
  const seen = useRef(sessions);
  // a cada 5 s: quando o código é usado, o servidor gera outro e a sessão nova aparece
  usePoll(() => { apiGet<Code>("/plugin/code").then(setCode).catch(() => {}); }, 5000);
  useEffect(() => {
    if (sessions > seen.current) { toast({ icon: "check", text: "Código usado: sua IA entrou neste chat." }); apiGet<Code>("/plugin/code").then(setCode).catch(() => {}); }
    seen.current = sessions;
  }, [sessions, toast]);
  const left = code ? Math.max(0, code.expiresAt - now) : 0;
  useEffect(() => { if (code && left === 0) { apiGet<Code>("/plugin/code").then(setCode).catch(() => {}); refresh(); } }, [left === 0, code?.code]); // eslint-disable-line
  const rotate = async () => {
    setRotating(true);
    try { setCode(await apiPost<Code>("/plugin/code/rotate")); }
    catch (e) { toast({ icon: "alert", text: e instanceof ApiError ? e.message : "Não deu para gerar outro agora." }); }
    setRotating(false);
  };
  // quem chega pelo link do código vai direto para ele
  const box = useRef<HTMLDivElement>(null);
  const atCode = useLocation().pathname === "/plugin/codigo";
  useEffect(() => { if (atCode && code) box.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [atCode, !!code]); // eslint-disable-line
  if (!code) return <div className="plg-loading" aria-busy="true"><span className="cd-spinner" aria-label="Carregando" /></div>;
  const prompt = setup.prompts.compartilhado;
  return (
    <div className="plg-code" id="codigo" ref={box}>
      <div className="plg-code__main">
        <ProgressRing value={left / CODE_MS} size={92} stroke={7} animateIn={false} label={`O código vale por mais ${clock(left / 1000)}`} text={clock(left / 1000)} />
        <dl className="plg-code__data">
          <div><dt>Seu @</dt><dd>@{code.handle}</dd></div>
          <div><dt>Código</dt><dd className="plg-code__value num">{code.code}</dd></div>
        </dl>
      </div>
      <div className="plg-code__acts">
        <CopyButton variant="filled" icon="copy" text={code.code} label="Copiar o código" title="O código" />
        <Button variant="gray" icon="rotate" loading={rotating} onClick={rotate}>Gerar outro</Button>
      </div>
      <p className="fc-help">Só serve uma vez e vale 10 minutos. Numa conversa nova, ela pede o seu @ e este código.</p>
      <div className="plg-code__prompt">
        <h3>Primeira vez? No Claude, adicione com um toque</h3>
        <ClaudeShortcut href={setup.claudeLinks.compartilhado} shared />
        <p className="fc-help">Em outra IA, cole este pedido num chat novo e ela te guia.</p>
        <CopyButton variant="gray" text={prompt} label="Copiar o prompt deste modo" title="O pedido para a sua IA" />
        <ManualSteps setup={setup} shared />
      </div>
    </div>
  );
}

function SharedSessions({ status, refresh }: { status: PluginStatus; refresh: () => void }) {
  const toast = useToast();
  const close = async (id: string) => {
    try { await apiDelete("/plugin/shared-sessions/" + id); toast({ icon: "check", text: "Sessão encerrada." }); refresh(); }
    catch (e) { toast({ icon: "alert", text: e instanceof ApiError ? e.message : "Não deu para encerrar agora." }); }
  };
  return (
    <div className="plg-sessions">
      <h3>Chats abertos com você agora</h3>
      <ul className="list">
        {status.sharedSessions.map((s) => (
          <li key={s.id}><div className="row row--2">
            <span className="row__main"><span className="row__title">Aberto {agoText(s.createdAt)}</span><span className="row__sub">Usado {agoText(s.lastUsedAt)}. Termina sozinho às {new Date(s.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} se não for usado.</span></span>
            <Button variant="gray" size="sm" onClick={() => close(s.id)}>Encerrar</Button>
          </div></li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- conexões ---------- */
function Connections({ status, refresh }: { status: PluginStatus; refresh: () => void }) {
  const toast = useToast();
  const [leaving, setLeaving] = useState<{ id: string; label: string } | null>(null);
  if (!status.connections.length) return null;
  const off = async () => {
    if (!leaving) return;
    try { await apiDelete("/plugin/connections/" + leaving.id); toast({ icon: "check", text: `${leaving.label} desconectada.` }); refresh(); }
    catch (e) { toast({ icon: "alert", text: e instanceof ApiError ? e.message : "Não deu para desconectar agora." }); }
    setLeaving(null);
  };
  return (
    <Section title="Conexões ativas">
      <ul className="list">
        {status.connections.map((c) => (
          <li key={c.id}><div className="row row--2">
            <span className="row__main">
              <span className="row__title">{c.label} {c.kind === "pessoal" ? <Badge tone="outline">token pessoal</Badge> : null}</span>
              <span className="row__sub">{c.lastUsedAt ? `Usada ${agoText(c.lastUsedAt)}` : "Ainda sem uso"} · conectada {agoText(c.createdAt)}</span>
            </span>
            <Button variant="gray" size="sm" onClick={() => setLeaving({ id: c.id, label: c.label })}>Desconectar</Button>
          </div></li>
        ))}
      </ul>
      <Dialog open={!!leaving} onClose={() => setLeaving(null)} destructive confirmLabel="Desconectar" title={`Desconectar ${leaving?.label ?? ""}?`} onConfirm={off}>
        Ela deixa de ver seus estudos na hora. O que ela já criou continua aqui. Para voltar, é só conectar de novo.
      </Dialog>
    </Section>
  );
}

/* ---------- avançado ---------- */
function Advanced({ setup, refresh }: { setup: PluginSetup; refresh: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const r = await apiPost<{ id: string; token: string }>("/plugin/tokens", { label: label.trim() || "Token pessoal" });
      setToken(r.token); setLabel(""); refresh();
    } catch (e) { toast({ icon: "alert", text: e instanceof ApiError ? e.message : "Não deu para gerar agora." }); }
    setBusy(false);
  };
  return (
    <Section className="plg-advanced">
      <More title="Avançado: token pessoal (Claude Code, Cursor)">
        <p className="fc-help">Para quem usa ferramentas de programação. Use no cabeçalho <code>Authorization: Bearer</code> do endereço abaixo. Quem tem o token vê os seus estudos: trate como uma senha.</p>
        <div className="plg-copyrow"><code>{setup.urlNormal}</code><CopyButton variant="gray" size="sm" icon="copy" text={setup.urlNormal} label="Copiar o endereço" /></div>
        {token ? (
          <div className="plg-token" role="status">
            <b><Icon name="alert" size={16} />Copie agora: este token não aparece de novo.</b>
            <div className="plg-copyrow"><code>{token}</code><CopyButton variant="filled" size="sm" icon="copy" text={token} label="Copiar" title="Seu token" /></div>
            <Button variant="plain" size="sm" onClick={() => setToken(null)}>Já copiei</Button>
          </div>
        ) : (
          <form className="plg-tokenform" onSubmit={(e) => { e.preventDefault(); void make(); }}>
            <label className="fc-field"><span className="fc-field__label">Nome, para reconhecer depois</span>
              <input className="fc-input" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="Claude Code no notebook" /></label>
            <Button variant="gray" type="submit" loading={busy}>Gerar token</Button>
          </form>
        )}
      </More>
    </Section>
  );
}

/* ---------- o que ela fez ---------- */
type Activity = { tool: string; mode: string; writes: boolean; ok: boolean; summary: string; at: number };

/** o que muda alguma coisa: como contar depois de feito e o que ela pediu antes de fazer */
const WRITE_TEXT: Record<string, [string, string]> = {
  conduta_criar_lista: ["Criou uma lista", "criar uma lista"],
  conduta_etiquetar_questoes: ["Etiquetou questões", "etiquetar questões"],
  conduta_salvar_questoes: ["Salvou questões", "salvar questões"],
  conduta_salvar_cronograma: ["Mudou o cronograma", "mudar o cronograma"],
  conduta_atualizar_perfil: ["Atualizou o seu perfil", "atualizar o seu perfil"],
  conduta_criar_flashcards: ["Criou flashcards", "criar flashcards"],
  conduta_configurar_baralho: ["Mudou as opções de um baralho", "mudar as opções de um baralho"],
  conduta_criar_resumo: ["Criou um resumo", "criar um resumo"],
  conduta_criar_pasta: ["Criou uma pasta de resumos", "criar uma pasta de resumos"],
  conduta_enviar_sugestao: ["Mandou uma sugestão para o criador", "mandar uma sugestão para o criador"],
};
const READ_TEXT: Record<string, string> = {
  conduta_inicio: "Olhou como estão os seus estudos", conduta_guia: "Consultou como a plataforma funciona", conduta_estatisticas: "Leu as suas estatísticas",
  conduta_erros: "Leu as questões que você errou", conduta_padroes_de_erro: "Procurou padrões nos seus erros", conduta_ler_questao: "Leu uma questão",
  conduta_transcricao_explicacao: "Leu a explicação do vídeo de uma questão", conduta_buscar_questoes: "Buscou questões", conduta_catalogo: "Viu as provas e os temas disponíveis",
  conduta_sugerir_lista: "Separou questões para sugerir uma lista", conduta_ver_cronograma: "Leu o seu cronograma", conduta_listar_baralhos: "Viu os seus baralhos",
  conduta_ver_flashcards: "Leu os seus flashcards", conduta_estatisticas_flashcards: "Leu as estatísticas dos flashcards", conduta_ver_opcoes_baralho: "Viu as opções de um baralho",
  conduta_listar_resumos: "Viu os seus resumos", conduta_ler_resumo: "Leu um resumo", conduta_entrar: "Entrou com o seu código", conduta_sair: "Encerrou o chat",
};
const GENERIC = new Set(["prévia", "início", "entrou", "encerrou"]);
function activityText(a: Activity) {
  const w = WRITE_TEXT[a.tool];
  if (a.summary === "prévia" && w) return { line: `Pediu a sua confirmação para ${w[1]}`, detail: "" };
  const line = w ? w[0] : READ_TEXT[a.tool] || a.summary.replace(/^./, (c) => c.toUpperCase());
  return { line, detail: (w || READ_TEXT[a.tool]) && !GENERIC.has(a.summary) ? a.summary : "" };
}

export function PluginActivityPage() {
  const [items, setItems] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyWrites, setOnlyWrites] = useState(false);
  usePoll(() => {
    apiGet<{ items: Activity[] }>("/plugin/activity?limit=200").then((r) => { setItems(r.items); setError(null); }).catch((e) => setError(e instanceof ApiError ? e.message : "Não foi possível carregar agora."));
  }, 15000);
  const shown = useMemo(() => (items || []).filter((i) => !onlyWrites || i.writes), [items, onlyWrites]);
  const days = useMemo(() => {
    const m = new Map<string, Activity[]>();
    for (const i of shown) { const k = dayKey(i.at), l = m.get(k) || []; l.push(i); m.set(k, l); }
    return [...m.entries()];
  }, [shown]);
  const writes = (items || []).filter((i) => i.writes).length;
  return (
    <Page title="O que a sua IA fez" crumbs={[{ label: "Sua IA", to: "/plugin" }]} subtitle="Tudo que ela leu e tudo que ela mudou, com a sua confirmação.">
      <label className="plg-switch plg-switch--inline"><span><b>Só o que ela mudou</b>{items ? <span>{plural(writes, "mudança", "mudanças")}</span> : null}</span>
        <Switch checked={onlyWrites} onChange={setOnlyWrites} label="Só o que ela mudou" />
      </label>
      {error && !items ? <div className="empty"><Icon name="alert" size={22} /><p>{error}</p></div> : null}
      {!items && !error ? <div className="plg-loading" aria-busy="true"><span className="cd-spinner" aria-label="Carregando" /></div> : null}
      {items && !shown.length ? (
        <div className="empty"><Icon name="plug" size={22} /><p>{onlyWrites ? "Ela ainda não mudou nada." : "Quando a sua IA usar os seus estudos, aparece aqui."}</p></div>
      ) : null}
      {days.map(([k, list]) => (
        <Section key={k} title={relativeDay(k).replace(/^./, (c) => c.toUpperCase())}>
          <ol className="plg-timeline">
            {list.map((a, i) => {
              const { line, detail } = activityText(a);
              return (
                <li key={i} className={cx(a.writes && "is-write", !a.ok && "is-fail")}>
                  <span className="plg-timeline__icon" aria-hidden><Icon name={!a.ok ? "alert" : a.writes ? "pencil" : "eye"} size={16} /></span>
                  <span className="plg-timeline__text">
                    <span>{line}</span>
                    <small>{detail ? detail + " · " : ""}{new Date(a.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}{!a.ok ? " · não concluiu" : ""}{a.mode === "compartilhado" ? " · conta compartilhada" : ""}</small>
                  </span>
                </li>
              );
            })}
          </ol>
        </Section>
      ))}
    </Page>
  );
}
