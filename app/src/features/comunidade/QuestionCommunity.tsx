/* O que aparece na questão depois de responder (lista com correção na hora, logo abaixo da explicação; simulado, só na
   correção): o aviso de quem marcou algo, as etiquetas da pessoa e os comentários, recolhidos até ela abrir.
   Nada disto é montado antes de a pessoa responder: comentário e contagem dariam a resposta. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/client";
import type { Comment, FlagReason } from "../../api/types";
import { Button, SegmentedControl } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Dialog, useToast } from "../../ds/overlay";
import { num } from "../../lib/format";
import { useCompact } from "../../lib/hooks";
import { haptic, spring } from "../../lib/motion";
import { useStore } from "../../state/store";
import { loadFlags, useFlagState } from "./FlagSheet";
import { useMe } from "./me";
import { Avatar, Loading, Problem, ReportSheet, errText, relTime } from "./parts";
import { cleanTag, tagLabel } from "./tags";

export function QuestionCommunity({ qid }: { qid: string }) {
  // os atalhos da sessão (letras, Enter, setas) não valem quando o foco está aqui dentro
  return (
    <section className="cm" aria-label="Comunidade e etiquetas" onKeyDown={(e) => e.stopPropagation()}>
      <FlagNotice qid={qid} />
      <TagsRow qid={qid} />
      <Comments qid={qid} />
    </section>
  );
}

/* ---------- aviso discreto ---------- */
const NOTICE: Record<FlagReason, (n: number) => string> = {
  desatualizada: (n) => (n === 1 ? "1 pessoa marcou como desatualizada" : `${num(n)} pessoas marcaram como desatualizada`),
  problema: (n) => (n === 1 ? "1 pessoa viu problema no enunciado ou nas alternativas" : `${num(n)} pessoas viram problema no enunciado ou nas alternativas`),
  gabarito: (n) => (n === 1 ? "1 pessoa acha que o gabarito parece errado" : `${num(n)} pessoas acham que o gabarito parece errado`),
  imagem: (n) => (n === 1 ? "1 pessoa marcou imagem faltando ou ruim" : `${num(n)} pessoas marcaram imagem faltando ou ruim`),
  outro: (n) => (n === 1 ? "1 pessoa marcou outro problema" : `${num(n)} pessoas marcaram outro problema`),
};

function FlagNotice({ qid }: { qid: string }) {
  const state = useFlagState(qid);
  useEffect(() => { loadFlags(qid); }, [qid]);
  const rows = (Object.entries(state?.counts || {}) as [FlagReason, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return null;
  return (
    <p className="cm-notice">
      <Icon name="flag" size={15} />
      <span>{rows.map(([k, n]) => NOTICE[k]?.(n)).filter(Boolean).join(" · ")}</span>
    </p>
  );
}

/* ---------- etiquetas ---------- */
const NO_TAGS: string[] = [];

function TagsRow({ qid }: { qid: string }) {
  const tags = useStore((s) => s.qtags[qid]?.tags ?? NO_TAGS);
  const setTags = useStore((s) => s.setTags);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (adding) input.current?.focus(); }, [adding]);
  const known = adding ? [...new Set(Object.values(useStore.getState().qtags).flatMap((x) => x.tags))] : [];
  const typed = cleanTag(text).toLowerCase();
  const suggestions = known.filter((t) => !tags.includes(t) && (!typed || t.toLowerCase().includes(typed) || tagLabel(t).toLowerCase().includes(typed))).slice(0, 6);
  const add = (raw: string) => {
    const t = cleanTag(raw);
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) setTags(qid, [...tags, t]);
    setText("");
    input.current?.focus();
  };
  return (
    <div className="cm-tags" role="group" aria-label="Suas etiquetas nesta questão">
      {tags.map((t) => (
        <span key={t} className="cm-tag">
          <Icon name="tag" size={14} />{tagLabel(t)}
          <button type="button" className="cm-tag__x cd-hoverable" aria-label={`Tirar a etiqueta ${tagLabel(t)}`} onClick={() => setTags(qid, tags.filter((x) => x !== t))}><Icon name="x" size={13} strokeWidth={2.25} /></button>
        </span>
      ))}
      {adding ? (
        <span className="cm-tagadd">
          <input ref={input} className="cm-tagadd__in" value={text} maxLength={40} placeholder="Nova etiqueta" aria-label="Nova etiqueta"
            onChange={(e) => setText(e.target.value)} onBlur={() => { if (!text.trim()) setTimeout(() => setAdding(false), 150); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); add(text); }
              if (e.key === "Escape") { setText(""); setAdding(false); }
              if (e.key === "Backspace" && !text && tags.length) setTags(qid, tags.slice(0, -1));
            }} />
          {suggestions.map((t) => <button key={t} type="button" className="cm-tag cm-tag--sug cd-hoverable" onMouseDown={(e) => e.preventDefault()} onClick={() => add(t)}>{tagLabel(t)}</button>)}
        </span>
      ) : (
        <button type="button" className="cm-tag cm-tag--add cd-hoverable" onClick={() => setAdding(true)}><Icon name="plus" size={14} strokeWidth={2} />Etiqueta</button>
      )}
    </div>
  );
}

