/* O que o corpo 3D precisa saber fora do jogo: que zona do esqueleto leva a que região do treino, que arquivos
   detalham cada região no Explorar, e o nome (e uma linha) de cada peça. Os nomes vêm do catálogo; os órgãos, daqui.
   RASCUNHO: as linhas dos órgãos também não foram conferidas por médico. */
import { CONJUNTOS } from "./catalogo";
import type { Modo } from "./catalogo";

/** zona do corpo leve (peças de corpo.bin) → região do treino, em cada modo */
export const ZONA_GRUPO: Record<Exclude<Modo, "ecg">, Record<string, string>> = {
  ossos: { cabeca: "ossos-cranio", coluna: "ossos-coluna", torax: "ossos-torax", ombro: "ossos-ms", antebraco: "ossos-ms", mao: "ossos-ms", quadril: "ossos-mi", coxa: "ossos-mi", perna: "ossos-mi", pe: "ossos-mi" },
  musculos: { cabeca: "musculos-cabeca", coluna: "musculos-dorso", torax: "musculos-tronco", ombro: "musculos-ombro", antebraco: "musculos-antebraco", mao: "musculos-antebraco", quadril: "musculos-quadril", coxa: "musculos-coxa", perna: "musculos-perna", pe: "musculos-perna" },
};
const ZONA_NOME: Record<string, string> = { cabeca: "Cabeça", coluna: "Coluna vertebral", torax: "Tórax", ombro: "Ombro e braço", antebraco: "Antebraço", mao: "Mão", quadril: "Quadril", coxa: "Coxa", perna: "Perna", pe: "Pé", pele: "Pele" };

export type RegiaoExplorar = { id: string; titulo: string; zonas: string[]; ossos: string[]; musculos: string[] };
/** no Explorar, as peças detalhadas de uma região só são baixadas quando a pessoa a escolhe */
export const REGIOES_EXPLORAR: RegiaoExplorar[] = [
  { id: "cabeca", titulo: "Cabeça e pescoço", zonas: ["cabeca"], ossos: ["cranio"], musculos: ["m-cabeca", "musculos-cabeca-3", "musculos-cabeca-4", "musculos-cabeca-5"] },
  { id: "tronco", titulo: "Tronco", zonas: ["torax", "coluna"], ossos: ["torax", "coluna"], musculos: ["m-tronco", "musculos-tronco-2", "m-dorso", "musculos-dorso-2"] },
  { id: "ms", titulo: "Membro superior", zonas: ["ombro", "antebraco", "mao"], ossos: ["membro-superior"], musculos: ["m-ombro", "m-antebraco", "musculos-antebraco-3", "musculos-antebraco-4"] },
  { id: "mi", titulo: "Membro inferior", zonas: ["quadril", "coxa", "perna", "pe"], ossos: ["membro-inferior", "pe-ossos"], musculos: ["m-quadril", "musculos-quadril-2", "m-coxa", "musculos-coxa-2", "m-perna", "musculos-perna-2", "musculos-perna-3", "musculos-perna-4"] },
];
/** peças que um arquivo traz e outro detalha melhor */
export const PULA: Record<string, string[]> = { "membro-inferior": ["pe"] };

