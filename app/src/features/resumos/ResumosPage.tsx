/* Resumos: um caderno livre. Pastas dentro de pastas, documentos com formatação e imagem.
   No desktop, a árvore fica à esquerda dentro da página; no celular, uma lista por nível com trilha.
   O editor só carrega quando a pessoa abre um documento. */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { ApiError } from "../../api/client";
import type { Doc, DocNode } from "../../api/types";
import { Page } from "../../app/Page";
import { Button } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Pulse } from "../../ds/medical";
import { Dialog, useToast } from "../../ds/overlay";
import { dayKey, plural, relativeDay } from "../../lib/format";
import { useCompact } from "../../lib/hooks";
import { spring } from "../../lib/motion";
import { docsApi } from "./api";
import { Glyph } from "./glyphs";
import { anchorOf, Menu } from "./Menu";
import type { Anchor } from "./Menu";
import { EditorGuard, IaMark, NodeGlyph, RenameField, SharedMark, Trail, trailFor } from "./parts";
import { SearchField, SearchResults, useDocSearch } from "./search";
import { loadTree, useDocs, useFolders, useTreeIndex } from "./store";
import { childrenOf, indexTree, nodeTitle, pathOf } from "./tree";
import { TreePanel } from "./TreePanel";
import { ResumosProvider, useResumos } from "./ui";
import { sendPendingDrafts } from "./drafts";

const DocEditor = lazy(() => import("./editor/DocEditor"));

export function ResumosPage() {
  return <ResumosProvider><Resumos /></ResumosProvider>;
}

function Resumos() {
  const { id } = useParams();
  const compact = useCompact();
  const loaded = useDocs((s) => s.loaded), error = useDocs((s) => s.error);
  const ix = useTreeIndex();
  const node = id ? ix.byId.get(id) : undefined;
  const openId = useRef(id);
  openId.current = id;
  useEffect(() => {
    void loadTree();
    void sendPendingDrafts(openId.current);
    const back = () => { void sendPendingDrafts(openId.current); };
    addEventListener("online", back);
    return () => removeEventListener("online", back);
  }, []);

  if (!loaded) {
    return (
      <div className="page rs">
        {error ? (
          <div className="rs-hero">
            <span className="rs-hero__art rs-hero__art--plain"><Icon name="alert" size={28} /></span>
            <h1 className="rs-hero__title">Não deu para abrir seus resumos</h1>
            <p className="rs-hero__text">{error}</p>
            <div className="rs-hero__acts"><Button variant="filled" icon="rotate" onClick={() => void loadTree()}>Tentar de novo</Button></div>
          </div>
        ) : <div className="center-pad"><Pulse label="Carregando seus resumos" /></div>}
      </div>
    );
  }
  if (!id && !ix.byId.size) return <div className="page rs"><EmptyHero /></div>;

  const isDoc = !!id && node?.kind !== "pasta";
  return (
    <div className="page rs" data-doc={isDoc ? "" : undefined}>
      <div className="rs-layout">
        {!compact ? <aside className="rs-panel" aria-label="Pastas e documentos"><TreePanel activeId={id} docOpen={isDoc} /></aside> : null}
        <div className="rs-main">
          {!id ? (compact ? <FolderView folder={null} /> : <Home />)
            : node?.kind === "pasta" ? <FolderView key={node.id} folder={node} />
            : <DocView key={id} id={id} />}
        </div>
      </div>
    </div>
  );
}

/* ---------- Sem nada ainda ---------- */
function EmptyHero() {
  const ui = useResumos();
  const newFolder = async () => { const d = await ui.acts.create("pasta", null); if (d) ui.startRename(d.id); };
  return (
    <motion.div className="rs-hero" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}>
      <span className="rs-hero__art" aria-hidden>
        <span className="rs-hero__sheet rs-hero__sheet--a" />
        <span className="rs-hero__sheet rs-hero__sheet--b" />
        <span className="rs-hero__sheet rs-hero__sheet--c"><Icon name="folder" size={30} /></span>
      </span>
      <h1 className="rs-hero__title">Seu caderno, do seu jeito</h1>
      <p className="rs-hero__text">Escreva resumos com títulos, tabelas e imagens, e organize em pastas dentro de pastas: por faculdade, por semestre, pela prova, como preferir.</p>
      <div className="rs-hero__acts">
        <Button variant="filled" onClick={() => void newFolder()}>Crie sua primeira pasta</Button>
        <Button variant="tinted" onClick={() => void ui.acts.create("doc", null)}>Novo resumo</Button>
      </div>
    </motion.div>
  );
}

