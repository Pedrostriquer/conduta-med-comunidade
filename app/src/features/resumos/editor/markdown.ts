/* Exporta o documento como Markdown. */
import type { J } from "./sanitize";

const TONE_LABEL: Record<string, string> = { conduta: "Conduta", atencao: "Atenção", dica: "Dica", dado: "Dado" };

function inline(nodes: J[] | undefined): string {
  return (nodes || []).map((n) => {
    if (n.type === "hardBreak") return "  \n";
    if (n.type === "questionRef") return String(n.attrs?.label || n.attrs?.qid || "");
    let t = n.text || "";
    const marks = (n.marks || []).map((m) => m.type);
    if (marks.includes("code")) t = "`" + t + "`";
    else t = t.replace(/([\\*_`[\]])/g, "\\$1");
    if (marks.includes("bold")) t = `**${t}**`;
    if (marks.includes("italic")) t = `*${t}*`;
    if (marks.includes("strike")) t = `~~${t}~~`;
    if (marks.includes("underline")) t = `<u>${t}</u>`;
    if (marks.includes("superscript")) t = `<sup>${t}</sup>`;
    if (marks.includes("subscript")) t = `<sub>${t}</sub>`;
    const link = n.marks?.find((m) => m.type === "link");
    if (link) t = `[${t}](${String(link.attrs?.href)})`;
    return t;
  }).join("");
}

const indent = (s: string, by: string) => s.split("\n").map((l, i) => (i === 0 || !l ? l : by + l)).join("\n");

function table(n: J): string {
  const rows = (n.content || []).map((r) => (r.content || []).map((c) => (c.content || []).map(blockInline).join(" ").replace(/\|/g, "\\|").replace(/\n/g, " ")));
  if (!rows.length) return "";
  const cols = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => "| " + Array.from({ length: cols }, (_, i) => r[i] || "").join(" | ") + " |";
  return [line(rows[0]), "| " + Array.from({ length: cols }, () => "---").join(" | ") + " |", ...rows.slice(1).map(line)].join("\n");
}
const blockInline = (n: J) => (n.type === "paragraph" || n.type === "heading" ? inline(n.content) : blocks(n.content));

function block(n: J): string {
  switch (n.type) {
    case "paragraph": return inline(n.content);
    case "heading": return "#".repeat(Number(n.attrs?.level) || 2) + " " + inline(n.content);
    case "bulletList": return (n.content || []).map((i) => "- " + indent(blocks(i.content, "\n"), "  ")).join("\n");
    case "orderedList": { const s = Number(n.attrs?.start) || 1; return (n.content || []).map((i, k) => `${s + k}. ` + indent(blocks(i.content, "\n"), "   ")).join("\n"); }
    case "taskList": return (n.content || []).map((i) => `- [${i.attrs?.checked ? "x" : " "}] ` + indent(blocks(i.content, "\n"), "  ")).join("\n");
    case "blockquote": return blocks(n.content).split("\n").map((l) => "> " + l).join("\n");
    case "horizontalRule": return "---";
    case "codeBlock": return "```" + (n.attrs?.language || "") + "\n" + inline(n.content).replace(/\\([\\*_`[\]])/g, "$1") + "\n```";
    case "table": return table(n);
    case "image": {
      const cap = String(n.attrs?.caption || "");
      const url = new URL(String(n.attrs?.src), location.origin).href;
      return `![${cap.replace(/[[\]]/g, "")}](${url})` + (cap ? `\n\n*${cap}*` : "");
    }
    case "callout": {
      const body = blocks(n.content);
      return `> **${TONE_LABEL[String(n.attrs?.tone)] || "Nota"}**\n>\n` + body.split("\n").map((l) => (l ? "> " + l : ">")).join("\n");
    }
    case "details": {
      const sum = n.content?.find((c) => c.type === "detailsSummary"), body = n.content?.find((c) => c.type === "detailsContent");
      return `<details>\n<summary>${inline(sum?.content)}</summary>\n\n${blocks(body?.content)}\n\n</details>`;
    }
    default: return blocks(n.content);
  }
}
function blocks(nodes: J[] | undefined, sep = "\n\n"): string {
  return (nodes || []).map(block).filter((s) => s !== "").join(sep);
}

export function toMarkdown(title: string, doc: J): string {
  const body = blocks(doc.content);
  return (title.trim() ? `# ${title.trim()}\n\n` : "") + body + "\n";
}

export function downloadMarkdown(title: string, doc: J) {
  const name = (title.trim() || "resumo").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 80) || "resumo";
  const url = URL.createObjectURL(new Blob([toMarkdown(title, doc)], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name + ".md";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
