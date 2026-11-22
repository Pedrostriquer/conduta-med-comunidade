/* Chat de IA: a pessoa pergunta sobre o banco de questões e o próprio estudo, e a resposta sai aos poucos.
   A IA usa as mesmas consultas do plugin (buscar e ler questões, assuntos, vídeo, erros) e pede confirmação antes de criar algo.
   Quanto pode usar aparece em porcentagem e em mensagens do dia; valores em dinheiro ficam só no painel do admin. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, MouseEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, apiDelete, apiGet } from "../../api/client";
import { Page } from "../../app/Page";
import { Button } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { useToast } from "../../ds/overlay";
import { Meter } from "../../ds/progress";
import { cx } from "../../lib/cx";
import { Md } from "../../lib/md";
import { EmptyState, Loading, Problem, errText, relTime, useApi } from "../comunidade/parts";
import { invalidateChatStatus } from "./status";

type Status = { available: boolean; reason: string | null; message: string | null; model: string; percentLeft: number; dailyLeft: number; daily: number; chats: { id: string; title: string; updatedAt: number }[] };
type Shown = { id: number | string; role: "user" | "assistant"; text: string; tools: string[]; pending?: string | null; failed?: boolean };
type Ev =
  | { type: "inicio"; chatId: string; title: string }
  | { type: "texto"; delta: string }
  | { type: "ferramenta"; name: string; title: string; status: "chamando" | "feito" | "erro" }
  | { type: "fim"; percentLeft: number; dailyLeft: number }
  | { type: "erro"; message: string };

const IDEAS = ["Como o ENARE costuma cobrar sepse?", "Onde eu mais erro e o que estudar primeiro?", "Monte uma lista de 10 questões de pré-eclâmpsia."];

/** manda a pergunta e entrega cada evento da resposta conforme chega */
async function send(body: { chatId?: string; text: string }, onEvent: (e: Ev) => void, signal: AbortSignal) {
  let res: Response;
  try { res = await fetch("/api/chat/mensagens", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }); }
  catch (e) { if ((e as Error).name === "AbortError") throw e; throw new ApiError(0, "sem_rede", "Sem conexão com o servidor. Confira a internet e tente de novo."); }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error?.code || "erro", data?.error?.message || "Algo deu errado. Tente de novo.", data || undefined);
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    buf += dec.decode(value ?? new Uint8Array(), { stream: !done });
    let cut: number;
    while ((cut = buf.search(/\r?\n\r?\n/)) >= 0) {
      const chunk = buf.slice(0, cut);
      buf = buf.slice(cut).replace(/^\r?\n\r?\n/, "");
      const data = chunk.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
      if (data) { try { onEvent(JSON.parse(data)); } catch { /* linha que não é evento */ } }
    }
    if (done) return;
  }
}

