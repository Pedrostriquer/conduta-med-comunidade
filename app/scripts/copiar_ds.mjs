// Copia do design system (../design-system) os tokens, os estilos dos componentes e as fontes.
// Rode `npm run ds` depois de mudar o design system.
import { copyFileSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const ds = join(app, "..", "design-system");

const tokens = readFileSync(join(ds, "build", "tokens.css"), "utf8").replaceAll("../project/fonts/", "/fonts/");
writeFileSync(join(app, "src", "styles", "tokens.css"), "/* copiado de design-system/build/tokens.css — não edite aqui */\n" + tokens);
const css = readFileSync(join(ds, "project", "components", "bundle.css"), "utf8");
writeFileSync(join(app, "src", "styles", "ds.css"), "/* copiado de design-system/project/components/bundle.css — não edite aqui */\n" + css);
mkdirSync(join(app, "public", "fonts"), { recursive: true });
for (const f of readdirSync(join(ds, "project", "fonts"))) copyFileSync(join(ds, "project", "fonts", f), join(app, "public", "fonts", f));
console.log("design system copiado");
