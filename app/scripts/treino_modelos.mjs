/* Gera os modelos leves do treino (app/public/treino/<id>.bin) a partir dos STL do BodyParts3D guardados em
   app/assets-origem/anatomia/espelho-github/stl/ (fora do git). As peças de cada arquivo estão em treino_pecas.mjs.

   Para cada arquivo: lê os STL, passa para o sistema do app (X = esquerda do paciente, Y = para cima, Z = para a frente),
   solda os vértices, reduz a malha (meshoptimizer) até caber no orçamento de triângulos do arquivo, e grava posições em
   inteiros de 16 bits e índices de 16 bits.
   Formato: uint32 (tamanho do cabeçalho JSON) + JSON + espaços até múltiplo de 4 + Int16 posições + Uint16 índices.

   Uso:  node scripts/treino_modelos.mjs --lista        lista os STL que faltam baixar (um FMA por linha)
         node scripts/treino_modelos.mjs [id ...]       gera todos os arquivos, ou só os citados */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MeshoptSimplifier } from "meshoptimizer";
import { MODELOS } from "./treino_pecas.mjs";
// o catálogo do app é a fonte dos níveis "completos": cada item diz qual malha do BodyParts3D usa (o Node 24 lê .ts direto)
import { CONJUNTOS } from "../src/features/treino/catalogo.ts";

/** níveis gerados a partir do catálogo: os ossos de contexto de um modelo + as malhas dos itens do nível */
for (const c of CONJUNTOS) if (c.contexto) {
  if (!MODELOS[c.contexto]) throw new Error(c.id + ": contexto desconhecido " + c.contexto);
  MODELOS[c.id] = { tOsso: MODELOS[c.contexto].tOsso, ossos: MODELOS[c.contexto].ossos, musculos: Object.fromEntries(c.itens.map((i) => [i.id, i.en])) };
}

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIG = join(APP, "assets-origem/anatomia/espelho-github");
const OUT = join(APP, "public/treino");
/** ~9 bytes por triângulo: 52 mil triângulos dão perto de 470 KB */
const ORCAMENTO = 52000, T_OSSO = 1500, T_MUSCULO = 2600, T_ORGAO = 1700;

const nomes = new Map(readFileSync(join(ORIG, "parts_list_e.txt"), "utf8").split("\n").slice(1).filter(Boolean).map((l) => { const [id, en] = l.split("\t"); return [en, id]; }));
/** os STL que o espelho tem (lista de arquivos do repositório, guardada ao lado dos originais) */
const noEspelho = new Set(JSON.parse(readFileSync(join(ORIG, "../_tree.json"), "utf8")).tree.map((e) => e.path).filter((p) => p.includes("/stl/") && p.endsWith(".stl")).map((p) => p.split("/").pop().slice(0, -4)));
/** nome → FMA: primeiro o lado direito, depois o nome como veio; só vale o que tem malha */
function fma(nome) {
  const ultimo = nome.lastIndexOf(" of ");
  for (const c of ["right " + nome, nome.replace(/ of /, " of right "), ultimo > 0 ? nome.slice(0, ultimo) + " of right " + nome.slice(ultimo + 4) : nome, nome]) { const id = nomes.get(c); if (id && noEspelho.has(id)) return id; }
  throw new Error("peça sem malha no BodyParts3D: " + nome);
}
const stl = (id) => join(ORIG, "stl", id + ".stl");
const normal = (spec) => (typeof spec === "string" || Array.isArray(spec) ? { n: spec } : spec);
function pecasDe(m) {
  const out = [];
  // o: osso · m: músculo · g: órgão · p: pele (só contorno)
  for (const [tipo, grupo] of [["o", m.ossos || {}], ["m", m.musculos || {}], ["g", m.orgaos || {}], ["p", m.pele || {}]])
    for (const [id, spec] of Object.entries(grupo)) { const s = normal(spec); out.push({ id, tipo, fmas: [s.n].flat().map(fma), corta: s.corta, t: s.t, espelha: s.espelha }); }
  return out;
}

const args = process.argv.slice(2);
if (args[0] === "--lista") {
  const falta = new Set();
  for (const m of Object.values(MODELOS)) for (const p of pecasDe(m)) for (const f of p.fmas) if (!existsSync(stl(f))) falta.add(f);
  console.log([...falta].join("\n"));
  process.exit(0);
}

