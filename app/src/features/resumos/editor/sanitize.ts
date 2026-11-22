/* Tudo o que o editor recebe passa por aqui: só tipos conhecidos, só atributos conhecidos, com valores conferidos.
   Vale para o que a própria pessoa guardou e, principalmente, para o que veio de outra pessoa ou da IA.
   Links só http(s) e mailto; imagem só o que foi enviado para o próprio Conduta; cor só pela paleta. */

export const CALLOUT_TONES = ["conduta", "atencao", "dica", "dado"] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];
export const COLOR_TONES = ["cinza", "azul", "verde", "amarelo", "vermelho"] as const;
export type ColorTone = (typeof COLOR_TONES)[number];
const ALIGN = ["left", "center", "right", "justify"];

export type J = { type?: string; attrs?: Record<string, unknown>; content?: J[]; marks?: { type: string; attrs?: Record<string, unknown> }[]; text?: string };
export const EMPTY: J = { type: "doc", content: [{ type: "paragraph" }] };

const invisible = (c: number) => c <= 0x1f || (c >= 0x7f && c <= 0x9f) || c === 0xad || (c >= 0x200b && c <= 0x200f) || c === 0x2028 || c === 0x2029 || c === 0xfeff;

export function safeHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // tira os caracteres invisíveis que os navegadores ignoram ao ler o endereço
  const s = [...raw].filter((ch) => !invisible(ch.codePointAt(0)!)).join("").trim();
  if (!/^(https?:\/\/|mailto:)/i.test(s)) return null;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "mailto:" ? s : null;
  } catch { return null; }
}

/** o que a pessoa digitou no campo de link: aceita "site.com" e "nome@site.com" */
export function hrefFromInput(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/@]+\.[a-z]{2,}(:\d+)?(\/|$)/i.test(s)) return safeHref(s);
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(s)) return safeHref("mailto:" + s);
  return safeHref("https://" + s);
}

export function safeImageSrc(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw.trim(), location.origin);
    if (u.origin !== location.origin || !u.pathname.startsWith("/uploads/") || u.pathname.includes("..")) return null;
    return u.pathname;
  } catch { return null; }
}

const int = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const align = (a: Record<string, unknown>) => (ALIGN.includes(a.textAlign as string) ? { textAlign: a.textAlign } : {});
const cell = (a: Record<string, unknown>) => ({
  colspan: int(a.colspan, 1, 50) ?? 1, rowspan: int(a.rowspan, 1, 200) ?? 1,
  colwidth: Array.isArray(a.colwidth) && a.colwidth.every((w) => int(w, 1, 4000) != null) ? a.colwidth : null,
});
const tone = <T extends string>(v: unknown, all: readonly T[], fallback: T): T => (all.includes(v as T) ? (v as T) : fallback);

type AttrFn = (a: Record<string, unknown>) => Record<string, unknown> | null;
const NODES: Record<string, AttrFn> = {
  doc: () => ({}),
  paragraph: align,
  heading: (a) => ({ level: Math.max(1, Math.min(3, int(a.level, 1, 6) ?? 2)), ...align(a) }),
  bulletList: () => ({}),
  orderedList: (a) => ({ start: int(a.start, -1e6, 1e6) ?? 1 }),
  listItem: () => ({}),
  taskList: () => ({}),
  taskItem: (a) => ({ checked: a.checked === true }),
  blockquote: () => ({}),
  horizontalRule: () => ({}),
  codeBlock: (a) => ({ language: typeof a.language === "string" && /^[\w+-]{1,30}$/.test(a.language) ? a.language : null }),
  hardBreak: () => ({}),
  table: () => ({}),
  tableRow: () => ({}),
  tableHeader: cell,
  tableCell: cell,
  details: (a) => ({ open: a.open === true }),
  detailsSummary: () => ({}),
  detailsContent: () => ({}),
  callout: (a) => ({ tone: tone(a.tone, CALLOUT_TONES, "conduta") }),
  image: (a) => {
    const src = safeImageSrc(a.src);
    if (!src) return null;
    return { src, alt: str(a.alt, 500), caption: str(a.caption, 500), width: int(a.width, 10, 100) ?? 100, natW: int(a.natW, 1, 20000), natH: int(a.natH, 1, 20000) };
  },
  questionRef: (a) => (typeof a.qid === "string" && /^[\w.-]{1,64}$/.test(a.qid) ? { qid: a.qid, label: str(a.label, 120) } : null),
};
const PLAIN_TEXT = new Set(["codeBlock", "detailsSummary"]);
const MARKS: Record<string, AttrFn> = {
  bold: () => ({}), italic: () => ({}), underline: () => ({}), strike: () => ({}), code: () => ({}), superscript: () => ({}), subscript: () => ({}),
  link: (a) => { const href = safeHref(a.href); return href ? { href } : null; },
  textColor: (a) => (COLOR_TONES.includes(a.tone as ColorTone) ? { tone: a.tone } : null),
  highlight: (a) => ({ tone: tone(a.tone, COLOR_TONES, "amarelo") }),
};

