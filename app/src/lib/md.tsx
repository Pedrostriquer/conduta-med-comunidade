/* Markdown simples para os textos dos assuntos e das resoluções: parágrafos, listas, tabelas, títulos, citação,
   negrito, itálico, código e link. Monta elementos do React direto do texto: nenhum HTML do texto é interpretado,
   e link só abre se começar com http(s). */
import { Fragment } from "react";
import type { ReactNode } from "react";

export type MdRefs = {
  /** códigos que viram link quando o texto diz "bloco ES6" */
  ids: Set<string>;
  onRef: (id: string) => void;
};

const TOKEN = /\*\*([^*\n](?:[^*\n]|\*(?!\*))*?)\*\*|`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(?<![\w*])\*([^*\s][^*\n]*?)\*(?![\w*])/g;
const REF = /\b(blocos?\s+)((?:[A-Z]{1,5}\d{1,2})(?:(?:,\s*|\s+e\s+|\s+ou\s+|\s+a\s+)[A-Z]{1,5}\d{1,2})*)/g;

function plain(s: string, refs: MdRefs | undefined, key: string): ReactNode[] {
  // `**` sem par não aparece
  const t = s.replace(/\*\*/g, "");
  if (!refs) return [t];
  const out: ReactNode[] = [];
  let last = 0, m: RegExpExecArray | null, n = 0;
  REF.lastIndex = 0;
  while ((m = REF.exec(t))) {
    out.push(t.slice(last, m.index) + m[1]);
    const parts = m[2].split(/([A-Z]{1,5}\d{1,2})/);
    for (const p of parts) {
      if (refs.ids.has(p)) out.push(<a key={key + "r" + n++} href={"#" + p} className="md-ref" onClick={(e) => { e.preventDefault(); refs.onRef(p); }}>{p}</a>);
      else out.push(p);
    }
    last = m.index + m[0].length;
  }
  out.push(t.slice(last));
  return out;
}

export function inline(text: string, refs?: MdRefs, key = "i", depth = 0): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0, m: RegExpExecArray | null, n = 0;
  const re = new RegExp(TOKEN.source, "g");
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(...plain(text.slice(last, m.index), refs, key + "p" + n));
    const k = key + "t" + n++;
    if (m[1] != null) out.push(<strong key={k}>{depth < 2 ? inline(m[1], refs, k, depth + 1) : m[1]}</strong>);
    else if (m[2] != null) out.push(<code key={k}>{m[2]}</code>);
    else if (m[3] != null) out.push(<a key={k} href={m[4]} target="_blank" rel="noopener noreferrer">{m[3]}</a>);
    else if (m[5] != null) out.push(<em key={k}>{depth < 2 ? inline(m[5], refs, k, depth + 1) : m[5]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...plain(text.slice(last), refs, key + "e"));
  return out;
}

/** uma linha de texto com negrito, itálico e link */
export function MdInline({ text, refs }: { text: string | null | undefined; refs?: MdRefs }) {
  return <>{text ? inline(String(text), refs) : null}</>;
}

const isUl = (l: string) => /^\s*[-*•]\s+/.test(l), isOl = (l: string) => /^\s*\d+[.)º]\s+/.test(l);
const isRow = (l: string) => /^\s*\|/.test(l);
const START = /^\s*(\||#{1,5}\s|>|[-*•]\s|\d+[.)º]\s)/;

function blocks(text: string, refs: MdRefs | undefined, key: string): ReactNode[] {
  const ls = text.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let i = 0, n = 0;
  while (i < ls.length) {
    const l = ls[i], k = key + n++;
    if (!l.trim()) { i++; continue; }
    if (isRow(l)) {
      const rows: string[][] = [];
      while (i < ls.length && isRow(ls[i])) { rows.push(ls[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim())); i++; }
      const head = rows.length > 1 && rows[1].every((c) => /^:?-{2,}:?$/.test(c));
      const body = head ? rows.slice(2) : rows;
      out.push(
        <div key={k} className="md-table-wrap"><table className="md-table">
          {head ? <thead><tr>{rows[0].map((c, j) => <th key={j}>{inline(c, refs)}</th>)}</tr></thead> : null}
          <tbody>{body.map((r, a) => <tr key={a}>{r.map((c, j) => <td key={j}>{inline(c, refs)}</td>)}</tr>)}</tbody>
        </table></div>,
      );
      continue;
    }
    const h = /^(#{1,5})\s+(.*)$/.exec(l);
    if (h) { out.push(<h4 key={k} className="md-h">{inline(h[2], refs)}</h4>); i++; continue; }
    if (/^\s*>/.test(l)) {
      const b: string[] = [];
      while (i < ls.length && /^\s*>/.test(ls[i])) { b.push(ls[i].replace(/^\s*>\s?/, "")); i++; }
      out.push(<blockquote key={k} className="md-quote">{blocks(b.join("\n"), refs, k)}</blockquote>);
      continue;
    }
    if (isUl(l) || isOl(l)) {
      const ol = isOl(l), items: string[] = [];
      while (i < ls.length && (ol ? isOl(ls[i]) : isUl(ls[i]))) { items.push(ls[i].replace(ol ? /^\s*\d+[.)º]\s+/ : /^\s*[-*•]\s+/, "")); i++; }
      const lis = items.map((x, j) => <li key={j}>{inline(x, refs)}</li>);
      out.push(ol ? <ol key={k}>{lis}</ol> : <ul key={k}>{lis}</ul>);
      continue;
    }
    const p: string[] = [];
    while (i < ls.length && ls[i].trim() && !START.test(ls[i])) { p.push(ls[i]); i++; }
    if (!p.length) { p.push(ls[i]); i++; }
    out.push(<p key={k}>{p.map((x, j) => <Fragment key={j}>{j ? <br /> : null}{inline(x, refs)}</Fragment>)}</p>);
  }
  return out;
}

/** texto em markdown simples, em blocos */
export function Md({ text, refs, className }: { text: string | null | undefined; refs?: MdRefs; className?: string }) {
  if (!text) return null;
  return <div className={className ? "md " + className : "md"}>{blocks(String(text), refs, "b")}</div>;
}
