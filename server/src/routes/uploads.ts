/* Imagens dos resumos, foto do perfil e mídia dos baralhos. O arquivo fica no disco com nome pelo hash (cache imutável), uma vez só:
   quem chega depois com o mesmo arquivo só referencia. A cota é por pessoa e conta só o que ela trouxe primeiro. */
import { createHash, randomBytes } from "node:crypto";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import sharp from "sharp";
import { one, q, tx } from "../db";
import type { Db } from "../db";
import { env } from "../env";
import { HttpError, invalid, notFound, requireUser } from "../http";
import type { AppEnv } from "../http";
import { sniff } from "../lib/sniff";

const MAX_FILE = 10 * 1024 * 1024, QUOTA = 4 * 1024 ** 3;
const IMAGE_TYPES = new Set(["jpg", "png", "webp", "gif", "heic"]);
const TOO_BIG = "O arquivo passou de 10 MB.";
const overQuota = () => new HttpError("limite", "Você chegou ao limite de 4 GB de arquivos.");

const sha256hex = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function usedBytes(userId: string, db?: Db) {
  return (await one<{ n: number }>("SELECT COALESCE(sum(bytes), 0)::bigint AS n FROM uploads WHERE user_id = $1", [userId], db))?.n ?? 0;
}

/** temporário e rename: quem lê o arquivo nunca vê a metade dele */
async function writeAtomic(path: string, dir: string, data: Buffer) {
  if (await access(path).then(() => true, () => false)) return;
  await mkdir(dir, { recursive: true });
  const tmp = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, data);
    await rename(tmp, path);
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw e;
  }
}

/** registra e grava sob a trava da pessoa, para a cota não estourar com envios simultâneos */
async function store(userId: string, kind: "doc" | "avatar" | "fc", hash: string, ext: string, data: Buffer, width: number | null, height: number | null) {
  const dir = join(env.uploadsDir, kind);
  await tx(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 2))", [userId]);
    const known = await one("SELECT 1 FROM uploads WHERE user_id = $1 AND hash = $2", [userId, hash], db);
    // o arquivo já está aqui por outra pessoa: não ocupa disco nem cota
    const shared = known ? null : await one("SELECT 1 FROM uploads WHERE hash = $1 AND kind = $2 LIMIT 1", [hash, kind], db);
    const bytes = shared ? 0 : data.length;
    if (!known && !shared && (await usedBytes(userId, db)) + data.length > QUOTA) throw overQuota();
    await writeAtomic(join(dir, `${hash}.${ext}`), dir, data);
    if (!known) await db.query("INSERT INTO uploads (hash, user_id, kind, ext, bytes, width, height) VALUES ($1, $2, $3, $4, $5, $6, $7)", [hash, userId, kind, ext, bytes, width, height]);
  });
  return `/uploads/${kind}/${hash}.${ext}`;
}

/** o sharp pré-compilado não decodifica HEVC: HEIC passa por um decodificador em WebAssembly, carregado só quando chega um */
async function openHeic(input: Buffer) {
  const { default: decode } = await import("heic-decode");
  const { width, height, data } = await decode({ buffer: input });
  return sharp(Buffer.from(data), { raw: { width, height, channels: 4 } });
}

/** gira pelo EXIF, descarta os metadados (é o padrão do sharp), limita o tamanho e grava em webp */
async function toWebp(input: Buffer, ext: string) {
  const animated = ext === "gif";
  const img = ext === "heic" ? await openHeic(input) : sharp(input, { animated });
  return (animated ? img : img.rotate())
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
}

const r = new Hono<AppEnv>();

r.post("/uploads/image", bodyLimit({ maxSize: MAX_FILE + 64 * 1024, onError: () => { throw invalid(TOO_BIG); } }), async (c) => {
  const me = requireUser(c);
  const kind = c.req.query("kind") || "doc";
  if (kind !== "doc" && kind !== "avatar") throw invalid("Tipo de envio desconhecido.");
  const form = await c.req.parseBody().catch(() => { throw invalid("Não entendemos o arquivo enviado."); });
  const file = form.file;
  if (!(file instanceof File)) throw invalid("Escolha uma imagem.");
  if (file.size > MAX_FILE) throw invalid(TOO_BIG);
  const input = Buffer.from(await file.arrayBuffer());
  const type = sniff(input);
  if (!type || !IMAGE_TYPES.has(type.ext)) throw invalid("Envie uma imagem JPG, PNG, WebP, GIF ou HEIC.");
  if ((await usedBytes(me.id)) >= QUOTA) throw overQuota();
  const out = await toWebp(input, type.ext).catch(() => { throw invalid("Não conseguimos abrir esta imagem. Tente outro arquivo."); });
  const hash = sha256hex(out.data), width = out.info.width, height = out.info.pageHeight ?? out.info.height;
  const url = await store(me.id, kind, hash, "webp", out.data, width, height);
  return c.json({ url, width, height });
});

r.put("/fc-media/:hash", bodyLimit({ maxSize: MAX_FILE, onError: () => { throw invalid(TOO_BIG); } }), async (c) => {
  const me = requireUser(c), hash = c.req.param("hash");
  if (!/^[a-f0-9]{64}$/.test(hash)) throw invalid("Identificador de arquivo inválido.");
  const data = Buffer.from(await c.req.arrayBuffer());
  if (!data.length) throw invalid("O arquivo veio vazio.");
  if (data.length > MAX_FILE) throw invalid(TOO_BIG);
  if (sha256hex(data) !== hash) throw invalid("O arquivo não chegou inteiro. Tente de novo.");
  const type = sniff(data);
  if (!type) throw invalid("Só aceitamos imagem ou áudio nos baralhos.");
  return c.json({ url: await store(me.id, "fc", hash, type.ext, data, null, null) });
});

/** o servidor já tem este arquivo? Então nem precisa enviar: fica só a referência, sem contar na cota */
r.post("/fc-media/:hash/reuse", async (c) => {
  const me = requireUser(c), hash = c.req.param("hash");
  if (!/^[a-f0-9]{64}$/.test(hash)) throw invalid("Identificador de arquivo inválido.");
  const f = await one<{ ext: string }>("SELECT ext FROM uploads WHERE hash = $1 AND kind = 'fc' LIMIT 1", [hash]);
  if (!f || !(await access(join(env.uploadsDir, "fc", `${hash}.${f.ext}`)).then(() => true, () => false))) throw notFound("Este arquivo ainda não está no servidor.");
  await q("INSERT INTO uploads (hash, user_id, kind, ext, bytes) VALUES ($1, $2, 'fc', $3, 0) ON CONFLICT DO NOTHING", [hash, me.id, f.ext]);
  return c.json({ url: `/uploads/fc/${hash}.${f.ext}` });
});

r.get("/me/quota", async (c) => c.json({ usedBytes: await usedBytes(requireUser(c).id), limitBytes: QUOTA }));

export default r;