const ORGAOS: Record<string, [string, string]> = {
  coracao: ["coração", "bomba muscular de quatro câmaras, no mediastino médio"],
  "pulmao-d-superior": ["lobo superior do pulmão direito", "o pulmão direito tem três lobos"],
  "pulmao-d-medio": ["lobo médio do pulmão direito", "só o pulmão direito tem lobo médio"],
  "pulmao-d-inferior": ["lobo inferior do pulmão direito", "separado dos outros pela fissura oblíqua"],
  "pulmao-e-superior": ["lobo superior do pulmão esquerdo", "tem a língula"],
  "pulmao-e-inferior": ["lobo inferior do pulmão esquerdo", "o pulmão esquerdo tem dois lobos"],
  traqueia: ["traqueia", "tubo de anéis de cartilagem, da laringe à carina"],
  bronquios: ["brônquios", "ramificam-se da traqueia até os pulmões"],
  esofago: ["esôfago", "leva o alimento da faringe ao estômago, atrás da traqueia"],
  figado: ["fígado", "a maior glândula do corpo, no hipocôndrio direito"],
  "vesicula-biliar": ["vesícula biliar", "guarda e concentra a bile, sob o fígado"],
  estomago: ["estômago", "entre o esôfago e o duodeno"],
  baco: ["baço", "órgão linfoide no hipocôndrio esquerdo"],
  pancreas: ["pâncreas", "glândula mista, atrás do estômago"],
  duodeno: ["duodeno", "primeira parte do intestino delgado, em C em torno da cabeça do pâncreas"],
  jejuno: ["jejuno", "segunda parte do intestino delgado"],
  ileo: ["íleo", "parte final do intestino delgado, termina no ceco"],
  colon: ["colo", "intestino grosso: ascendente, transverso, descendente e sigmoide"],
  apendice: ["apêndice vermiforme", "preso ao ceco"],
  reto: ["reto", "parte final do intestino grosso"],
  "rim-d": ["rim direito", "retroperitoneal; um pouco mais baixo que o esquerdo"],
  "rim-e": ["rim esquerdo", "retroperitoneal"],
  "suprarrenal-d": ["glândula suprarrenal direita", "sobre o polo superior do rim"],
  "ureter-d": ["ureter direito", "leva a urina do rim à bexiga"],
  bexiga: ["bexiga urinária", "reservatório de urina, na pelve"],
  "aorta-ascendente": ["aorta ascendente", "sai do ventrículo esquerdo"],
  "arco-aorta": ["arco da aorta", "dá o tronco braquiocefálico, a carótida comum esquerda e a subclávia esquerda"],
  "aorta-descendente": ["aorta descendente", "torácica e abdominal"],
  "veia-cava-superior": ["veia cava superior", "traz o sangue da cabeça e dos membros superiores ao átrio direito"],
  "veia-cava-inferior": ["veia cava inferior", "traz o sangue da metade de baixo do corpo ao átrio direito"],
  "arteria-pulmonar": ["artéria pulmonar", "leva o sangue venoso do ventrículo direito aos pulmões"],
  timo: ["timo", "órgão linfoide no mediastino anterior; regride no adulto"],
  "cartilagem-tireoidea": ["cartilagem tireóidea", "a maior cartilagem da laringe"],
  cerebelo: ["cerebelo", "coordenação e equilíbrio, na fossa posterior"],
  ponte: ["ponte", "parte do tronco encefálico, entre o mesencéfalo e o bulbo"],
  bulbo: ["bulbo", "parte de baixo do tronco encefálico, continua na medula espinal"],
  mesencefalo: ["mesencéfalo", "parte de cima do tronco encefálico"],
  "olho-d": ["bulbo do olho direito", "dentro da órbita"],
  diafragma: ["diafragma", "principal músculo da inspiração; separa o tórax do abdome"],
};

export type Ficha = { nome: string; linha: string };
const porArquivo = new Map<string, Ficha>(), porPeca = new Map<string, Ficha>();
for (const c of CONJUNTOS) if (c.modelo) for (const it of c.itens) {
  const pecas = it.pecas ?? [it.id];
  if (pecas.length !== 1) continue;
  const f = { nome: it.nome, linha: it.apoio };
  porArquivo.set(c.modelo + "/" + pecas[0], f);
  if (!porPeca.has(pecas[0])) porPeca.set(pecas[0], f);
}
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** o nome e a linha de uma peça de qualquer arquivo */
export function ficha(arquivo: string, peca: string): Ficha {
  if (arquivo === "corpo") return { nome: ZONA_NOME[peca] ?? peca, linha: "clique para ver as peças desta região" };
  if (arquivo === "orgaos") { const o = ORGAOS[peca]; return o ? { nome: maiuscula(o[0]), linha: o[1] } : { nome: peca, linha: "" }; }
  const achada = porArquivo.get(arquivo + "/" + peca) ?? porPeca.get(peca);
  if (achada) return { nome: maiuscula(achada.nome), linha: achada.linha };
  const esq = peca.match(/^(.*)-e(\d*)$/);
  if (esq) { const base = porPeca.get(esq[1] + esq[2]); if (base) return { nome: maiuscula(base.nome) + " (lado esquerdo)", linha: base.linha }; }
  return { nome: maiuscula(peca.replace(/-/g, " ")), linha: "" };
}

export type Achado = { id: string; arquivo: string; peca: string; nome: string; linha: string; camada: "ossos" | "musculos" | "orgaos"; regiao: string | null };
/** tudo o que a busca do Explorar encontra, mesmo o que ainda não foi baixado */
export const INDICE: Achado[] = (() => {
  const out: Achado[] = [], visto = new Set<string>();
  for (const r of REGIOES_EXPLORAR) for (const [camada, arquivos] of [["ossos", r.ossos], ["musculos", r.musculos]] as const) for (const arquivo of arquivos) {
    for (const c of CONJUNTOS) if (c.modelo === arquivo) for (const it of c.itens) {
      const pecas = it.pecas ?? [it.id];
      if (pecas.length !== 1 || visto.has(camada + pecas[0] + r.id)) continue;
      visto.add(camada + pecas[0] + r.id);
      out.push({ id: arquivo + "/" + pecas[0], arquivo, peca: pecas[0], nome: maiuscula(it.nome), linha: it.apoio, camada, regiao: r.id });
    }
  }
  for (const [peca, [nome, linha]] of Object.entries(ORGAOS)) out.push({ id: "orgaos/" + peca, arquivo: "orgaos", peca, nome: maiuscula(nome), linha, camada: "orgaos", regiao: null });
  return out;
})();
