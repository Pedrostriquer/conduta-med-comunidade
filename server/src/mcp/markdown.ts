/* Markdown ⇄ JSON do Tiptap, o formato do editor de resumos: títulos, listas, tarefas, tabela, citação, código, negrito,
   itálico, tachado, código em linha e links. Escrito à mão porque o resumo vem de uma IA: o que não for reconhecido
   vira parágrafo comum e nada se perde. */
type Mark = { type: string; attrs?: Record<string, unknown> };
export type TNode = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: Mark[]; content?: TNode[] };

const SAFE_LINK = /^(https?:\/\/|mailto:|\/)/i;

/* ---------- em linha ---------- */
const TOKENS = /(\*\*|__)(?=\S)([\s\S]*?\S)\1|(\*|_)(?=\S)([\s\S]*?\S)\3|~~(?=\S)([\s\S]*?\S)~~|`([^`]+)`|\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/;

function inline(src: string, marks: Mark[] = []): TNode[] {
  const out: TNode[] = [];
  const own = marks.length ? marks : undefined;
  const text = (t: string) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last?.type === "text" && last.marks === own) last.text += t;
    else out.push(own ? { type: "text", text: t, marks: own } : { type: "text", text: t });
  };
  let rest = src;
  while (rest) {
    const m = TOKENS.exec(rest);
    if (!m) { text(rest); break; }
    // `_` no meio de uma palavra (como em nome_de_arquivo) não é itálico
    if (m[3] === "_" && m.index > 0 && /\w/.test(rest[m.index - 1])) { text(rest.slice(0, m.index + 1)); rest = rest.slice(m.index + 1); continue; }
    text(rest.slice(0, m.index));
    if (m[1]) out.push(...inline(m[2], [...marks, { type: "bold" }]));
    else if (m[3]) out.push(...inline(m[4], [...marks, { type: "italic" }]));
    else if (m[5]) out.push(...inline(m[5], [...marks, { type: "strike" }]));
    else if (m[6]) out.push({ type: "text", text: m[6], marks: [...marks, { type: "code" }] });
    else if (SAFE_LINK.test(m[8])) out.push(...inline(m[7], [...marks, { type: "link", attrs: { href: m[8] } }]));
    else text(m[7]);
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}
const para = (s: string): TNode => { const c = inlineLines(s); return c.length ? { type: "paragraph", content: c } : { type: "paragraph" }; };
function inlineLines(s: string): TNode[] {
  const out: TNode[] = [];
  s.split("\n").forEach((l, i) => { if (i) out.push({ type: "hardBreak" }); out.push(...inline(l)); });
  return out;
}

/* ---------- blocos ---------- */
const BULLET = /^(\s*)[-*+]\s+(.*)$/, ORDERED = /^(\s*)(\d+)[.)]\s+(.*)$/, TASK = /^\[( |x|X)\]\s+(.*)$/;
const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l: string) => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
const startsBlock = (l: string) => /^(#{1,6})\s/.test(l) || /^>\s?/.test(l) || BULLET.test(l) || ORDERED.test(l) || /^```/.test(l) || /^(-{3,}|\*{3,}|_{3,})\s*$/.test(l) || isTableRow(l);

function lists(lines: string[], start: number): { node: TNode; next: number } {
  const first = lines[start], ordered = ORDERED.test(first) && !BULLET.test(first);
  const indent = (ordered ? ORDERED.exec(first)![1] : BULLET.exec(first)![1]).length;
  const items: { body: string; sub: string[] }[] = [];
  let i = start;
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) { if (lines[i + 1] && (BULLET.test(lines[i + 1]) || ORDERED.test(lines[i + 1]))) continue; break; }
    const m = ordered ? ORDERED.exec(l) : BULLET.exec(l), ind = m ? m[1].length : (/^\s*/.exec(l)?.[0].length ?? 0);
    if (m && ind === indent) { items.push({ body: ordered ? m[3] : m[2], sub: [] }); continue; }
    if (ind > indent && items.length) { items[items.length - 1].sub.push(l); continue; }
    if (!m && items.length && !startsBlock(l)) { items[items.length - 1].body += "\n" + l.trim(); continue; }
    break;
  }
  const isTask = !ordered && items.length > 0 && items.every((x) => TASK.test(x.body));
  const content = items.map((x): TNode => {
    const task = isTask ? TASK.exec(x.body)! : null;
    const inner: TNode[] = [para(task ? task[2] : x.body), ...(x.sub.length ? blocks(x.sub) : [])];
    return task ? { type: "taskItem", attrs: { checked: task[1].toLowerCase() === "x" }, content: inner } : { type: "listItem", content: inner };
  });
  return { node: isTask ? { type: "taskList", content } : ordered ? { type: "orderedList", attrs: { start: Number(ORDERED.exec(first)![2]) || 1 }, content } : { type: "bulletList", content }, next: i };
}

