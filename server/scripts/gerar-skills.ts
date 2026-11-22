/* Espelha os roteiros de src/mcp/prompts.ts em plugin/conduta-med/skills/<nome>/SKILL.md, para as duas coisas não divergirem.
   Uso: npx tsx scripts/gerar-skills.ts   (a partir de server/) */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROMPTS } from "../src/mcp/prompts";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "..", "plugin", "conduta-med", "skills");

for (const p of PROMPTS) {
  const name = p.name.replace(/_/g, "-");
  const args = Object.fromEntries((p.args || []).map((a) => [a.name, `$${a.name}`]));
  const inputs = p.args?.length ? `\n\nSe a pessoa informou: ${p.args.map((a) => `${a.name} (${a.description})`).join("; ")}.\n` : "\n";
  const body = p.text(Object.fromEntries(Object.keys(args).map((k) => [k, undefined])));
  const yaml = (s: string) => JSON.stringify(s);
  const text = `---\nname: ${name}\ndescription: ${yaml(p.description)}\n---\n\n# ${p.title}\n\n${body}${inputs}\nAs ferramentas são as do conector conduta-med. Nada é gravado sem o sim da pessoa: a primeira chamada de escrita só devolve a prévia.\n`;
  mkdirSync(join(OUT, name), { recursive: true });
  writeFileSync(join(OUT, name, "SKILL.md"), text);
}
console.log(`${PROMPTS.length} skills em ${OUT}`);
