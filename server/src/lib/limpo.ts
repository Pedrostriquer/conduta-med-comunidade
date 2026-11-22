/* Cópia de app/src/data/limpo.ts (mude os dois juntos). O que os resumos e as resoluções mostram ao estudante.
   Os arquivos vêm do acervo com anotações de trabalho no meio do texto (selo de situação, referência a arquivos de conferência,
   códigos de questão, "acréscimo da auditoria"). Nada disso vai para a tela. Aqui não se reescreve nada: só se deixa de mostrar
   o rótulo, o parêntese ou a frase que é anotação. O dado no arquivo continua igual. */

/** código de questão do acervo (ex.: "sus-sp-2026#073") */
const ID = /[a-z][a-z0-9-]*-\d{4}(?:-\d)?#\w+/;

/** parênteses que são só anotação: arquivo de conferência, selo de situação, código de questão */
const PAREN = new RegExp("\\s*\\((?:[^()]*?)(?:conferencia\\.md|mudancas\\.md|n[ãa]o conferid[oa]s? por m[ée]dico|leitura de leigo|acrescentad[oa]s? (?:na|pela) auditoria|acr[ée]scimos? d[ae] auditoria|\\b(?:d?o|no|pelo) acervo\\b|" + ID.source + ")[^()]*\\)", "gi");
/** rótulo solto: "**Acréscimo da auditoria (14/11/2026).** " ou "Acréscimo da auditoria." */
const LABEL = /(?:\*\*)?Acr[ée]scimos? d[ae] auditoria(?:\s*\([^)]*\))?[.:]?(?:\*\*)?[.:]?\s*/gi;

/** frase que é anotação de trabalho: sai inteira */
const NOTE = new RegExp([
  "rascunho", "n[ãa]o conferid[oa]s? por m[ée]dico", "revis[ãa]o m[ée]dica", "conferencia\\.md", "mudancas\\.md", "ver a confer[êe]ncia",
  "\\bfichas? P\\d+", "\\(P\\d\\d[,)]", "\\b(?:no|do) mapa(?! de | mental| da rede)\\b", "mapa das quest", "pasta de [A-Z][a-zà-ú]+", "\\b[Nn]ão achei\\b", "\\b[Pp]rocurei\\b",
  "nesta auditoria", "depois da auditoria", "para o m[ée]dico conferir", "`[a-z_]+`", "falta no resumo", "obs_confer",
  "leitura de leigo", "leitura da figura é de leigo", "an[áa]lise anterior do acervo",
].join("|"), "i");

const isNote = (s: string) => NOTE.test(s) || ID.test(s);

/** divide em frases sem quebrar abreviações comuns nem números ("p. 120", "art. 16", "1.200") */
function sentences(p: string): string[] {
  const out: string[] = [];
  let from = 0;
  const re = /[.!?](?:\*\*|["”')\]])*\s+(?=(?:\*\*)?["“'(]?[A-ZÀ-Ý])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p))) {
    const before = p.slice(from, m.index + 1);
    // abreviação antes do ponto: não é fim de frase
    if (/(?:\b(?:p|pp|art|arts|ed|vol|n|nº|cap|fig|tab|dr|dra|prof|profa|ex|etc|cf|vs|inc|sr|sra)|\b[A-Z])\.$/i.test(before) && p[m.index] === ".") continue;
    out.push(p.slice(from, m.index + m[0].length));
    from = m.index + m[0].length;
  }
  if (from < p.length) out.push(p.slice(from));
  return out;
}

/** tira o `**` que ficou sem par depois de cortar uma frase */
function balance(s: string) {
  const n = (s.match(/\*\*/g) || []).length;
  if (n % 2 === 0) return s;
  const i = s.lastIndexOf("**");
  return s.slice(0, i) + s.slice(i + 2);
}

function cleanParagraph(p: string, bloco: boolean): string {
  let s = p.replace(PAREN, "").replace(LABEL, "");
  if (!isNote(s)) return s.trim();
  // lista: cada item é julgado sozinho
  if (/^\s*(?:[-*•]|\d+[.)])\s/m.test(s) && s.includes("\n")) {
    return s.split("\n").map((l) => (isNote(l) ? sentences(l).filter((x) => !isNote(x)).join("").trimEnd() : l)).filter((l) => l.trim() && !/^\s*(?:[-*•]|\d+[.)])\s*$/.test(l)).join("\n");
  }
  const kept = sentences(s).filter((x) => !isNote(x));
  s = balance(kept.join("").trim());
  // sobrou só o título em negrito do parágrafo ("**Como a prova cobra.**"): não tem o que mostrar
  if (bloco && (/^\*\*[^*]+\*\*[.:]?$/.test(s) || /^\*[^*]+\*$/.test(s))) return "";
  return s;
}

/** texto de um campo, sem as anotações de trabalho. Devolve "" se não sobrar nada.
    `bloco`: texto de vários parágrafos (o essencial, "em uma tela"), em que um parágrafo reduzido ao próprio título some. */
export function limpa(t: string | null | undefined, bloco = false): string {
  if (!t) return "";
  return String(t).replace(/\r/g, "").split(/\n[ \t]*\n/).map((p) => cleanParagraph(p, bloco)).filter(Boolean).join("\n\n");
}

/** o campo inteiro é anotação? (para esconder fonte, linha de divergência ou observação) */
export const interno = (t: string | null | undefined) => !!t && isNote(String(t));
