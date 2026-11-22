/* Folhas dos resumos: compartilhar, escolher a pasta de destino, escolher o ícone. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DocNode, Visibility } from "../../api/types";
import { Button } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Sheet, useToast } from "../../ds/overlay";
import { cx } from "../../lib/cx";
import { useAuth } from "../../state/auth";
import { useDocActions } from "./actions";
import { copyText, NodeGlyph, VIS_ICON, VIS_LABEL } from "./parts";
import { loadTree, useDocs, useTreeIndex } from "./store";
import { childrenOf, descendantsOf, nodeTitle, pathOf, sharingAncestor } from "./tree";

const VIS_HINT: Record<Visibility, string> = {
  privado: "Só você vê.",
  seguidores: "Só quem você aceitou como seguidor.",
  publico: "Qualquer pessoa com conta no Conduta Med pelo seu perfil.",
};

export function ShareSheet({ id, onClose, onSwitch }: { id: string | null; onClose: () => void; onSwitch: (id: string) => void }) {
  const ix = useTreeIndex();
  const acts = useDocActions();
  const toast = useToast();
  const nav = useNavigate();
  const node = id ? ix.byId.get(id) : undefined;
  const me = useAuth((s) => s.user);
  const open = !!node;
  const parent = node ? sharingAncestor(ix, node.id) : null;
  const byParent = !!node && (node.sharedByParent || !!parent);
  const visible = !!node && (node.visibility !== "privado" || byParent);
  const url = node && me ? `${location.origin}/u/${me.handle}/resumos/${node.id}` : "";
  const kindWord = node?.kind === "pasta" ? "esta pasta" : "este resumo";
  return (
    <Sheet open={open} onClose={onClose} title="Compartilhar" subtitle={node ? nodeTitle(node) : undefined} width={500}>
      {node ? (
        <div className="rs-share">
          <div className="rs-opts" role="radiogroup" aria-label="Quem pode ver">
            {(["privado", "seguidores", "publico"] as Visibility[]).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={node.visibility === v} className="rs-opt cd-hoverable" onClick={() => { void acts.setVisibility(node.id, v); }}>
                <span className="rs-opt__icon"><Icon name={VIS_ICON[v]} size={20} /></span>
                <span className="rs-opt__text"><b>{VIS_LABEL[v]}</b><small>{VIS_HINT[v]}</small></span>
                <span className="rs-opt__dot" aria-hidden />
              </button>
            ))}
          </div>
          {byParent ? (
            <div className="rs-note">
              <Icon name="folder" size={18} />
              <div>
                <p>Está visível por causa da pasta <b>{parent ? nodeTitle(parent) : "acima"}</b>, que compartilha tudo o que há dentro dela.{node.visibility === "privado" ? " Marcar como privado aqui não esconde enquanto a pasta estiver compartilhada." : ""}</p>
                {parent ? <button type="button" className="rs-linkbtn" onClick={() => onSwitch(parent.id)}>Ver o compartilhamento da pasta</button> : null}
              </div>
            </div>
          ) : null}
          {node.kind === "pasta" && node.visibility !== "privado" ? <div className="rs-note"><Icon name="info" size={18} /><p>Tudo o que estiver dentro desta pasta fica visível junto, inclusive o que você colocar depois.</p></div> : null}
          {me?.visibility === "privado" ? (
            <div className="rs-note" data-tone="warning">
              <Icon name="alert" size={18} />
              <div>
                <p>Seu perfil está privado, então ninguém vê {kindWord} agora, mesmo compartilhado.</p>
                <button type="button" className="rs-linkbtn" onClick={() => { onClose(); nav("/perfil/editar"); }}>Mudar a privacidade do perfil</button>
              </div>
            </div>
          ) : null}
          {visible && url ? (
            <div className="rs-copylink">
              <span className="rs-copylink__url" title={url}>{url.replace(/^https?:\/\//, "")}</span>
              <Button variant="tinted" size="sm" icon="link" onClick={async () => { toast({ text: (await copyText(url)) ? "Link copiado." : "Não deu para copiar o link.", icon: "link", duration: 2400 }); }}>Copiar link</Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}

/** Escolher uma pasta de destino (mover ou copiar). A raiz é "Resumos". */
export function MoveSheet({ node, open, onClose, onPick, title, confirm = "Mover para cá", subtitle }: {
  node?: DocNode; open: boolean; onClose: () => void; onPick: (parent: string | null) => void; title?: string; confirm?: string; subtitle?: string;
}) {
  const ix = useTreeIndex();
  const loaded = useDocs((s) => s.loaded);
  const [picked, setPicked] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!open) return;
    if (!loaded) void loadTree();
    setPicked(node?.parentId ?? null);
    const start: Record<string, boolean> = {};
    if (node) for (const p of pathOf(ix, node.id).slice(0, -1)) start[p.id] = true;
    setExpanded(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, node?.id, loaded]);
  const banned = useMemo(() => new Set(node ? [node.id, ...descendantsOf(ix, node.id)] : []), [ix, node]);
  const rows: { n: DocNode; depth: number; hasKids: boolean }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const n of childrenOf(ix, parent)) {
      if (n.kind !== "pasta") continue;
      const hasKids = childrenOf(ix, n.id).some((k) => k.kind === "pasta");
      rows.push({ n, depth, hasKids });
      if (expanded[n.id]) walk(n.id, depth + 1);
    }
  };
  walk(null, 0);
  const same = !!node && (node.parentId ?? null) === picked;
  return (
    <Sheet open={open} onClose={onClose} title={title || "Mover para"} subtitle={subtitle || (node ? nodeTitle(node) : undefined)} width={480}
      footer={<><Button variant="gray" onClick={onClose}>Cancelar</Button><Button variant="filled" disabled={same} onClick={() => onPick(picked)}>{confirm}</Button></>}>
      <div className="rs-picker" role="tree" aria-label="Pastas">
        <button type="button" role="treeitem" aria-selected={picked === null} className="rs-picker__row cd-hoverable" onClick={() => setPicked(null)}>
          <span className="rs-picker__tw" />
          <Icon name="doc" size={18} />
          <span className="rs-picker__name">Resumos</span>
          {picked === null ? <Icon name="check" size={16} strokeWidth={2.25} /> : null}
        </button>
        {rows.map(({ n, depth, hasKids }) => {
          const off = banned.has(n.id);
          return (
            <div key={n.id} className={cx("rs-picker__row cd-hoverable", off && "is-off")} role="treeitem" aria-selected={picked === n.id} aria-disabled={off || undefined} aria-expanded={hasKids ? !!expanded[n.id] : undefined}
              tabIndex={off ? -1 : 0} style={{ paddingLeft: 8 + (depth + 1) * 18 }}
              onClick={() => { if (!off) setPicked(n.id); }} onKeyDown={(e) => { if (!off && e.key === "Enter") setPicked(n.id); }}>
              {hasKids ? (
                <button type="button" className="rs-picker__tw cd-hoverable" aria-label={expanded[n.id] ? "Fechar pasta" : "Abrir pasta"} onClick={(e) => { e.stopPropagation(); setExpanded((x) => ({ ...x, [n.id]: !x[n.id] })); }}>
                  <Icon name={expanded[n.id] ? "chevron-down" : "chevron-right"} size={14} strokeWidth={2} />
                </button>
              ) : <span className="rs-picker__tw" />}
              <NodeGlyph node={n} />
              <span className="rs-picker__name">{nodeTitle(n)}</span>
              {picked === n.id ? <Icon name="check" size={16} strokeWidth={2.25} /> : null}
            </div>
          );
        })}
        {!rows.length ? <p className="rs-picker__none">Você ainda não tem pastas. Vai direto para Resumos.</p> : null}
      </div>
    </Sheet>
  );
}

