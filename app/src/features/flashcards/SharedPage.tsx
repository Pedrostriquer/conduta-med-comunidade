/* Compartilhados: explorar o que outras pessoas publicaram, os baralhos que você assina (a versão nova chega sem apagar o
   seu progresso) e os que você publicou. Publicar nunca é automático: a pessoa vê o que vai ficar público e confirma.
   Um baralho abre por link em /flashcards/compartilhados?baralho=<slug>. */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import type { ApiError } from "../../api/client";
import type { SharedCard, SharedDeckCard } from "../../api/types";
import { Page, Section } from "../../app/Page";
import { Badge, Button, SegmentedControl } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Dialog, Sheet, useToast } from "../../ds/overlay";
import { num, plural } from "../../lib/format";
import { spring } from "../../lib/motion";
import { Avatar, EmptyState, Loading, Problem, ReportSheet, errText, relTime, useApi } from "../comunidade/parts";
import { allDecks } from "./db";
import type { DeckRec } from "./db";
import { useDecks } from "./decks";
import { VIS, buildPublication, deckLink, deckPath, editPublished, isSubscribedDeck, mergeText, previewOf, publishDeck, publishedSlug, subscribeDeck, unpublish, unsubscribeDeck, updateSubscription } from "./share";
import type { DeckDraft, DeckVisibility, Publication, SubDeck } from "./share";

type Tab = "explorar" | "assinados" | "publicados";

async function copy(toast: ReturnType<typeof useToast>, text: string, ok: string) {
  try { await navigator.clipboard.writeText(text); toast({ text: ok, icon: "link", duration: 2400 }); }
  catch { toast({ text, icon: "link" }); }
}

/* ---------- cartão de baralho (também no perfil das pessoas) ---------- */
export function DeckTile({ d, onSubscribed }: { d: SharedDeckCard; onSubscribed?: (on: boolean) => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  const subscribed = d.subscribed || !!local;
  const go = async () => {
    setBusy(true);
    try {
      const r = await subscribeDeck(d);
      setLocal(r.local); onSubscribed?.(true);
      toast({ text: `Você assinou “${d.name}”.`, icon: "check", action: "Abrir", onAction: () => nav("/flashcards/baralho/" + encodeURIComponent(r.local)) });
    } catch (e) { toast({ text: errText(e), icon: "alert" }); } finally { setBusy(false); }
  };
  return (
    <article className="panel cm-deck">
      <button type="button" className="cm-deck__open cd-hoverable" onClick={() => nav(deckPath(d.slug))}>
        <b className="cm-deck__name">{d.name}</b>
        {d.description ? <span className="cm-deck__desc">{d.description}</span> : null}
      </button>
      <Link className="cm-deck__by" to={"/u/" + d.owner.handle}><Avatar name={d.owner.name} url={d.owner.avatarUrl} size={22} />@{d.owner.handle}</Link>
      {d.tags.length ? <div className="cm-tags">{d.tags.slice(0, 5).map((t) => <span key={t} className="cm-tag cm-tag--plain">{t}</span>)}</div> : null}
      <div className="cm-deck__foot">
        <span className="cm-deck__meta num">{plural(d.cardsCount, "card", "cards")} · {plural(d.subscribers, "assinante", "assinantes")}</span>
        {d.mine ? <Badge>Seu</Badge> : subscribed ? <Badge tone="success" icon="check">Assinado</Badge> : <Button variant="tinted" size="sm" loading={busy} onClick={go}>Assinar</Button>}
      </div>
    </article>
  );
}

function DeckGrid({ decks, onSubscribed }: { decks: SharedDeckCard[]; onSubscribed?: (slug: string) => void }) {
  return (
    <div className="grid-auto" style={{ "--min": "270px" } as React.CSSProperties}>
      {decks.map((d, i) => (
        <motion.div key={d.id} style={{ display: "grid" }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { ...spring.smooth, delay: Math.min(i, 10) * 0.02 } }}>
          <DeckTile d={d} onSubscribed={() => onSubscribed?.(d.slug)} />
        </motion.div>
      ))}
    </div>
  );
}

