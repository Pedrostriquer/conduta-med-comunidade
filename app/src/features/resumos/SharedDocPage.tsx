/* Um resumo ou pasta de outra pessoa: só leitura, com a trilha Pessoas › Nome › título, copiar para os meus e denunciar. */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiGet } from "../../api/client";
import type { ApiError } from "../../api/client";
import type { Doc, DocNode, PublicProfile } from "../../api/types";
import { Page } from "../../app/Page";
import type { Crumb } from "../../app/Page";
import { Button } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Pulse } from "../../ds/medical";
import { Sheet, useToast } from "../../ds/overlay";
import { dayKey, plural, relativeDay } from "../../lib/format";
import { docsApi } from "./api";
import { anchorOf, Menu } from "./Menu";
import type { Anchor } from "./Menu";
import { EditorGuard, NodeGlyph } from "./parts";
import { MoveSheet } from "./sheets";
import { loadTree, putNode } from "./store";
import { childrenOf, descendantsOf, flatten, indexTree, nodeTitle, pathOf } from "./tree";

const DocReader = lazy(() => import("./editor/DocReader"));

type State = { doc?: Doc; nodes?: DocNode[]; owner?: PublicProfile | null; denied?: boolean; error?: string };

export function SharedDocPage() {
  const { handle = "", id = "" } = useParams();
  const [st, setSt] = useState<State>({});
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let on = true;
    setSt({});
    Promise.all([
      docsApi.userDoc(handle, id),
      docsApi.userTree(handle).catch(() => [] as DocNode[]),
      apiGet<{ profile: PublicProfile }>(`/users/${encodeURIComponent(handle)}`).then((r) => r.profile).catch(() => null),
    ]).then(([doc, nodes, owner]) => { if (on) setSt({ doc, nodes, owner }); }).catch((e: ApiError) => {
      if (!on) return;
      if (e.status === 403 || e.status === 404) setSt({ denied: true }); else setSt({ error: e.message });
    });
    return () => { on = false; };
  }, [handle, id, tick]);

  if (st.denied) {
    return (
      <Page title="Sem acesso" crumbs={[{ label: "Pessoas", to: "/pessoas" }, { label: "@" + handle, to: "/u/" + handle }]} className="rs">
        <div className="empty rs-empty">
          <Icon name="lock" size={22} />
          <p>Você não tem acesso a este resumo. A pessoa pode ter deixado de compartilhar, ter o perfil privado, ou mostrar só para quem ela aceitou como seguidor.</p>
          <ProfileButton handle={handle} />
        </div>
      </Page>
    );
  }
  if (st.error) {
    return (
      <Page title="Não deu para abrir" crumbs={[{ label: "Pessoas", to: "/pessoas" }]} className="rs">
        <div className="empty rs-empty"><Icon name="alert" size={22} /><p>{st.error}</p><Button variant="tinted" icon="rotate" onClick={() => setTick((t) => t + 1)}>Tentar de novo</Button></div>
      </Page>
    );
  }
  if (!st.doc) return <div className="page rs"><div className="center-pad"><Pulse label="Abrindo o resumo" /></div></div>;
  return <SharedView key={st.doc.id} doc={st.doc} nodes={st.nodes || []} owner={st.owner ?? null} handle={handle} />;
}

function ProfileButton({ handle }: { handle: string }) {
  const nav = useNavigate();
  return <Button variant="tinted" onClick={() => nav("/u/" + handle)}>Ver o perfil</Button>;
}

