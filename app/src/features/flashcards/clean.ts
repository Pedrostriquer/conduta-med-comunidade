/* HTML de outra pessoa nunca é confiável: passa por aqui antes de ser guardado, ao assinar e ao receber pela sincronização. */
const DROP = /^(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select|option|audio|video|source|svg|math|template|noscript|title|head|frame|frameset|applet|portal)$/i;
const KEEP = new Set("b i u s em strong br p div span ul ol li img table thead tbody tfoot tr td th sub sup small hr h1 h2 h3 h4 h5 h6 blockquote code pre mark center caption col colgroup".split(" "));

/** só texto e formatação simples: nada de script, link, estilo ou classe que não seja das lacunas */
export function cleanCardHtml(html: string) {
  if (!/[<&]/.test(html)) return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return "";
  for (const el of [...root.querySelectorAll("*")].reverse()) {
    const tag = el.tagName.toLowerCase();
    if (DROP.test(tag)) { el.remove(); continue; }
    if (!KEEP.has(tag)) { el.replaceWith(...el.childNodes); continue; }
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n === "class") {
        const ok = a.value.split(/\s+/).filter((c) => /^cloze[a-z-]*$/.test(c));
        if (ok.length) el.setAttribute("class", ok.join(" ")); else el.removeAttribute("class");
      } else if (n === "src" && tag === "img") {
        if (/^\s*(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(a.value) && !/^\s*data:image\/(?:png|jpe?g|gif|webp);/i.test(a.value)) el.remove();
      } else if (!((n === "alt" && tag === "img") || ((n === "colspan" || n === "rowspan") && (tag === "td" || tag === "th")))) el.removeAttribute(a.name);
    }
  }
  return root.innerHTML;
}
