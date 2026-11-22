// Gera public/data/amostra.json: as 12 questões do "Experimente 3 questões", as únicas que qualquer pessoa vê sem conta.
// Questões prontas (ok), sem imagem, tabela ou caso compartilhado, com explicação e de tamanho que cabe na tela de entrar,
// uma de cada área em rodízio. A escolha é fixa (mesma entrada, mesma amostra). Rode depois de `gerar_dados.py`.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dados = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const questoes = JSON.parse(readFileSync(join(dados, "questoes.json"), "utf8"));
const provas = JSON.parse(readFileSync(join(dados, "provas.json"), "utf8"));

const AREAS = ["clinica", "go", "pediatria", "cirurgia", "preventiva"];
const TOTAL = 12;
const boa = (q) => q.ok && !q.i && !q.t && !q.k && q.x && q.e.length > 160 && q.e.length < 520 && q.x.length < 700;

// provas mais novas primeiro; cada escolha evita repetir prova e especialidade, para a amostra mostrar a variedade do banco
const ano = Object.fromEntries(provas.map((p) => [p.id, p.ano]));
const porArea = Object.fromEntries(AREAS.map((a) => [a, questoes.filter((q) => q.area === a && boa(q)).sort((x, y) => (ano[y.p] || 0) - (ano[x.p] || 0) || (x.id < y.id ? -1 : 1))]));

const escolhidas = [];
const temas = new Set(), usadas = new Set();
for (let i = 0; escolhidas.length < TOTAL; i++) {
  const area = AREAS[i % AREAS.length], lista = porArea[area];
  if (!lista.length) throw new Error(`sem questão boa em ${area}`);
  const q = lista.find((x) => !temas.has(x.esp) && !usadas.has(x.p)) || lista.find((x) => !usadas.has(x.p)) || lista.find((x) => !temas.has(x.esp)) || lista[0];
  lista.splice(lista.indexOf(q), 1);
  temas.add(q.esp); usadas.add(q.p);
  escolhidas.push(q);
}

const saida = {
  questoes: escolhidas,
  provas: Object.fromEntries(provas.filter((p) => usadas.has(p.id)).map((p) => [p.id, { banca: p.banca, ano: p.ano, nome: p.nome }])),
};
writeFileSync(join(dados, "amostra.json"), JSON.stringify(saida));
console.log(`amostra.json: ${escolhidas.length} questões de ${usadas.size} provas (${escolhidas.map((q) => q.area).join(", ")})`);