/* ---------- Início: recentes ---------- */
function Home() {
  const nodes = useDocs((s) => s.nodes);
  const nav = useNavigate();
  const ix = useMemo(() => indexTree(nodes), [nodes]);
  const recent = useMemo(() => nodes.filter((n) => n.kind === "doc").sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8), [nodes]);
  return (
    <>
      <header className="page__head rs-head">
        <div className="page__titles">
          <h1 className="page__title">Resumos</h1>
          <p className="page__sub">Seus resumos, em pastas do seu jeito.</p>
        </div>
      </header>
      {recent.length ? (
        <section className="sec" aria-label="Documentos recentes">
          <div className="sec__head"><h2 className="sec__title">Recentes</h2></div>
          <div className="grid-auto" style={{ "--min": "240px" } as React.CSSProperties}>
            {recent.map((n, i) => {
              const up = pathOf(ix, n.id).slice(0, -1);
              return (
                <motion.button key={n.id} type="button" className="panel panel--tap rs-card" onClick={() => nav("/resumos/" + n.id)}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { ...spring.smooth, delay: Math.min(i, 8) * 0.025 } }}>
                  <span className="rs-card__glyph"><NodeGlyph node={n} size={20} /></span>
                  <span className="rs-card__title">{nodeTitle(n)}</span>
                  <span className="rs-card__meta">
                    <span className="rs-card__where">{up.length ? up.map(nodeTitle).join(" › ") : "Resumos"}</span>
                    <span className="rs-card__when">{relativeDay(dayKey(n.updatedAt))}<IaMark node={n} /><SharedMark node={n} /></span>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="empty rs-empty">
          <Icon name="folder" size={22} />
          <p>Suas pastas estão à esquerda. Abra uma e crie o primeiro resumo.</p>
        </div>
      )}
    </>
  );
}

/* ---------- Pasta: o que há dentro; no celular é assim que se navega ---------- */
function FolderView({ folder }: { folder: DocNode | null }) {
  const ix = useTreeIndex();
  const ui = useResumos();
  const nav = useNavigate();
  const compact = useCompact();
  const search = useDocSearch();
  const ensure = useFolders((s) => s.ensure);
  const [menu, setMenu] = useState<{ node: DocNode; anchor: Anchor } | null>(null);
  const items = childrenOf(ix, folder?.id ?? null);
  const parent = folder?.id ?? null;
  const here = folder ? pathOf(ix, folder.id) : [];
  useEffect(() => { if (folder) ensure([folder.id]); }, [folder, ensure]);
  const newFolder = async () => { const d = await ui.acts.create("pasta", parent); if (d) ui.startRename(d.id); };
  const title = folder ? nodeTitle(folder) : "Resumos";
  const recent = !folder && compact ? [...ix.byId.values()].filter((n) => n.kind === "doc").sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4) : [];
  return (
    <>
      {folder ? <Trail items={trailFor(here.slice(0, -1))} here={title} /> : null}
      <header className="page__head rs-head">
        <div className="page__titles">
          {folder && ui.renaming === folder.id ? <RenameField node={folder} onDone={(t) => { ui.stopRename(); if (t != null) void ui.acts.rename(folder.id, t); }} /> : (
            <h1 className="page__title rs-head__title">{folder?.icon ? <span className="rs-head__emoji" aria-hidden>{folder.icon}</span> : null}{title}{folder ? <SharedMark node={folder} size={16} /> : null}</h1>
          )}
          <p className="page__sub">{items.length ? plural(items.length, "item", "itens") : "Ainda vazia."}</p>
        </div>
        <div className="page__actions">
          {folder ? <Button variant="gray" icon="more" label="Mais opções" onClick={(e) => setMenu({ node: folder, anchor: anchorOf(e.currentTarget) })} /> : null}
        </div>
      </header>
      <div className="rs-folderbar">
        <Button variant="tinted" size="sm" onClick={() => void ui.acts.create("doc", parent)}><Glyph name="doc-plus" size={18} />Novo resumo</Button>
        <Button variant="gray" size="sm" onClick={() => void newFolder()}><Glyph name="folder-plus" size={18} />Nova pasta</Button>
      </div>
      {compact && !folder ? <div className="rs-folder__search"><SearchField value={search.q} onChange={search.setQ} /></div> : null}
      {search.active ? <SearchResults search={search} /> : (
        <>
          {items.length ? (
            <ul className="list rs-items" aria-label={`Dentro de ${title}`}>
              {items.map((n, i) => {
                const kids = childrenOf(ix, n.id).length;
                return (
                  <motion.li key={n.id} className="rs-item" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { ...spring.smooth, delay: Math.min(i, 10) * 0.02 } }}>
                    {ui.renaming === n.id ? (
                      <div className="rs-item__row"><span className="rs-item__glyph"><NodeGlyph node={n} size={20} /></span><RenameField node={n} onDone={(t) => { ui.stopRename(); if (t != null) void ui.acts.rename(n.id, t); }} /></div>
                    ) : (
                      <button type="button" className="rs-item__row cd-hoverable" onClick={() => nav("/resumos/" + n.id)}>
                        <span className="rs-item__glyph"><NodeGlyph node={n} size={20} /></span>
                        <span className="rs-item__main">
                          <span className="rs-item__title">{nodeTitle(n)}<IaMark node={n} /><SharedMark node={n} /></span>
                          <span className="rs-item__sub">{n.kind === "pasta" ? (kids ? plural(kids, "item", "itens") : "Vazia") : relativeDay(dayKey(n.updatedAt))}</span>
                        </span>
                        {n.kind === "pasta" ? <Icon name="chevron-right" size={18} className="row__chev" /> : null}
                      </button>
                    )}
                    <button type="button" className="rs-item__more cd-hoverable" aria-label={`Opções de ${nodeTitle(n)}`} onClick={(e) => setMenu({ node: n, anchor: anchorOf(e.currentTarget) })}><Icon name="more" size={18} /></button>
                  </motion.li>
                );
              })}
            </ul>
          ) : (
            <div className="empty rs-empty">
              <Icon name="folder" size={22} />
              <p>{folder ? "Esta pasta está vazia. Crie um resumo ou outra pasta aqui dentro." : "Crie um resumo ou uma pasta para começar."}</p>
            </div>
          )}
          {recent.length ? (
            <section className="sec rs-recent" aria-label="Documentos recentes">
              <div className="sec__head"><h2 className="sec__title">Recentes</h2></div>
              <ul className="list rs-items">
                {recent.map((n) => (
                  <li key={n.id} className="rs-item">
                    <button type="button" className="rs-item__row cd-hoverable" onClick={() => nav("/resumos/" + n.id)}>
                      <span className="rs-item__glyph"><NodeGlyph node={n} size={20} /></span>
                      <span className="rs-item__main"><span className="rs-item__title">{nodeTitle(n)}</span><span className="rs-item__sub">{relativeDay(dayKey(n.updatedAt))}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
      {menu ? <Menu anchor={menu.anchor} items={ui.menuFor(menu.node)} onClose={() => setMenu(null)} label={`Opções de ${nodeTitle(menu.node)}`} align="end" /> : null}
    </>
  );
}

/* ---------- Documento: busca e abre o editor ---------- */
function DocView({ id }: { id: string }) {
  const [st, setSt] = useState<{ doc?: Doc; error?: string; missing?: boolean }>({});
  const nav = useNavigate();
  useEffect(() => {
    let on = true;
    docsApi.get(id).then((doc) => { if (on) setSt({ doc }); }).catch((e: ApiError) => {
      if (!on) return;
      if (e.status === 404 || e.status === 403) setSt({ missing: true }); else setSt({ error: e.message });
    });
    return () => { on = false; };
  }, [id]);
  if (st.missing) {
    return (
      <div className="empty rs-empty rs-empty--top">
        <Icon name="doc" size={22} />
        <p>Este resumo não existe mais ou foi para a lixeira.</p>
        <Button variant="tinted" onClick={() => nav("/resumos")}>Ver meus resumos</Button>
      </div>
    );
  }
  if (st.error) {
    return (
      <div className="empty rs-empty rs-empty--top">
        <Icon name="alert" size={22} />
        <p>{st.error}</p>
        <Button variant="tinted" icon="rotate" onClick={() => { setSt({}); docsApi.get(id).then((doc) => setSt({ doc })).catch((e: ApiError) => setSt({ error: e.message })); }}>Tentar de novo</Button>
      </div>
    );
  }
  if (!st.doc) return <div className="center-pad"><Pulse label="Abrindo o resumo" /></div>;
  return (
    <EditorGuard message="Não deu para abrir este resumo. O que você escreveu continua guardado; recarregue a página para tentar de novo.">
      <Suspense fallback={<div className="center-pad"><Pulse label="Abrindo o editor" /></div>}><DocEditor doc={st.doc} /></Suspense>
    </EditorGuard>
  );
}

/* ---------- Lixeira ---------- */
export function LixeiraPage() {
  const [nodes, setNodes] = useState<DocNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forever, setForever] = useState<DocNode | null>(null);
  const toast = useToast();
  const nav = useNavigate();
  const load = () => docsApi.trash().then((n) => { setNodes(n); setError(null); }).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const ix = useMemo(() => indexTree(nodes || []), [nodes]);
  // só as raízes: o que estava dentro de uma pasta volta junto com ela
  const roots = childrenOf(ix, null);
  const restore = async (n: DocNode) => {
    try {
      const doc = await docsApi.restore(n.id);
      await load();
      void loadTree();
      toast({ text: `${nodeTitle(n)} voltou para os resumos.`, icon: "undo", action: "Abrir", onAction: () => nav("/resumos/" + doc.id) });
    } catch (e) { toast({ text: (e as Error).message, icon: "alert" }); }
  };
  const erase = async (n: DocNode) => {
    try { await docsApi.forever(n.id); await load(); toast({ text: `${nodeTitle(n)} foi apagado de vez.`, icon: "trash" }); }
    catch (e) { toast({ text: (e as Error).message, icon: "alert" }); }
  };
  return (
    <Page title="Lixeira" subtitle="Os itens ficam aqui por 30 dias e depois somem." crumbs={[{ label: "Resumos", to: "/resumos" }]} className="rs rs-trash">
      {error ? <div className="empty"><Icon name="alert" size={22} /><p>{error}</p><Button variant="tinted" icon="rotate" onClick={() => void load()}>Tentar de novo</Button></div>
        : !nodes ? <div className="center-pad"><Pulse label="Abrindo a lixeira" /></div>
        : !roots.length ? <div className="empty"><Icon name="trash" size={22} /><p>A lixeira está vazia. O que você excluir fica aqui por 30 dias, e dá para trazer de volta.</p></div>
        : (
          <ul className="list rs-items" aria-label="Itens na lixeira">
            {roots.map((n) => {
              return (
                <li key={n.id} className="rs-item">
                  <div className="rs-item__row">
                    <span className="rs-item__glyph"><NodeGlyph node={n} size={20} /></span>
                    <span className="rs-item__main">
                      <span className="rs-item__title">{nodeTitle(n)}</span>
                      <span className="rs-item__sub">{n.kind === "pasta" ? "Pasta, com o que havia dentro" : `Editado ${relativeDay(dayKey(n.updatedAt)).toLowerCase()}`}</span>
                    </span>
                  </div>
                  <div className="rs-item__acts">
                    <Button variant="tinted" size="sm" icon="undo" onClick={() => void restore(n)}>Restaurar</Button>
                    <Button variant="plain" size="sm" className="rs-danger" icon="trash" label={`Apagar ${nodeTitle(n)} de vez`} onClick={() => setForever(n)} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      <Dialog open={!!forever} title="Apagar de vez?" confirmLabel="Apagar de vez" destructive onClose={() => setForever(null)} onConfirm={() => { const n = forever; setForever(null); if (n) void erase(n); }}>
        {forever ? `${nodeTitle(forever)}${forever.kind === "pasta" ? " e tudo o que há dentro" : ""} não vai poder voltar.` : ""}
      </Dialog>
    </Page>
  );
}