function lerStl(file) {
  const b = readFileSync(file), n = b.readUInt32LE(80);
  if (b.length !== 84 + 50 * n) throw new Error(file + ": STL binário inesperado");
  const tri = new Float32Array(n * 9);
  // BodyParts3D: x cresce para a esquerda do paciente, y para trás, z para cima
  for (let t = 0; t < n; t++) for (let c = 0; c < 3; c++) {
    const o = 84 + t * 50 + 12 + c * 12;
    tri[t * 9 + c * 3] = b.readFloatLE(o); tri[t * 9 + c * 3 + 1] = b.readFloatLE(o + 8); tri[t * 9 + c * 3 + 2] = -b.readFloatLE(o + 4);
  }
  return tri;
}
const centro = (tri) => { const c = [0, 0, 0]; for (let i = 0; i < tri.length; i++) c[i % 3] += tri[i]; return c.map((v) => v / (tri.length / 3)); };
const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** a mão sai com os dedos para cima e a palma para a câmera */
function baseMao(pecas) {
  const c = (id) => centro(pecas.find((p) => p.id === id).tri);
  const carpais = ["escafoide", "semilunar", "piramidal", "pisiforme", "trapezio", "trapezoide", "capitato", "hamato"].map(c);
  const C = carpais.reduce((a, b) => a.map((v, i) => v + b[i] / carpais.length), [0, 0, 0]);
  const Y = norm(sub(c(pecas.some((p) => p.id === "falanges-m") ? "falanges-m" : "fm-3"), C)); // do carpo para o meio dos quatro dedos longos
  const pal = sub(c("pisiforme"), c("piramidal")), Z = norm(sub(pal, Y.map((v) => v * dot(pal, Y)))), X = cross(Y, Z);
  for (const p of pecas) for (let i = 0; i < p.tri.length; i += 3) { const v = sub([p.tri[i], p.tri[i + 1], p.tri[i + 2]], C); p.tri[i] = dot(v, X); p.tri[i + 1] = dot(v, Y); p.tri[i + 2] = dot(v, Z); }
}

function soldar(tri) {
  const map = new Map(), pos = [], idx = new Uint32Array(tri.length / 3);
  for (let v = 0; v < tri.length / 3; v++) {
    const k = tri[v * 3] + "," + tri[v * 3 + 1] + "," + tri[v * 3 + 2];
    let at = map.get(k);
    if (at === undefined) { at = pos.length / 3; map.set(k, at); pos.push(tri[v * 3], tri[v * 3 + 1], tri[v * 3 + 2]); }
    idx[v] = at;
  }
  return { pos: new Float32Array(pos), idx };
}

