/* Do card do Anki para a tela: limpa o HTML, acha as lacunas e separa a explicação e a referência.
   No formato de pergunta e resposta ("qa") a pergunta traz <span class="cloze-question">[...]</span> e a resposta repete a frase
   com <span class="cloze-answer">; o que vem depois da frase é a explicação. */
import { isQa } from "./db";
import type { CardRec } from "./db";

export type Rendered = { front: string; slots: { answer: string; choices: string[] | null }[]; answer: string; extra: string; ref: string };

const BAD = /^(script|style|iframe|object|embed|link|meta|form|input|button|audio|video)$/i;

function clean(root: ParentNode) {
  root.querySelectorAll("*").forEach((el) => {
    if (BAD.test(el.tagName)) { el.remove(); return; }
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n.startsWith("on") || n === "style" || (n === "href" && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
    }
  });
}
function parse(html: string) {
  const d = new DOMParser().parseFromString(`<div>${html || ""}</div>`, "text/html");
  const root = d.body.firstElementChild as HTMLElement;
  clean(root);
  return root;
}
const meaningful = (n: ChildNode) => n.nodeType === 1 || (n.nodeType === 3 && (n.textContent || "").trim() !== "");
const slot = (i: number) => `<span data-slot="${i}"></span>`;
const choicesOf = (t: string) => { const m = t.trim().match(/^\[(.+)\]$/); if (!m || /^\.\.\.|^…$/.test(m[1].trim())) return null; const xs = m[1].split(/\s+\/\s+/); return xs.length > 1 ? xs : null; };

export function renderCard(c: CardRec): Rendered {
  const f = c.fields;
  if (isQa(c.kind)) {
    const q = parse(f[0]), a = parse(f[1]);
    const slots: Rendered["slots"] = [];
    const answers = [...a.querySelectorAll(".cloze-answer")].map((x) => x.innerHTML);
    q.querySelectorAll(".cloze-question").forEach((el, i) => {
      slots.push({ answer: answers[i] ?? answers[answers.length - 1] ?? "", choices: choicesOf(el.textContent || "") });
      el.outerHTML = slot(i);
    });
    // a explicação é o que sobra da resposta depois de tantos nós quantos tem a pergunta
    const k = [...parse(f[0]).childNodes].filter(meaningful).length;
    let seen = 0;
    for (const n of [...a.childNodes]) { if (seen < k) { if (meaningful(n)) seen++; n.remove(); } }
    a.querySelectorAll("p").forEach((p) => { if (!p.textContent?.trim() && !p.querySelector("img")) p.remove(); });
    return { front: q.innerHTML, slots, answer: "", extra: a.innerHTML.trim(), ref: parse(f[2] || "").innerHTML };
  }
  if (c.kind === "cloze") {
    const n = c.ord + 1, slots: Rendered["slots"] = [];
    const html = (f[0] || "").replace(/\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g, (_m, num, ans, hint) => {
      if (Number(num) !== n) return ans;
      slots.push({ answer: ans, choices: hint ? [hint] : null });
      return slot(slots.length - 1);
    });
    return { front: parse(html).innerHTML, slots, answer: "", extra: parse(f[1] || "").innerHTML, ref: "" };
  }
  const [front, back] = c.ord === 1 ? [f[1], f[0]] : [f[0], f[1]];
  return { front: parse(front).innerHTML, slots: [], answer: parse(back).innerHTML, extra: "", ref: "" };
}

/** troca src das imagens pelos arquivos guardados no IndexedDB */
export async function hydrateImages(el: HTMLElement, deck: string, get: (k: string) => Promise<Blob | undefined>, urls: Map<string, string>) {
  const imgs = [...el.querySelectorAll("img")];
  await Promise.all(imgs.map(async (img) => {
    const src = decodeURIComponent(img.getAttribute("src") || "");
    if (!src || /^(blob:|data:|https?:)/.test(src)) return;
    let u = urls.get(src);
    if (!u) { const b = await get(deck + "/" + src); if (!b) { img.remove(); return; } u = URL.createObjectURL(b); urls.set(src, u); }
    img.src = u; img.loading = "lazy"; img.alt = img.alt || "";
  }));
}

/** texto corrido do card (sem HTML), para a busca e a coluna do navegador */
const plainCache = new Map<string, string>();
export function plainText(c: CardRec) {
  const k = c.id + ":" + c.fields.join("").length;
  let t = plainCache.get(k);
  if (t == null) {
    const src = c.kind === "cloze" ? (c.fields[0] || "").replace(/\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g, "$1") : c.kind === "basic" ? c.fields[c.ord === 1 ? 1 : 0] || "" : c.fields[0] || "";
    t = src.replace(/<br\s*\/?>|<\/(p|div|li)>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
    plainCache.set(k, t);
  }
  return t;
}
/** busca sem acento e sem caixa */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