function blocks(lines: string[]): TNode[] {
  const out: TNode[] = [];
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (h) { const c = inline(h[2]); out.push({ type: "heading", attrs: { level: Math.min(h[1].length, 4) }, ...(c.length ? { content: c } : {}) }); i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { out.push({ type: "horizontalRule" }); i++; continue; }
    const fence = /^```\s*(\S*)/.exec(l);
    if (fence) {
      const body: string[] = [];
      for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) body.push(lines[i]);
      i++;
      out.push({ type: "codeBlock", attrs: { language: fence[1] || null }, ...(body.length ? { content: [{ type: "text", text: body.join("\n") }] } : {}) });
      continue;
    }
    if (/^>\s?/.test(l)) {
      const q: string[] = [];
      for (; i < lines.length && /^>\s?/.test(lines[i]); i++) q.push(lines[i].replace(/^>\s?/, ""));
      out.push({ type: "blockquote", content: blocks(q) });
      continue;
    }
    if (isTableRow(l) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(l), rows: TNode[] = [];
      const row = (cs: string[], type: string): TNode => ({ type: "tableRow", content: head.map((_, j) => ({ type, content: [para(cs[j] ?? "")] })) });
      rows.push(row(head, "tableHeader"));
      for (i += 2; i < lines.length && isTableRow(lines[i]); i++) rows.push(row(cells(lines[i]), "tableCell"));
      out.push({ type: "table", content: rows });
      continue;
    }
    if (BULLET.test(l) || ORDERED.test(l)) { const r = lists(lines, i); out.push(r.node); i = r.next; continue; }
    const p: string[] = [];
    for (; i < lines.length && lines[i].trim() && (!p.length || !startsBlock(lines[i])); i++) p.push(lines[i].trim());
    out.push(para(p.join("\n")));
  }
  return out;
}

export function markdownToTiptap(md: string): { type: "doc"; content: TNode[] } {
  const content = blocks(md.replace(/\r\n?/g, "\n").split("\n"));
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/* ---------- de volta para ler ---------- */
function inlineMd(ns: TNode[] = []): string {
  return ns.map((n) => {
    if (n.type === "hardBreak") return "\n";
    let t = n.text ?? inlineMd(n.content);
    for (const m of n.marks || []) {
      if (m.type === "bold") t = `**${t}**`;
      else if (m.type === "italic") t = `*${t}*`;
      else if (m.type === "strike") t = `~~${t}~~`;
      else if (m.type === "code") t = "`" + t + "`";
      else if (m.type === "link") t = `[${t}](${String(m.attrs?.href ?? "")})`;
    }
    return t;
  }).join("");
}
const indent = (s: string, by: string) => s.split("\n").map((l) => (l ? by + l : l)).join("\n");

function nodeMd(n: TNode): string {
  const kids = n.content || [];
  switch (n.type) {
    case "heading": return "#".repeat(Number(n.attrs?.level) || 2) + " " + inlineMd(kids);
    case "paragraph": return inlineMd(kids);
    case "bulletList": return kids.map((i) => "- " + nodeMd(i)).join("\n");
    case "orderedList": return kids.map((i, j) => `${j + (Number(n.attrs?.start) || 1)}. ` + nodeMd(i)).join("\n");
    case "taskList": return kids.map((i) => `- [${i.attrs?.checked ? "x" : " "}] ` + nodeMd(i)).join("\n");
    case "listItem": case "taskItem": { const [a, ...b] = kids.map(nodeMd); return [a ?? "", ...b.map((x) => indent(x, "  "))].join("\n"); }
    case "blockquote": return kids.map(nodeMd).join("\n\n").split("\n").map((l) => "> " + l).join("\n");
    case "codeBlock": return "```" + String(n.attrs?.language ?? "") + "\n" + inlineMd(kids) + "\n```";
    case "horizontalRule": return "---";
    case "image": return `![${String(n.attrs?.alt ?? "")}](${String(n.attrs?.src ?? "")})`;
    case "table": {
      const rows = kids.map((r) => "| " + (r.content || []).map((c) => (c.content || []).map(nodeMd).join(" ").replace(/\n/g, " ")).join(" | ") + " |");
      return rows.length ? [rows[0], "|" + " --- |".repeat((kids[0].content || []).length), ...rows.slice(1)].join("\n") : "";
    }
    default: return kids.length ? kids.map(nodeMd).join("\n\n") : (n.text ?? "");
  }
}
export function tiptapToMarkdown(doc: unknown) {
  const n = doc as TNode | null;
  return n && Array.isArray(n.content) ? n.content.map(nodeMd).join("\n\n").trim() : "";
}