async function gerar(id, m) {
  const pecas = pecasDe(m);
  for (const p of pecas) {
    const partes = p.fmas.map((f) => lerStl(stl(f)));
    p.tri = new Float32Array(partes.reduce((a, t) => a + t.length, 0));
    let o = 0; for (const t of partes) { p.tri.set(t, o); o += t.length; }
  }
  // o lado esquerdo como espelho do direito, em torno do plano do meio do corpo (o x médio da coluna)
  if (pecas.some((p) => p.espelha)) {
    const x0 = centro(pecas.find((p) => p.id === "coluna").tri)[0];
    for (const p of pecas.filter((p) => p.espelha)) {
      const e = new Float32Array(p.tri.length * 2); e.set(p.tri);
      for (let t = 0; t < p.tri.length; t += 9) for (const [de, para] of [[0, 0], [2, 1], [1, 2]]) { // troca dois vértices para a face continuar virada para fora
        e[p.tri.length + t + para * 3] = 2 * x0 - p.tri[t + de * 3]; e[p.tri.length + t + para * 3 + 1] = p.tri[t + de * 3 + 1]; e[p.tri.length + t + para * 3 + 2] = p.tri[t + de * 3 + 2];
      }
      p.tri = e;
    }
  }
  if (m.base === "mao") baseMao(pecas);
  // contexto cortado: fica só o que está a até N mm da caixa das outras peças
  const caixa = (lista) => { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const p of lista) for (let i = 0; i < p.tri.length; i++) { lo[i % 3] = Math.min(lo[i % 3], p.tri[i]); hi[i % 3] = Math.max(hi[i % 3], p.tri[i]); } return { lo, hi }; };
  const inteiras = caixa(pecas.filter((p) => !p.corta));
  for (const p of pecas.filter((p) => p.corta)) {
    const keep = [];
    for (let t = 0; t < p.tri.length; t += 9) {
      let dentro = true;
      for (let a = 0; a < 3 && dentro; a++) { const v = (p.tri[t + a] + p.tri[t + 3 + a] + p.tri[t + 6 + a]) / 3; dentro = v > inteiras.lo[a] - p.corta && v < inteiras.hi[a] + p.corta; }
      if (dentro) for (let k = 0; k < 9; k++) keep.push(p.tri[t + k]);
    }
    p.tri = Float32Array.from(keep);
  }
  // orçamento: cada peça tem um teto; se a soma passar do orçamento do arquivo, todas encolhem na mesma proporção
  for (const p of pecas) { p.orig = p.tri.length / 9; p.alvo = Math.min(p.orig, p.t ?? (p.tipo === "m" ? m.tMusculo ?? T_MUSCULO : p.tipo === "g" ? m.tOrgao ?? T_ORGAO : m.tOsso ?? T_OSSO)); }
  const soma = pecas.reduce((a, p) => a + p.alvo, 0), fator = Math.min(1, ORCAMENTO / soma);
  const { lo, hi } = caixa(pecas), escala = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 65000;

  const head = { fonte: "BodyParts3D 3.0 (DBCLS), CC BY-SA 2.1 JP", unidade: "mm", eixos: "X esquerda do paciente, Y para cima, Z para a frente", escala, origem: lo, pecas: [] };
  const vAll = [], iAll = [];
  let voff = 0, ioff = 0, triOrig = 0;
  for (const p of pecas) {
    let { pos, idx } = soldar(p.tri);
    const alvo = Math.max(60, Math.round(p.alvo * fator));
    if (idx.length / 3 > alvo * 1.05) {
      let [r] = MeshoptSimplifier.simplify(idx, pos, 3, alvo * 3, 1, []);
      if (r.length / 3 > alvo * 1.6) [r] = MeshoptSimplifier.simplifySloppy(idx, pos, 3, alvo * 3, 1); // malha muito quebrada: reduz por agrupamento
      idx = r;
    }
    const map = new Map(), verts = [], out = [];
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [];
      for (let c = 0; c < 3; c++) {
        const s = idx[t + c] * 3, q = [0, 1, 2].map((a) => Math.round((pos[s + a] - lo[a]) / escala) - 32500), key = q.join(",");
        let at = map.get(key);
        if (at === undefined) { at = verts.length / 3; map.set(key, at); verts.push(...q); }
        tri.push(at);
      }
      if (tri[0] !== tri[1] && tri[1] !== tri[2] && tri[0] !== tri[2]) out.push(...tri);
    }
    if (verts.length / 3 > 65535) throw new Error(p.id + ": vértices demais para índice de 16 bits");
    head.pecas.push({ id: p.id, tipo: p.tipo, fma: p.fmas, v: [voff, verts.length / 3], i: [ioff, out.length] });
    for (const x of verts) vAll.push(x); for (const x of out) iAll.push(x);
    voff += verts.length / 3; ioff += out.length; triOrig += p.orig;
  }
  let hj = JSON.stringify(head);
  hj += " ".repeat((4 - ((4 + Buffer.byteLength(hj)) % 4)) % 4);
  const len = Buffer.alloc(4); len.writeUInt32LE(Buffer.byteLength(hj));
  mkdirSync(OUT, { recursive: true });
  const buf = Buffer.concat([len, Buffer.from(hj), Buffer.from(Int16Array.from(vAll).buffer), Buffer.from(Uint16Array.from(iAll).buffer)]);
  writeFileSync(join(OUT, id + ".bin"), buf);
  console.log(`${(id + ".bin").padEnd(22)} ${String(Math.round(buf.length / 1024)).padStart(4)} KB · ${String(pecas.length).padStart(3)} peças · ${String(ioff / 3).padStart(6)} triângulos (de ${triOrig}) · caixa ${hi.map((h, a) => (h - lo[a]).toFixed(0)).join("×")} mm`);
}

await MeshoptSimplifier.ready;
for (const [id, m] of Object.entries(MODELOS)) if (!args.length || args.includes(id)) await gerar(id, m);
