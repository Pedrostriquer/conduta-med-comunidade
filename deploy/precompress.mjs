// Gera .br e .gz ao lado de cada arquivo de texto: o Caddy serve pronto em vez de comprimir a cada acesso.
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OK = /\.(js|css|html|json|svg|wasm|map|txt)$/;
function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f), st = statSync(p);
    if (st.isDirectory()) { if (f !== "img") walk(p); continue; }
    if (!OK.test(f) || st.size < 1024) continue;
    const b = readFileSync(p);
    writeFileSync(p + ".br", brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 10, [constants.BROTLI_PARAM_LGWIN]: 24 } }));
    writeFileSync(p + ".gz", gzipSync(b, { level: 9 }));
  }
}
walk(process.argv[2]);
