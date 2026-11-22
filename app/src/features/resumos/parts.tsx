/* Peças comuns: ícone de pasta ou documento, marca de compartilhado, trilha, renomear no lugar e o texto da busca. */
import { Component, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { DocNode, Visibility } from "../../api/types";
import { Icon } from "../../ds/Icon";
import { nodeTitle } from "./tree";

export function NodeGlyph({ node, size = 18 }: { node: Pick<DocNode, "kind" | "icon">; size?: number }) {
  if (node.icon) return <span className="rs-emoji" style={{ fontSize: Math.round(size * 0.9), width: size, height: size }} aria-hidden>{node.icon}</span>;
  return <Icon name={node.kind === "pasta" ? "folder" : "doc"} size={size} />;
}

export const VIS_LABEL: Record<Visibility, string> = { privado: "Privado", seguidores: "Quem me segue", publico: "Todo mundo com conta" };
export const VIS_ICON: Record<Visibility, string> = { privado: "lock", seguidores: "users", publico: "globe" };

/** ícone discreto para o que está compartilhado; `sharedByParent` também conta */
export function SharedMark({ node, size = 14 }: { node: Pick<DocNode, "visibility" | "sharedByParent">; size?: number }) {
  if (node.visibility === "privado" && !node.sharedByParent) return null;
  const own = node.visibility !== "privado";
  const label = own ? `Compartilhado: ${VIS_LABEL[node.visibility].toLowerCase()}` : "Visível por causa da pasta em que está";
  return <span className="rs-shared" title={label} aria-label={label} role="img"><Icon name={own ? VIS_ICON[node.visibility] : "users"} size={size} /></span>;
}

/** discreto: quem escreveu foi a IA da pessoa */
export function IaMark({ node }: { node: Pick<DocNode, "origin"> }) {
  if (node.origin !== "ia") return null;
  return <span className="rs-ia" title="Criado pela sua IA" aria-label="Criado pela sua IA" role="img"><Icon name="sparkle" size={13} /></span>;
}

export type TrailItem = { label: ReactNode; to?: string };

/** a trilha "Resumos › Faculdade › Cardio"; no celular rola de lado e mostra o fim */
export function Trail({ items, here }: { items: TrailItem[]; here: ReactNode }) {
  const nav = useNavigate();
  const ol = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => { if (ol.current) ol.current.scrollLeft = ol.current.scrollWidth; }, [items.length, here]);
  return (
    <nav className="crumbs rs-crumbs" aria-label="Você está em">
      <ol ref={ol} className="crumbs__trail">
        {items.map((c, i) => (
          <li key={i}>
            {c.to ? <button type="button" className="crumbs__link cd-hoverable" onClick={() => nav(c.to!)}>{c.label}</button> : <span className="crumbs__text">{c.label}</span>}
            <Icon name="chevron-right" size={14} strokeWidth={2} className="crumbs__sep" />
          </li>
        ))}
        <li aria-current="page"><span className="crumbs__here">{here}</span></li>
      </ol>
    </nav>
  );
}

export const trailFor = (path: DocNode[]): TrailItem[] => [{ label: "Resumos", to: "/resumos" }, ...path.map((n) => ({ label: nodeTitle(n), to: "/resumos/" + n.id }))];

/** campo para renomear no lugar: Enter guarda, Esc desiste, sair do campo guarda */
export function RenameField({ node, onDone }: { node: DocNode; onDone: (title: string | null) => void }) {
  const [v, setV] = useState(node.title);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = (t: string | null) => { if (done.current) return; done.current = true; onDone(t); };
  useEffect(() => { const el = input.current; if (el) { el.focus({ preventScroll: true }); el.select(); } }, []);
  return (
    <input ref={input} className="rs-rename" value={v} aria-label="Novo nome" maxLength={300} onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); finish(v.trim()); } if (e.key === "Escape") { e.preventDefault(); finish(null); } }}
      onBlur={() => finish(v.trim())} />
  );
}

/** se o editor quebrar, a tela diz isso e o resto do app continua de pé */
export class EditorGuard extends Component<{ children: ReactNode; message: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="empty rs-empty rs-empty--top" role="alert"><Icon name="alert" size={22} /><p>{this.props.message}</p></div>;
  }
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const t = document.createElement("textarea");
    t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    t.remove();
    return ok;
  }
}