function SharedView({ doc, nodes, owner, handle }: { doc: Doc; nodes: DocNode[]; owner: PublicProfile | null; handle: string }) {
  const nav = useNavigate();
  const toast = useToast();
  const ix = useMemo(() => indexTree(nodes), [nodes]);
  const [copying, setCopying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState<Anchor | null>(null);
  const [report, setReport] = useState(false);
  const isMine = owner?.relation === "eu";
  const up = pathOf(ix, doc.id).slice(0, -1);
  const crumbs: Crumb[] = [
    { label: "Pessoas", to: "/pessoas" },
    { label: owner?.name || "@" + handle, to: "/u/" + handle },
    ...up.map((n) => ({ label: nodeTitle(n), to: `/u/${handle}/resumos/${n.id}` })),
  ];
  const copy = async (parent: string | null) => {
    setCopying(false); setBusy(true);
    try {
      const copied = await docsApi.copy(handle, doc.id, parent);
      putNode(copied);
      void loadTree();
      toast({ text: "Copiado para os seus resumos.", icon: "copy", action: "Abrir", duration: 6000, onAction: () => nav("/resumos/" + copied.id) });
    } catch (e) { toast({ text: (e as Error).message, icon: "alert" }); }
    setBusy(false);
  };
  const title = <>{doc.icon ? <span className="rs-head__emoji" aria-hidden>{doc.icon}</span> : null}{nodeTitle(doc)}</>;
  return (
    <Page title={title} crumbs={crumbs} className="rs rs-shared-page"
      subtitle={`De ${owner?.name || "@" + handle} · atualizado ${relativeDay(dayKey(doc.updatedAt)).toLowerCase()}`}
      actions={
        <>
          {isMine ? <Button variant="tinted" icon="pencil" onClick={() => nav("/resumos/" + doc.id)}>Abrir no editor</Button>
            : <Button variant="tinted" icon="copy" loading={busy} onClick={() => setCopying(true)}>Copiar para meus resumos</Button>}
          {!isMine ? <Button variant="plain" icon="more" label="Mais opções" onClick={(e) => setMore(anchorOf(e.currentTarget))} /> : null}
        </>
      }>
      {doc.kind === "pasta" ? <SharedTree root={doc.id} ix={ix} handle={handle} /> : (
        <div className="rs-sheet rs-sheet--read">
          <EditorGuard message="Não deu para mostrar este resumo. Recarregue a página para tentar de novo."><Suspense fallback={<div className="center-pad"><Pulse label="Abrindo o resumo" /></div>}><DocReader content={doc.content} /></Suspense></EditorGuard>
        </div>
      )}
      {more ? <Menu anchor={more} align="end" label="Mais opções" onClose={() => setMore(null)} items={[{ label: "Denunciar", icon: "flag", onSelect: () => setReport(true) }]} /> : null}
      <MoveSheet open={copying} onClose={() => setCopying(false)} onPick={(p) => void copy(p)} title="Copiar para" subtitle={`Escolha a pasta para ${nodeTitle(doc)}`} confirm="Copiar para cá" />
      <ReportSheet open={report} onClose={() => setReport(false)} id={doc.id} />
    </Page>
  );
}

function SharedTree({ root, ix, handle }: { root: string; ix: ReturnType<typeof indexTree>; handle: string }) {
  const nav = useNavigate();
  const [open, setOpen] = useState<Record<string, true>>({});
  const rows = useMemo(() => flatten(ix, open, root), [ix, open, root]);
  const total = descendantsOf(ix, root).length;
  if (!childrenOf(ix, root).length) return <div className="empty rs-empty"><Icon name="folder" size={22} /><p>Esta pasta está vazia.</p></div>;
  return (
    <>
      <p className="rs-shared-count">{plural(total, "item", "itens")}</p>
      <div className="rs-sharedtree" role="tree" aria-label="O que há na pasta">
        {rows.map((r) => (
          <button key={r.node.id} type="button" role="treeitem" aria-level={r.depth + 1} aria-expanded={r.node.kind === "pasta" ? r.open : undefined} className="rs-row rs-row--read cd-hoverable" style={{ "--depth": r.depth } as React.CSSProperties}
            onClick={() => {
              if (r.node.kind === "doc") { nav(`/u/${handle}/resumos/${r.node.id}`); return; }
              setOpen((o) => { const n = { ...o }; if (n[r.node.id]) delete n[r.node.id]; else n[r.node.id] = true; return n; });
            }}>
            <span className="rs-row__tw" aria-hidden>{r.node.kind === "pasta" ? <Icon name="chevron-right" size={14} strokeWidth={2} className={r.open ? "rs-row__chev is-open" : "rs-row__chev"} /> : null}</span>
            <span className="rs-row__glyph"><NodeGlyph node={r.node} /></span>
            <span className="rs-row__title">{nodeTitle(r.node)}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function ReportSheet({ open, onClose, id }: { open: boolean; onClose: () => void; id: string }) {
  const toast = useToast();
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await docsApi.report(id, why.trim());
      toast({ text: "Recebemos sua denúncia. Obrigado por avisar.", icon: "flag" });
      setWhy(""); onClose();
    } catch (e) { toast({ text: (e as Error).message, icon: "alert" }); }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Denunciar este resumo" subtitle="A pessoa não fica sabendo quem denunciou." width={460}
      footer={<><Button variant="gray" onClick={onClose}>Cancelar</Button><Button variant="filled" loading={busy} disabled={!why.trim()} onClick={() => void send()}>Enviar</Button></>}>
      <label className="rs-report">
        <span>O que há de errado?</span>
        <textarea data-autofocus="" rows={4} value={why} maxLength={1000} placeholder="Conteúdo ofensivo, informação perigosa, cópia sem autorização…" onChange={(e) => setWhy(e.target.value)} />
      </label>
    </Sheet>
  );
}