/* ---------- entrada ---------- */
export function SharedPage() {
  const [sp] = useSearchParams();
  const slug = sp.get("baralho");
  return slug ? <DeckView key={slug} slug={slug} /> : <SharedHome />;
}

function SharedHome() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("aba") as Tab) || "explorar";
  const setTab = (t: Tab) => setSp(t === "explorar" ? {} : { aba: t }, { replace: true });
  const subs = useApi<{ decks: SubDeck[] }>("/decks/subscribed");
  const mine = useApi<{ decks: SharedDeckCard[] }>("/decks/mine");
  const updates = (subs.data?.decks || []).filter((d) => d.version > d.seenVersion).length;
  return (
    <Page title="Compartilhados" subtitle="Assine os baralhos de outras pessoas e publique os seus. A versão nova chega sem apagar o seu progresso." crumbs={[{ label: "Flashcards", to: "/flashcards" }]}>
      <div className="fc-sharetabs">
        <SegmentedControl<Tab> size="sm" aria-label="Compartilhados" value={tab} onChange={setTab} options={[
          { value: "explorar", label: "Explorar" },
          { value: "assinados", label: <>Assinados{updates ? <span className="cm-count num" aria-label={plural(updates, "versão nova", "versões novas")}>{updates}</span> : null}</> },
          { value: "publicados", label: "Publicados" },
        ]} />
      </div>
      {tab === "explorar" ? <Explore onSubscribed={subs.reload} />
        : tab === "assinados" ? <Subscribed api={subs} onExplore={() => setTab("explorar")} />
        : <Published api={mine} />}
    </Page>
  );
}