export function ChatPage() {
  const { id } = useParams();
  const nav = useNavigate(), toast = useToast();
  const status = useApi<Status>("/chat");
  const [msgs, setMsgs] = useState<Shown[]>([]);
  const [loading, setLoading] = useState(false), [loadError, setLoadError] = useState<unknown>(null);
  const [text, setText] = useState(""), [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null), bottom = useRef<HTMLDivElement>(null), box = useRef<HTMLTextAreaElement>(null);
  /** a conversa que a tela está mostrando: evita recarregar por cima da resposta que acabou de sair */
  const shownChat = useRef<string | null>(null);

  useEffect(() => {
    if (!id) { shownChat.current = null; setMsgs([]); setLoadError(null); return; }
    if (shownChat.current === id) return;
    const ac = new AbortController();
    setLoading(true); setLoadError(null);
    apiGet<{ messages: Shown[] }>("/chat/" + id, ac.signal).then(
      (d) => { shownChat.current = id; setMsgs(d.messages); setLoading(false); },
      (e) => { if ((e as Error).name !== "AbortError") { setLoadError(e); setLoading(false); } },
    );
    return () => ac.abort();
  }, [id]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end", behavior: busy ? "auto" : "smooth" }); }, [msgs, busy]);

  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setText(""); setBusy(true);
    const draft = "r" + Date.now();
    setMsgs((m) => [...m, { id: "u" + Date.now(), role: "user", text: q, tools: [] }, { id: draft, role: "assistant", text: "", tools: [], pending: "Pensando" }]);
    const patch = (f: (m: Shown) => Shown) => setMsgs((all) => all.map((m) => (m.id === draft ? f(m) : m)));
    const ac = new AbortController();
    abort.current = ac;
    try {
      await send({ chatId: id, text: q }, (e) => {
        if (e.type === "inicio") { if (e.chatId !== id) { shownChat.current = e.chatId; nav("/chat/" + e.chatId, { replace: true }); } }
        else if (e.type === "texto") patch((m) => ({ ...m, text: m.text + e.delta, pending: null }));
        else if (e.type === "ferramenta") patch((m) => (e.status === "chamando" ? { ...m, pending: e.title } : { ...m, pending: "Pensando", tools: m.tools.includes(e.title) ? m.tools : [...m.tools, e.title] }));
        else if (e.type === "fim") { patch((m) => ({ ...m, pending: null })); status.setData((s) => (s ? { ...s, percentLeft: e.percentLeft, dailyLeft: e.dailyLeft } : s)); }
        else if (e.type === "erro") patch((m) => ({ ...m, pending: null, failed: true, text: m.text.trim() ? m.text : e.message }));
      }, ac.signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") patch((m) => ({ ...m, pending: null, failed: true, text: errText(e) }));
    } finally {
      patch((m) => ({ ...m, pending: null, text: m.text.trim() }));
      setBusy(false); abort.current = null;
      status.reload(); invalidateChatStatus();
      box.current?.focus();
    }
  }, [busy, id, nav, status]);

  const submit = (e: FormEvent) => { e.preventDefault(); void ask(text); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(text); } };
  // link para dentro do próprio app abre aqui mesmo, sem nova aba
  const onLink = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const url = new URL(a.href, location.href);
    if (url.origin === location.origin) { e.preventDefault(); nav(url.pathname + url.search + url.hash); }
  };
  const remove = async (chatId: string) => {
    try { await apiDelete("/chat/" + chatId); status.setData((s) => (s ? { ...s, chats: s.chats.filter((c) => c.id !== chatId) } : s)); if (chatId === id) nav("/chat", { replace: true }); }
    catch (e) { toast({ text: errText(e), icon: "alert" }); }
  };

  const s = status.data;
  const blocked = s && !s.available;
  return (
    <Page title="Chat de IA" subtitle="Pergunte sobre o banco de questões e sobre o seu estudo." crumbs={[]}>
      {status.error ? <Problem error={status.error} onRetry={status.reload} /> : !s ? <Loading /> : (
        <div className="cols">
          <div className="cols__main">
            <section className="panel chat" aria-label="Conversa">
              <div className="chat__msgs" onClick={onLink} aria-live="polite">
                {loadError ? <Problem error={loadError as ApiError} onRetry={() => nav(0)} /> : loading ? <Loading /> : !msgs.length ? (
                  blocked && s.reason !== "limite_dia" && s.reason !== "sem_credito" ? (
                    <EmptyState icon="sparkle" title="O chat ainda não está disponível">{s.message}</EmptyState>
                  ) : (
                    <div className="chat__start">
                      <Icon name="sparkle" size={28} />
                      <b>O que você quer saber?</b>
                      <p>A IA consulta as questões, as resoluções, os resumos dos assuntos e os vídeos de correção do Conduta Med, e também o seu histórico.</p>
                      <div className="chat__ideas">
                        {IDEAS.map((x) => <button key={x} type="button" className="chat__idea cd-hoverable" disabled={!!blocked || busy} onClick={() => void ask(x)}>{x}</button>)}
                      </div>
                    </div>
                  )
                ) : msgs.map((m) => (
                  <div key={m.id} className={cx("chat__msg", "chat__msg--" + m.role, m.failed && "chat__msg--failed")}>
                    {m.role === "user" ? <p>{m.text}</p> : <>
                      {m.tools.length ? <div className="chat__tools"><Icon name="search" size={14} />Consultou: {m.tools.join(", ")}</div> : null}
                      {m.text ? <Md text={m.text} /> : null}
                      {m.pending ? <div className="chat__pending"><span className="cd-spinner" aria-hidden />{m.pending}</div> : null}
                    </>}
                  </div>
                ))}
                <div ref={bottom} />
              </div>
              {blocked && (s.reason === "limite_dia" || s.reason === "sem_credito") ? <p className="chat__notice" role="status"><Icon name="info" size={16} />{s.message}</p> : null}
              <form className="chat__form" onSubmit={submit}>
                <textarea ref={box} rows={1} value={text} maxLength={4000} placeholder={blocked ? "O chat não está disponível agora" : "Escreva a sua pergunta"} aria-label="Sua pergunta" disabled={!!blocked}
                  onChange={(e) => { setText(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 180) + "px"; }} onKeyDown={onKey} />
                {busy
                  ? <Button variant="gray" icon="x" label="Parar a resposta" onClick={() => abort.current?.abort()} />
                  : <Button variant="filled" type="submit" icon="arrow-right" label="Enviar" disabled={!!blocked || !text.trim()} />}
              </form>
              <p className="chat__foot">A IA pode errar. Confira na resolução da questão e no resumo do assunto. É estudo para a prova, não orientação para atender paciente.</p>
            </section>
          </div>
          <aside className="cols__aside">
            <section className="panel an-block" aria-label="Quanto você ainda pode usar">
              <h2 className="sec__title">Seu uso</h2>
              <Meter label="Crédito de IA do mês" value={Math.round((100 - s.percentLeft) * 10) / 10} max={100} valueLabel={`${Math.round(100 - s.percentLeft)}% usado`} tone={s.percentLeft < 10 ? "warning" : undefined} />
              <Meter label="Mensagens de hoje" value={s.daily - s.dailyLeft} max={s.daily} tone={s.dailyLeft === 0 ? "warning" : undefined} />
              <p className="chat__model">Modelo: {s.model}</p>
            </section>
            <section className="panel an-block" aria-label="Suas conversas">
              <div className="chat__head"><h2 className="sec__title">Conversas</h2><Button variant="tinted" size="sm" icon="plus" disabled={!id && !msgs.length} onClick={() => { abort.current?.abort(); nav("/chat"); }}>Nova</Button></div>
              {!s.chats.length ? <p className="chat__none">Nenhuma conversa ainda.</p> : (
                <ul className="chat__list">
                  {s.chats.map((c) => (
                    <li key={c.id} className={cx("chat__item", c.id === id && "chat__item--on")}>
                      <button type="button" className="chat__open cd-hoverable" aria-current={c.id === id ? "page" : undefined} onClick={() => nav("/chat/" + c.id)}>
                        <span>{c.title || "Conversa"}</span><small>{relTime(c.updatedAt)}</small>
                      </button>
                      <button type="button" className="chat__del cd-hoverable" aria-label={`Apagar a conversa ${c.title}`} onClick={() => void remove(c.id)}><Icon name="trash" size={16} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}
    </Page>
  );
}