/* ---------- comentários ---------- */
function Comments({ qid }: { qid: string }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    apiGet<Record<string, { comments: number; flags: number }>>(`/q/counters?ids=${encodeURIComponent(qid)}`, ac.signal)
      .then((r) => setCount(r[qid]?.comments ?? 0)).catch(() => {});
    return () => ac.abort();
  }, [qid]);
  return (
    <div className="cm-com">
      <button type="button" className="cm-com__toggle cd-hoverable" aria-expanded={open} onClick={(e) => { if (e.detail > 0) e.currentTarget.blur(); setOpen((o) => !o); }}>
        <Icon name="message" size={18} />
        <span className="cm-com__label">Comentários{count != null ? <span className="num cm-com__n"> ({num(count)})</span> : null}</span>
        <Icon name="chevron-down" size={18} className="cm-com__chev" />
      </button>
      {open ? <CommentsBody qid={qid} onDelta={(d) => setCount((n) => (n == null ? n : Math.max(0, n + d)))} /> : null}
    </div>
  );
}

type Sort = "top" | "recent";
/** apagado ou escondido, com respostas: continua na lista como marcador, sem autor */
type C = Comment & { deleted?: boolean };
type PageOf = { comments: C[]; nextCursor: string | null; total: number };

function CommentsBody({ qid, onDelta }: { qid: string; onDelta: (d: number) => void }) {
  const toast = useToast();
  const [sort, setSort] = useState<Sort>("top");
  const [items, setItems] = useState<C[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const url = (cursor?: string | null) => `/q/${encodeURIComponent(qid)}/comments?sort=${sort}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true); setError(null);
    apiGet<PageOf>(url(), ac.signal).then(
      (r) => { setItems(r.comments); setNext(r.nextCursor); setLoading(false); },
      (e) => { if ((e as Error).name !== "AbortError") { setError(e); setLoading(false); } },
    );
    return () => ac.abort();
  }, [qid, sort, tick]); // eslint-disable-line
  const loadMore = async () => {
    if (!next || more) return;
    setMore(true);
    try {
      const r = await apiGet<PageOf>(url(next));
      setItems((xs) => { const seen = new Set(xs.map((x) => x.id)); return [...xs, ...r.comments.filter((x) => !seen.has(x.id))]; });
      setNext(r.nextCursor);
    } catch (e) { toast({ text: errText(e), icon: "alert" }); } finally { setMore(false); }
  };
  const post = async (body: string) => {
    const { comment } = await apiPost<{ comment: C }>(`/q/${encodeURIComponent(qid)}/comments`, { body });
    setItems((xs) => [comment, ...xs]);
    onDelta(1);
    haptic("tick");
  };
  const patch = useCallback((id: string, p: Partial<C>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x))), []);

  return (
    <motion.div className="cm-com__body" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}>
      <Composer placeholder="O que você acha desta questão?" submitLabel="Comentar" onSubmit={post} />
      {items.length > 1 || sort !== "top" ? (
        <div className="cm-com__sort">
          <SegmentedControl<Sort> size="sm" aria-label="Ordenar comentários" value={sort} onChange={setSort} options={[{ value: "top", label: "Mais úteis" }, { value: "recent", label: "Recentes" }]} />
        </div>
      ) : null}
      {loading ? <Loading label="Carregando os comentários" />
        : error ? <Problem error={error} onRetry={() => setTick((t) => t + 1)} offline="Sem conexão. Os comentários voltam quando a internet voltar." />
        : !items.length ? <p className="cm-com__empty">Seja a primeira pessoa a comentar.</p>
        : (
          <ul className="cm-list" aria-label="Comentários">
            {items.map((c) => <Thread key={c.id} c={c} qid={qid} onDelta={onDelta} onPatch={(p) => patch(c.id, p)} onGone={() => setItems((xs) => xs.filter((x) => x.id !== c.id))} />)}
          </ul>
        )}
      {next && !loading && !error ? <div className="cm-more"><Button variant="gray" size="sm" loading={more} onClick={loadMore}>Ver mais comentários</Button></div> : null}
    </motion.div>
  );
}

/** um comentário de primeiro nível com as respostas dele */
function Thread({ c, qid, onPatch, onGone, onDelta }: { c: C; qid: string; onPatch: (p: Partial<C>) => void; onGone: () => void; onDelta: (d: number) => void }) {
  const toast = useToast();
  // responder a uma resposta entra na mesma conversa; o servidor acha o comentário de cima
  const [replying, setReplying] = useState<{ to?: string; id?: string } | null>(null);
  const [replies, setReplies] = useState<C[] | null>(null);
  const [showing, setShowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const showReplies = async () => {
    if (showing) { setShowing(false); return; }
    setShowing(true);
    if (replies) return;
    setBusy(true);
    try { const r = await apiGet<{ comments: C[] }>(`/comments/${c.id}/replies`); setReplies(r.comments); }
    catch (e) { setShowing(false); toast({ text: errText(e), icon: "alert" }); } finally { setBusy(false); }
  };
  const reply = async (body: string) => {
    const { comment } = await apiPost<{ comment: C }>(`/q/${encodeURIComponent(qid)}/comments`, { body, parentId: replying?.id || c.id });
    // respostas ainda não abertas vêm da API quando a pessoa abrir, já com esta
    if (replies) { setReplies([...replies, comment]); setShowing(true); }
    else if (!c.replies) { setReplies([comment]); setShowing(true); }
    else await reopen();
    onPatch({ replies: c.replies + 1 });
    onDelta(1);
    setReplying(null);
    haptic("tick");
  };
  const reopen = async () => {
    const r = await apiGet<{ comments: C[] }>(`/comments/${c.id}/replies`);
    setReplies(r.comments); setShowing(true);
  };
  // apagar o comentário que tem respostas deixa só o marcador; sem respostas ele some
  const removeSelf = () => {
    onDelta(-1);
    if (c.replies > 0) onPatch({ deleted: true, mine: false, body: "(comentário apagado)", likes: 0, liked: false, editedAt: null, author: { handle: "", name: "", avatarUrl: null, faculdade: null } });
    else onGone();
  };
  const removeReply = (id: string) => {
    setReplies((xs) => (xs || []).filter((x) => x.id !== id));
    onDelta(-1);
    const left = Math.max(0, c.replies - 1);
    if (!left && c.deleted) onGone(); else onPatch({ replies: left });
  };
  return (
    <li className="cm-thread">
      <CommentRow c={c} onPatch={onPatch} onRemove={removeSelf} onReply={() => setReplying(replying ? null : {})} />
      <div className="cm-thread__kids">
        {c.replies > 0 ? (
          <button type="button" className="cm-link cd-hoverable" aria-expanded={showing} onClick={showReplies}>
            {busy ? <span className="cd-spinner" aria-hidden /> : <Icon name={showing ? "chevron-up" : "chevron-down"} size={15} />}
            {showing ? "Esconder respostas" : c.replies === 1 ? "Ver 1 resposta" : `Ver ${num(c.replies)} respostas`}
          </button>
        ) : null}
        {showing && replies ? (
          <ul className="cm-list cm-list--replies">
            {replies.map((r) => (
              <li key={r.id}>
                <CommentRow c={r} small onReply={() => setReplying({ to: r.author.handle, id: r.id })}
                  onPatch={(p) => setReplies((xs) => (xs || []).map((x) => (x.id === r.id ? { ...x, ...p } : x)))}
                  onRemove={() => removeReply(r.id)} />
              </li>
            ))}
          </ul>
        ) : null}
        {replying ? (
          <Composer key={replying.to || "raiz"} autoFocus initial={replying.to ? `@${replying.to} ` : ""} placeholder={c.author.name ? `Responder a ${c.author.name}` : "Responder"} submitLabel="Responder" onSubmit={reply} onCancel={() => setReplying(null)} />
        ) : null}
      </div>
    </li>
  );
}

/** o texto do comentário: quebras de linha mantidas e @usuario vira link; nunca HTML */
function Body({ text, from }: { text: string; from: string }) {
  const parts = text.split(/(@[a-z0-9][a-z0-9._]{1,22}[a-z0-9_])/g);
  return (
    <p className="cm-body">
      {parts.map((p, i) => (i % 2 ? <Link key={i} to={"/u/" + p.slice(1)} state={{ back: from }} className="cm-mention">{p}</Link> : p))}
    </p>
  );
}

function CommentRow({ c, small, onPatch, onRemove, onReply }: { c: C; small?: boolean; onPatch: (p: Partial<C>) => void; onRemove: () => void; onReply: () => void }) {
  const toast = useToast();
  const me = useMe();
  const loc = useLocation();
  const from = loc.pathname + loc.search;
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [report, setReport] = useState(false);
  const like = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.detail > 0) e.currentTarget.blur();
    const prev = { liked: c.liked, likes: c.likes };
    onPatch({ liked: !c.liked, likes: c.likes + (c.liked ? -1 : 1) });
    haptic("tick");
    try { onPatch(await apiPost<{ likes: number; liked: boolean }>(`/comments/${c.id}/like`)); }
    catch (err) { onPatch(prev); toast({ text: errText(err), icon: "alert" }); }
  };
  const save = async (body: string) => {
    const { comment } = await apiPatch<{ comment: C }>(`/comments/${c.id}`, { body });
    onPatch(comment);
    setEditing(false);
  };
  const del = async () => {
    try { await apiDelete(`/comments/${c.id}`); onRemove(); toast({ text: "Comentário apagado.", icon: "check", duration: 2400 }); }
    catch (e) { toast({ text: errText(e), icon: "alert" }); }
  };
  const canDelete = c.mine || me?.role === "admin";
  if (c.deleted) return <p className="cm-gone"><Icon name="message" size={15} />Comentário apagado</p>;
  return (
    <article className="cm-c" data-small={small ? "" : undefined}>
      <Link to={"/u/" + c.author.handle} state={{ back: from }} className="cm-c__av" aria-label={`Perfil de ${c.author.name}`} tabIndex={-1}>
        <Avatar name={c.author.name} url={c.author.avatarUrl} size={small ? 28 : 36} />
      </Link>
      <div className="cm-c__main">
        <div className="cm-c__who">
          <Link to={"/u/" + c.author.handle} state={{ back: from }} className="cm-c__id">
            <span className="cm-c__name">{c.author.name}</span>
            {c.author.faculdade ? <span className="cm-c__fac">{c.author.faculdade}</span> : null}
          </Link>
          <span className="cm-c__when" title={new Date(c.createdAt).toLocaleString("pt-BR")}>{relTime(c.createdAt)}{c.editedAt ? " · editado" : ""}</span>
        </div>
        {editing ? (
          <Composer autoFocus initial={c.body} placeholder="Editar comentário" submitLabel="Salvar" onSubmit={save} onCancel={() => setEditing(false)} />
        ) : <Body text={c.body} from={from} />}
        {!editing ? (
          <div className="cm-c__acts">
            <button type="button" className="cm-like cd-hoverable" aria-pressed={c.liked} aria-label={`Útil, ${num(c.likes)} ${c.likes === 1 ? "pessoa" : "pessoas"}`} onClick={like}>
              <motion.span key={String(c.liked)} className="cm-like__icon" initial={c.liked ? { scale: 0.7 } : false} animate={{ scale: 1 }} transition={spring.bouncy}><Icon name="heart" size={16} /></motion.span>
              Útil{c.likes ? <span className="num">{num(c.likes)}</span> : null}
            </button>
            <button type="button" className="cm-act cd-hoverable" onClick={onReply}>Responder</button>
            {c.mine ? <button type="button" className="cm-act cd-hoverable" onClick={() => setEditing(true)}>Editar</button> : null}
            {canDelete ? <button type="button" className="cm-act cd-hoverable" onClick={() => setConfirm(true)}>Apagar</button> : null}
            {!c.mine ? <button type="button" className="cm-act cd-hoverable" onClick={() => setReport(true)}>Denunciar</button> : null}
          </div>
        ) : null}
      </div>
      <Dialog open={confirm} onClose={() => setConfirm(false)} onConfirm={del} title="Apagar este comentário?" confirmLabel="Apagar" destructive>
        {c.replies > 0 ? "Isso não volta. As respostas de outras pessoas continuam na conversa." : "Isso não volta."}
      </Dialog>
      <ReportSheet open={report} onClose={() => setReport(false)} targetKind="comment" targetId={c.id} title="Denunciar comentário" />
    </article>
  );
}

/** campo de escrever: texto puro; Ctrl ou Cmd + Enter envia */
function Composer({ placeholder, submitLabel, onSubmit, onCancel, initial = "", autoFocus }: {
  placeholder: string; submitLabel: string; onSubmit: (body: string) => Promise<void>; onCancel?: () => void; initial?: string; autoFocus?: boolean;
}) {
  const toast = useToast();
  const compact = useCompact();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const fit = () => { const t = box.current; if (!t) return; t.style.height = "auto"; t.style.height = Math.min(320, t.scrollHeight) + "px"; };
  useEffect(() => {
    fit();
    if (autoFocus && box.current) { box.current.focus(); const n = box.current.value.length; box.current.setSelectionRange(n, n); }
  }, [autoFocus]);
  useEffect(fit, [text]);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try { await onSubmit(body); setText(""); }
    catch (e) { toast({ text: errText(e), icon: "alert" }); }
    finally { setBusy(false); }
  };
  return (
    <div className="cm-compose">
      <textarea ref={box} className="cm-compose__in" rows={2} maxLength={4000} value={text} placeholder={placeholder} aria-label={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
          if (e.key === "Escape" && onCancel) { e.preventDefault(); onCancel(); }
        }} />
      {text.trim() || onCancel ? (
        <div className="cm-compose__foot">
          {!compact ? <span className="cm-compose__hint">{mac ? "⌘" : "Ctrl"} + Enter envia</span> : <span />}
          <div className="cd-row cm-compose__btns">
            {onCancel ? <Button variant="plain" size="sm" onClick={onCancel}>Cancelar</Button> : null}
            <Button variant="filled" size="sm" loading={busy} disabled={!text.trim()} onClick={send}>{submitLabel}</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