const EMOJI = ["📚", "📝", "📌", "⭐", "🔥", "✅", "❗", "🧠", "🫀", "🫁", "🩺", "🩸", "🦴", "🦠", "🧬", "💊", "💉", "🧪", "🔬", "🏥", "🚑", "👶", "🤰", "👁️", "🦷", "🧒", "🧓", "🌡️", "📅", "🎓", "📖", "🗂️"];

export function IconSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const ix = useTreeIndex();
  const acts = useDocActions();
  const node = id ? ix.byId.get(id) : undefined;
  const [own, setOwn] = useState("");
  useEffect(() => { setOwn(""); }, [id]);
  const pick = (icon: string | null) => { if (node) void acts.setIcon(node.id, icon); onClose(); };
  // o campo aceita um emoji só, nada de texto comprido
  const typed = [...own.trim()].slice(0, 4).join("");
  return (
    <Sheet open={!!node} onClose={onClose} title="Ícone" subtitle={node ? nodeTitle(node) : undefined} width={420}
      footer={<Button variant="plain" icon="x" disabled={!node?.icon} onClick={() => pick(null)}>Sem ícone</Button>}>
      <div className="rs-emojis" role="group" aria-label="Escolha um emoji">
        {EMOJI.map((e) => <button key={e} type="button" className="rs-emojis__item cd-hoverable" aria-pressed={node?.icon === e} onClick={() => pick(e)}><span aria-hidden>{e}</span><span className="sr">{e}</span></button>)}
      </div>
      <form className="rs-emojis__own" onSubmit={(ev) => { ev.preventDefault(); if (typed) pick(typed); }}>
        <div className="search"><input value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Ou cole outro emoji" aria-label="Outro emoji" maxLength={16} /></div>
        <Button variant="gray" disabled={!typed} type="submit">Usar</Button>
      </form>
    </Sheet>
  );
}