function cleanMarks(marks: J["marks"]) {
  if (!Array.isArray(marks)) return undefined;
  const out: NonNullable<J["marks"]> = [];
  for (const m of marks) {
    if (!m || typeof m.type !== "string" || !Object.hasOwn(MARKS, m.type)) continue;
    const attrs = MARKS[m.type](m.attrs && typeof m.attrs === "object" ? m.attrs : {});
    if (!attrs) continue;
    out.push(Object.keys(attrs).length ? { type: m.type, attrs } : { type: m.type });
  }
  return out.length ? out : undefined;
}

function cleanNode(n: J, parent: string, depth: number): J[] {
  if (!n || typeof n !== "object" || depth > 64) return [];
  if (n.type === "text") {
    if (typeof n.text !== "string" || !n.text) return [];
    const marks = PLAIN_TEXT.has(parent) ? undefined : cleanMarks(n.marks);
    return [marks ? { type: "text", text: n.text, marks } : { type: "text", text: n.text }];
  }
  const kids = Array.isArray(n.content) ? n.content : [];
  if (typeof n.type !== "string" || !Object.hasOwn(NODES, n.type)) {
    // tipo desconhecido: fica só o que há dentro, para o texto não sumir
    return kids.flatMap((k) => cleanNode(k, parent, depth + 1));
  }
  if (PLAIN_TEXT.has(parent) && n.type !== "text") return kids.flatMap((k) => cleanNode(k, parent, depth + 1));
  const attrs = NODES[n.type](n.attrs && typeof n.attrs === "object" ? n.attrs : {});
  if (!attrs) return [];
  const content = kids.flatMap((k) => cleanNode(k, n.type!, depth + 1));
  const out: J = { type: n.type };
  if (Object.keys(attrs).length) out.attrs = attrs;
  if (content.length) out.content = content;
  return [out];
}

export function sanitizeContent(raw: unknown): J {
  if (!raw || typeof raw !== "object" || (raw as J).type !== "doc") return { ...EMPTY };
  const content = ((raw as J).content || []).flatMap((k) => cleanNode(k, "doc", 1));
  return content.length ? { type: "doc", content } : { ...EMPTY };
}

/** se a estrutura estiver quebrada, o texto vira parágrafos: nunca abre vazio por cima do que a pessoa escreveu */
export function textFallback(doc: J): J {
  const out: J[] = [];
  const walk = (n: J) => {
    if (n.type === "paragraph" || n.type === "heading" || n.type === "codeBlock" || n.type === "detailsSummary") {
      const text = collect(n);
      if (text) out.push({ type: "paragraph", content: [{ type: "text", text }] });
      return;
    }
    (n.content || []).forEach(walk);
  };
  const collect = (n: J): string => (n.text || "") + (n.content || []).map(collect).join("");
  walk(doc);
  return out.length ? { type: "doc", content: out } : { ...EMPTY };
}

/** o texto corrido, sem precisar de um editor montado */
export function plainText(n: J): string {
  if (n.type === "text") return n.text || "";
  if (n.type === "questionRef") return String(n.attrs?.label || "");
  if (n.type === "image") return String(n.attrs?.caption || "");
  const inner = (n.content || []).map(plainText);
  return inner.join(n.content?.some((k) => k.type === "text" || k.type === "questionRef" || k.type === "hardBreak") ? "" : "\n");
}

/** tira do que vai ser guardado as imagens que ainda estão sendo enviadas */
export function withoutUploading(doc: J): J {
  const walk = (n: J): J | null => {
    if (n.type === "image" && n.attrs?.uploadId) return null;
    if (n.type === "image" && n.attrs) {
      const { uploadId: _u, ...attrs } = n.attrs;
      return { ...n, attrs };
    }
    if (!n.content) return n;
    return { ...n, content: n.content.map(walk).filter(Boolean) as J[] };
  };
  const out = walk(doc) as J;
  return out.content?.length ? out : { ...EMPTY };
}