/* ---------- explorar ---------- */
function Explore({ onSubscribed }: { onSubscribed: () => void }) {
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"populares" | "recentes">("populares");
  useEffect(() => { const t = setTimeout(() => setQ(query.trim()), 260); return () => clearTimeout(t); }, [query]);
  const { data, error, loading, reload, setData } = useApi<{ decks: SharedDeckCard[] }>(`/decks?sort=${sort}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  const decks = data?.decks;
  return (
    <>
      <div className="cm-explore">
        <label className="search cm-explore__search">
          <Icon name="search" size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar baralhos" aria-label="Buscar baralhos" />
        </label>
        <SegmentedControl size="sm" aria-label="Ordem" value={sort} onChange={setSort} options={[{ value: "populares", label: "Populares" }, { value: "recentes", label: "Recentes" }]} />
      </div>
      {error ? <Problem error={error} onRetry={reload} />
        : !decks ? (loading ? <Loading label="Carregando os baralhos" /> : null)
        : !decks.length ? (q ? <EmptyState icon="search">Nenhum baralho com “{q}”.</EmptyState> : <EmptyState icon="cards" title="Ninguém publicou ainda">Quando alguém publicar um baralho, ele aparece aqui. Pode ser o seu: veja a aba Publicados.</EmptyState>)
        : <DeckGrid decks={decks} onSubscribed={(slug) => { setData((d) => (d ? { decks: d.decks.map((x) => (x.slug === slug ? { ...x, subscribed: true, subscribers: x.subscribers + 1 } : x)) } : d)); onSubscribed(); }} />}
    </>
  );
}

/* ---------- assinados ---------- */
function Subscribed({ api, onExplore }: { api: ReturnType<typeof useApi<{ decks: SubDeck[] }>>; onExplore: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const { decks: localDecks } = useDecks();
  const [working, setWorking] = useState<string | null>(null);
  const [stop, setStop] = useState<SubDeck | null>(null);
  const list = api.data?.decks;
  const has = (id: string) => localDecks.some((d) => d.id === id);
  const update = async (d: SubDeck) => {
    setWorking(d.slug);
    try {
      const r = await updateSubscription(d);
      api.setData((x) => (x ? { decks: x.decks.map((y) => (y.slug === d.slug ? { ...y, seenVersion: r.version } : y)) } : x));
      toast({ text: r.result ? `Versão ${r.version}: ${mergeText(r.result)}` : "Já está na versão mais nova.", icon: "sync", duration: 6000 });
      if (r.note) toast({ text: `Nota da versão: ${r.note}`, icon: "note", duration: 8000 });
    } catch (e) { toast({ text: errText(e), icon: "alert" }); } finally { setWorking(null); }
  };
  const download = async (d: SubDeck) => {
    setWorking(d.slug);
    try {
      await subscribeDeck(d);
      api.reload();
      toast({ text: `“${d.name}” está nos seus baralhos.`, icon: "check" });
    } catch (e) { toast({ text: errText(e), icon: "alert" }); } finally { setWorking(null); }
  };
  const cancel = async (d: SubDeck) => {
    try {
      await unsubscribeDeck(d.slug);
      api.setData((x) => (x ? { decks: x.decks.filter((y) => y.slug !== d.slug) } : x));
      toast({ text: "Assinatura cancelada. O baralho continua com você, sem versões novas.", icon: "check" });
    } catch (e) { toast({ text: errText(e), icon: "alert" }); }
  };
  if (api.error) return <Problem error={api.error} onRetry={api.reload} />;
  if (!list) return <Loading />;
  if (!list.length) return <EmptyState icon="cards" title="Você ainda não assina nenhum baralho" action={<Button variant="tinted" onClick={onExplore}>Explorar baralhos</Button>}>Assinando, o baralho entra nos seus baralhos e as versões novas chegam sem apagar o seu progresso.</EmptyState>;
  return (
    <ul className="fc-shared">
      {list.map((d, i) => {
        const fresh = d.version > d.seenVersion, local = has(d.localDeck);
        return (
          <motion.li key={d.id} className="panel fc-shared__item" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { ...spring.smooth, delay: Math.min(i, 10) * 0.03 } }}>
            <button type="button" className="fc-shared__main" onClick={() => nav(deckPath(d.slug))}>
              <span className="deck__glyph" aria-hidden><Icon name="cards" size={20} /></span>
              <span className="fc-shared__text"><b>{d.name}</b><small className="num">@{d.owner.handle} · {plural(d.cardsCount, "card", "cards")} · versão {d.seenVersion || d.version}</small></span>
            </button>
            <div className="fc-shared__end">
              {!local ? <Button variant="filled" size="sm" icon="sync" loading={working === d.slug} onClick={() => download(d)}>Baixar</Button>
                : fresh ? <><Badge tone="accent" icon="sync">Versão {d.version}</Badge><Button variant="filled" size="sm" loading={working === d.slug} onClick={() => update(d)}>Atualizar</Button></>
                : <><Badge tone="success" icon="check">Em dia</Badge><Button variant="gray" size="sm" onClick={() => nav("/flashcards/baralho/" + encodeURIComponent(d.localDeck))}>Abrir</Button></>}
              <Button variant="plain" size="sm" icon="x" label={`Cancelar assinatura de ${d.name}`} onClick={() => setStop(d)} />
            </div>
          </motion.li>
        );
      })}
      <Dialog open={!!stop} onClose={() => setStop(null)} onConfirm={() => { if (stop) cancel(stop); }} title="Cancelar a assinatura?" confirmLabel="Cancelar assinatura" cancelLabel="Voltar" destructive>
        O baralho continua nos seus baralhos, com o seu progresso, mas deixa de receber as versões novas.
      </Dialog>
    </ul>
  );
}

/* ---------- publicados ---------- */
function Published({ api }: { api: ReturnType<typeof useApi<{ decks: SharedDeckCard[] }>> }) {
  const nav = useNavigate();
  const toast = useToast();
  const [publishing, setPublishing] = useState<{ existing?: SharedDeckCard } | null>(null);
  const [editing, setEditing] = useState<SharedDeckCard | null>(null);
  const [removing, setRemoving] = useState<SharedDeckCard | null>(null);
  const list = api.data?.decks;
  const remove = async (d: SharedDeckCard) => {
    try {
      await unpublish(d.slug);
      api.setData((x) => (x ? { decks: x.decks.filter((y) => y.slug !== d.slug) } : x));
      toast({ text: "Baralho despublicado. O link parou de funcionar.", icon: "check" });
    } catch (e) { toast({ text: errText(e), icon: "alert" }); }
  };
  const replace = (d: SharedDeckCard) => api.setData((x) => {
    if (!x) return x;
    return { decks: x.decks.some((y) => y.slug === d.slug) ? x.decks.map((y) => (y.slug === d.slug ? d : y)) : [d, ...x.decks] };
  });
  return (
    <>
      <div className="fc-sharebar">
        <span className="fc-help">{list?.length ? plural(list.length, "baralho publicado", "baralhos publicados") : "Nada publicado ainda."}</span>
        <Button variant="filled" size="sm" icon="share" onClick={() => setPublishing({})}>Publicar um baralho</Button>
      </div>
      {api.error ? <Problem error={api.error} onRetry={api.reload} />
        : !list ? <Loading />
        : !list.length ? <EmptyState icon="share">Publique um baralho seu para a turma assinar. Cada versão nova chega para todo mundo sem apagar o progresso de ninguém.</EmptyState>
        : (
          <ul className="fc-shared">
            {list.map((d) => (
              <li key={d.id} className="panel fc-shared__item">
                <button type="button" className="fc-shared__main" onClick={() => nav(deckPath(d.slug))}>
                  <span className="deck__glyph" aria-hidden><Icon name={VIS[d.visibility].icon} size={20} /></span>
                  <span className="fc-shared__text"><b>{d.name}</b><small className="num">{VIS[d.visibility].label} · versão {d.version} · {plural(d.cardsCount, "card", "cards")} · {plural(d.subscribers, "assinante", "assinantes")} · atualizado {relTime(d.updatedAt)}</small></span>
                </button>
                <div className="fc-shared__end">
                  <Button variant="gray" size="sm" icon="link" label={`Copiar o link de ${d.name}`} onClick={() => copy(toast, deckLink(d.slug), "Link copiado.")} />
                  <Button variant="gray" size="sm" icon="pencil" label={`Editar ${d.name}`} onClick={() => setEditing(d)} />
                  <Button variant="tinted" size="sm" icon="upload" onClick={() => setPublishing({ existing: d })}>Enviar versão nova</Button>
                  <Button variant="plain" size="sm" icon="x" label={`Despublicar ${d.name}`} onClick={() => setRemoving(d)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      <PublishSheet open={!!publishing} existing={publishing?.existing} published={list || []} onClose={() => setPublishing(null)} onDone={replace} />
      <EditSheet d={editing} onClose={() => setEditing(null)} onDone={replace} />
      <Dialog open={!!removing} onClose={() => setRemoving(null)} onConfirm={() => { if (removing) remove(removing); }} title="Despublicar este baralho?" confirmLabel="Despublicar" destructive>
        O link para de funcionar e o baralho some do seu perfil. Quem já assinou fica com a última versão.
      </Dialog>
    </>
  );
}

const splitTags = (s: string) => [...new Set(s.split(/[,;]/).map((t) => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 30);

function DraftFields({ draft, set, tags, setTags }: { draft: DeckDraft; set: (p: Partial<DeckDraft>) => void; tags: string; setTags: (s: string) => void }) {
  return (
    <>
      <label className="fc-field"><span className="fc-field__label">Nome</span>
        <input className="fc-input" value={draft.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} /></label>
      <label className="fc-field"><span className="fc-field__label">Descrição <small>opcional</small></span>
        <textarea className="fc-input fc-input--area" rows={3} maxLength={2000} value={draft.description} placeholder="Para quem é, de onde vieram os cards, o que cobre" onChange={(e) => set({ description: e.target.value })} /></label>
      <label className="fc-field"><span className="fc-field__label">Etiquetas <small>opcional, separadas por vírgula</small></span>
        <input className="fc-input" value={tags} placeholder="pediatria, ENARE" onChange={(e) => setTags(e.target.value)} /></label>
      <div className="fc-field"><span className="fc-field__label">Quem pode ver</span>
        <ul className="fc-radio" role="radiogroup" aria-label="Quem pode ver">
          {(Object.keys(VIS) as DeckVisibility[]).map((v) => (
            <li key={v}><button type="button" role="radio" aria-checked={draft.visibility === v} className="fc-radio__opt cd-hoverable" onClick={() => set({ visibility: v })}>
              <i className="fc-radio__dot" aria-hidden /><span><b><Icon name={VIS[v].icon} size={15} /> {VIS[v].label}</b><small>{VIS[v].hint}</small></span>
            </button></li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** publicar ou enviar versão nova: primeiro o formulário, depois a conferência do que fica público */
function PublishSheet({ open, existing, published, onClose, onDone }: { open: boolean; existing?: SharedDeckCard; published: SharedDeckCard[]; onClose: () => void; onDone: (d: SharedDeckCard) => void }) {
  const toast = useToast();
  const [decks, setDecks] = useState<DeckRec[]>([]);
  const [deckId, setDeckId] = useState("");
  const [draft, setDraft] = useState<DeckDraft>({ name: "", description: "", tags: [], visibility: "publico" });
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [pub, setPub] = useState<Publication | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const slugs = useMemo(() => new Set(published.map((d) => d.slug)), [published]);
  useEffect(() => {
    if (!open) return;
    setPub(null); setError(null); setBusy(false); setProgress(null); setNote("");
    allDecks().then((all) => {
      const own = all.filter((d) => !isSubscribedDeck(d.id));
      // versão nova: o baralho que tem este endereço, ou o de mesmo nome se ele veio de antes de existir o endereço
      const target = existing ? own.find((d) => publishedSlug(d) === existing.slug) || own.find((d) => d.name === existing.name) : undefined;
      const free = existing ? own : own.filter((d) => !publishedSlug(d) || !slugs.has(publishedSlug(d)!));
      setDecks(free);
      const first = target || free[0];
      setDeckId(first?.id || "");
      setDraft(existing ? { name: existing.name, description: existing.description, tags: existing.tags, visibility: existing.visibility } : { name: first?.name || "", description: "", tags: [], visibility: "publico" });
      setTags(existing ? existing.tags.join(", ") : "");
    }, setError);
  }, [open]); // eslint-disable-line
  const deck = decks.find((d) => d.id === deckId);
  const toReview = async () => {
    if (!deck) return;
    setBusy(true); setError(null);
    try { setPub(await buildPublication(deck)); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const confirm = async () => {
    if (!pub) return;
    setBusy(true); setError(null);
    try {
      const d = await publishDeck(pub, { ...draft, name: draft.name.trim(), description: draft.description.trim(), tags: splitTags(tags) }, note, (a, b) => setProgress([a, b]));
      onDone(d);
      onClose();
      toast({ text: existing ? `Versão ${d.version} enviada. Quem assina recebe quando abrir Compartilhados.` : "Baralho publicado.", icon: "check", action: "Copiar link", duration: 6000, onAction: () => copy(toast, deckLink(d.slug), "Link copiado.") });
    } catch (e) { setError(e); } finally { setBusy(false); setProgress(null); }
  };
  const title = existing ? `Versão nova de “${existing.name}”` : "Publicar um baralho";
  const footer = pub
    ? <><Button variant="gray" disabled={busy} onClick={() => setPub(null)}>Voltar</Button><Button variant="filled" icon="share" loading={busy} onClick={confirm}>{existing ? `Enviar versão ${existing.version + 1}` : "Publicar"}</Button></>
    : <><Button variant="gray" onClick={onClose}>Cancelar</Button><Button variant="filled" iconEnd="chevron-right" disabled={!deck || !draft.name.trim()} loading={busy} onClick={toReview}>Conferir o que fica público</Button></>;
  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={pub ? "Confira antes de confirmar." : "Quem assinar recebe as versões novas sem perder o próprio progresso."} width={600} footer={footer}>
      {pub ? (
        <div className="fc-form">
          <div className="cm-review">
            <div><span>Nome</span><b>{draft.name.trim()}</b></div>
            {draft.description.trim() ? <div><span>Descrição</span><b>{draft.description.trim()}</b></div> : null}
            {splitTags(tags).length ? <div><span>Etiquetas</span><b>{splitTags(tags).join(", ")}</b></div> : null}
            <div><span>Quem pode ver</span><b>{VIS[draft.visibility].label}</b></div>
            <div><span>O que vai junto</span><b>{plural(pub.cards.length, "card", "cards")} com o texto completo{pub.files.size ? ` e ${plural(pub.files.size, "imagem", "imagens")}` : ""}, e o seu nome e @</b></div>
            <div><span>O que não vai</span><b>Seu progresso, suas revisões, bandeiras e estatísticas</b></div>
          </div>
          {existing ? (
            <label className="fc-field"><span className="fc-field__label">Nota da versão <small>opcional</small></span>
              <textarea className="fc-input fc-input--area" rows={2} maxLength={1000} value={note} placeholder="O que mudou nesta versão" onChange={(e) => setNote(e.target.value)} /></label>
          ) : null}
          <span className="fc-field__label">Os primeiros cards, como os outros vão ver</span>
          <CardSamples cards={pub.cards.slice(0, 3)} />
          {progress ? <p className="fc-help" role="status">Enviando as imagens: {num(progress[0])} de {num(progress[1])}.</p> : null}
          {error ? <Problem error={error} /> : null}
        </div>
      ) : (
        <div className="fc-form">
          {decks.length ? (
            <label className="fc-field"><span className="fc-field__label">Baralho</span>
              <select className="fc-input" value={deckId} disabled={!!existing && decks.some((d) => publishedSlug(d) === existing.slug)} onChange={(e) => { setDeckId(e.target.value); if (!existing) setDraft((x) => ({ ...x, name: decks.find((d) => d.id === e.target.value)?.name || x.name })); }}>
                {decks.map((x) => <option key={x.id} value={x.id}>{x.name} · {num(x.cards)} cards</option>)}
              </select>
              {existing && !decks.some((d) => publishedSlug(d) === existing.slug) ? <small className="fc-help">Confira se é o baralho certo: outro baralho vira uma publicação separada.</small> : null}
            </label>
          ) : <p className="fc-help">Você não tem baralho próprio para publicar. Importe um .apkg ou crie cards primeiro. Baralhos que você assina não podem ser publicados de novo.</p>}
          {decks.length ? <DraftFields draft={draft} set={(p) => setDraft((x) => ({ ...x, ...p }))} tags={tags} setTags={setTags} /> : null}
          {error ? <Problem error={error} /> : null}
        </div>
      )}
    </Sheet>
  );
}

function EditSheet({ d, onClose, onDone }: { d: SharedDeckCard | null; onClose: () => void; onDone: (d: SharedDeckCard) => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<DeckDraft>({ name: "", description: "", tags: [], visibility: "publico" });
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { if (d) { setDraft({ name: d.name, description: d.description, tags: d.tags, visibility: d.visibility }); setTags(d.tags.join(", ")); setError(null); } }, [d]);
  const save = async () => {
    if (!d) return;
    setBusy(true); setError(null);
    try {
      onDone(await editPublished(d.slug, { name: draft.name.trim(), description: draft.description.trim(), visibility: draft.visibility, tags: splitTags(tags) }));
      onClose();
      toast({ text: "Baralho atualizado.", icon: "check", duration: 2400 });
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <Sheet open={!!d} onClose={onClose} title="Editar baralho publicado" subtitle="Nome, descrição e quem pode ver. Para mudar os cards, envie uma versão nova." width={560}
      footer={<><Button variant="gray" onClick={onClose}>Cancelar</Button><Button variant="filled" loading={busy} disabled={!draft.name.trim()} onClick={save}>Salvar</Button></>}>
      <div className="fc-form">
        <DraftFields draft={draft} set={(p) => setDraft((x) => ({ ...x, ...p }))} tags={tags} setTags={setTags} />
        {error ? <Problem error={error} /> : null}
      </div>
    </Sheet>
  );
}

/* ---------- um baralho ---------- */
function CardSamples({ cards }: { cards: SharedCard[] }) {
  const items = useMemo(() => cards.map((c) => ({ key: c.key, ...previewOf(c) })), [cards]);
  if (!items.length) return null;
  return (
    <ul className="fc-pv__cards">
      {items.map((c) => (
        <li key={c.key}>
          <p className="fc-pv__f" dangerouslySetInnerHTML={{ __html: c.front }} />
          {c.back ? <p className="fc-pv__b" dangerouslySetInnerHTML={{ __html: c.back }} /> : null}
        </li>
      ))}
    </ul>
  );
}

function DeckView({ slug }: { slug: string }) {
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, reload, setData } = useApi<{ deck: SharedDeckCard; sample: SharedCard[] }>(`/decks/${encodeURIComponent(slug)}`);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  const [report, setReport] = useState(false);
  const crumbs = [{ label: "Flashcards", to: "/flashcards" }, { label: "Compartilhados", to: "/flashcards/compartilhados" }];
  if (!data) {
    const missing = (error as ApiError | null)?.status === 404;
    return (
      <Page title="Baralho" crumbs={crumbs}>
        {missing ? <EmptyState icon="cards" title="Não encontramos esse baralho">O link pode estar errado, o baralho pode ter sido despublicado ou ser só para seguidores.</EmptyState>
          : error ? <Problem error={error} onRetry={reload} /> : <Loading />}
      </Page>
    );
  }
  const d = data.deck;
  const subscribe = async () => {
    setBusy(true);
    try {
      const r = await subscribeDeck(d);
      setLocal(r.local);
      setData((x) => (x ? { ...x, deck: r.deck } : x));
      toast({ text: `Você assinou “${d.name}”.`, icon: "check", action: "Abrir", onAction: () => nav("/flashcards/baralho/" + encodeURIComponent(r.local)) });
    } catch (e) { toast({ text: errText(e), icon: "alert" }); } finally { setBusy(false); }
  };
  const openLocal = local || (d.subscribed ? `sub-${d.slug}` : null);
  return (
    <Page title={d.name} crumbs={crumbs}
      actions={d.mine ? <Button variant="gray" onClick={() => nav("/flashcards/compartilhados?aba=publicados")}>Gerenciar</Button>
        : openLocal ? <Button variant="tinted" icon="check" onClick={() => nav("/flashcards/compartilhados?aba=assinados")}>Assinado</Button>
        : <Button variant="filled" icon="plus" loading={busy} onClick={subscribe}>Assinar</Button>}>
      <div className="cols">
        <div className="cols__main">
          {d.description ? <p className="cm-deck__long">{d.description}</p> : null}
          <Section title="Amostra">
            {data.sample.length ? <CardSamples cards={data.sample} /> : <p className="cm-hint">Este baralho não tem cards.</p>}
          </Section>
        </div>
        <aside className="cols__aside">
          <div className="panel cm-deckinfo">
            <Link className="cm-deck__by cm-deck__by--big" to={"/u/" + d.owner.handle}><Avatar name={d.owner.name} url={d.owner.avatarUrl} size={36} /><span><b>{d.owner.name}</b><small>@{d.owner.handle}</small></span></Link>
            <dl className="cm-review">
              <div><span>Cards</span><b className="num">{num(d.cardsCount)}</b></div>
              <div><span>Assinantes</span><b className="num">{num(d.subscribers)}</b></div>
              <div><span>Versão</span><b className="num">{d.version}, atualizado {relTime(d.updatedAt)}</b></div>
              <div><span>Quem pode ver</span><b>{VIS[d.visibility].label}</b></div>
            </dl>
            {d.tags.length ? <div className="cm-tags">{d.tags.map((t) => <span key={t} className="cm-tag cm-tag--plain">{t}</span>)}</div> : null}
            <div className="cd-row cm-deckinfo__acts">
              <Button variant="gray" size="sm" icon="link" onClick={() => copy(toast, deckLink(d.slug), "Link copiado.")}>Copiar link</Button>
              {!d.mine ? <Button variant="plain" size="sm" onClick={() => setReport(true)}>Denunciar</Button> : null}
            </div>
            {!d.mine ? <p className="fc-help">Assinando, o baralho entra nos seus baralhos e as versões novas chegam sem apagar o seu progresso.</p> : null}
          </div>
        </aside>
      </div>
      <ReportSheet open={report} onClose={() => setReport(false)} targetKind="deck" targetId={d.id} title={`Denunciar “${d.name}”`} />
    </Page>
  );
}
