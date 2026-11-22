/* Painel do admin: a saúde do servidor (CPU, memória, disco, erros, quem fez muita coisa de uma vez), o crescimento do banco
   de questões e as configurações que antes morariam num .env. */
import { readdir, stat, statfs } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import { AREAS, bank, bankExtra } from "../bank";
import { one, q } from "../db";
import { env } from "../env";
import { invalid, ms, requireAdmin } from "../http";
import type { AppEnv } from "../http";
import { mailReady, resetCodeMail, sendMail, verifyMail } from "../lib/mail";
import { sample } from "../lib/monitor";
import { deleteSecret, secretInfo, setSecret } from "../lib/secrets";
import { getSetting, setSetting } from "../lib/settings";
import { jsonBody } from "../lib/validate";

const r = new Hono<AppEnv>();

async function dirBytes(dir: string) {
  let total = 0, files = 0, newest = 0;
  try {
    for (const f of await readdir(dir)) {
      const s = await stat(join(dir, f)).catch(() => null);
      if (s?.isFile()) { total += s.size; files++; newest = Math.max(newest, s.mtimeMs); }
    }
  } catch { /* sem a pasta */ }
  return { total, files, newest: newest || null };
}

r.get("/admin/servidor", async (c) => {
  requireAdmin(c);
  const hours = Math.min(24 * 30, Math.max(1, Number(c.req.query("horas")) || 24));
  const bucket = hours <= 6 ? 5 : hours <= 48 ? 15 : hours <= 24 * 7 ? 60 : 240;
  const since = new Date(Date.now() - hours * 3_600_000);
  const [series, peaks, totals, busy, mcpBusy, errors, errorsByPath, db, tables, uploads] = await Promise.all([
    q<any>(
      `SELECT to_timestamp(floor(extract(epoch FROM minute) / ($2 * 60)) * ($2 * 60)) AS at, sum(requests) AS requests, sum(errors) AS errors, sum(mcp) AS mcp, sum(slow) AS slow,
         max(cpu_pct) AS cpu, max(rss_mb) AS rss, max(mem_pct) AS mem, max(load1) AS load, CASE WHEN sum(requests) > 0 THEN sum(ms_total) / sum(requests) ELSE 0 END AS avg_ms
       FROM server_minutes WHERE minute >= $1 GROUP BY 1 ORDER BY 1`, [since, bucket]),
    q<any>("SELECT minute, requests, errors, mcp, cpu_pct, rss_mb, mem_pct, ms_max FROM server_minutes WHERE minute >= $1 ORDER BY requests DESC LIMIT 5", [since]),
    one<any>("SELECT COALESCE(sum(requests), 0) AS requests, COALESCE(sum(errors), 0) AS errors, COALESCE(sum(mcp), 0) AS mcp, COALESCE(sum(slow), 0) AS slow, max(cpu_pct) AS cpu_max, max(rss_mb) AS rss_max, max(mem_pct) AS mem_max, max(load1) AS load_max FROM server_minutes WHERE minute >= $1", [since]),
    q<any>("SELECT b.user_id, u.handle, u.name, sum(b.requests) AS requests, count(*) AS minutes, max(b.requests) AS peak, max(b.minute) AS last FROM server_busy b JOIN users u ON u.id = b.user_id WHERE b.minute >= $1 GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 10", [since]),
    // pelo plugin a conta aparece no registro de cada ferramenta usada
    q<any>(`SELECT m.user_id, u.handle, u.name, sum(m.n) AS calls, max(m.n) AS peak, max(m.minute) AS last FROM (
              SELECT user_id, date_trunc('minute', at) AS minute, count(*) AS n FROM mcp_audit WHERE at >= $1 GROUP BY 1, 2
            ) m JOIN users u ON u.id = m.user_id GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 10`, [since]),
    q<any>("SELECT e.id, e.at, e.method, e.path, e.status, e.message, e.stack, u.handle FROM server_errors e LEFT JOIN users u ON u.id = e.user_id ORDER BY e.at DESC LIMIT 50"),
    q<any>("SELECT path, message, count(*) AS n, max(at) AS last FROM server_errors WHERE at >= $1 GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10", [since]),
    one<any>("SELECT pg_database_size(current_database()) AS bytes"),
    q<any>("SELECT relname AS name, pg_total_relation_size(c.oid) AS bytes FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 2 DESC LIMIT 8"),
    one<any>("SELECT COALESCE(sum(b), 0) AS bytes, count(*) AS files FROM (SELECT hash, max(bytes) AS b FROM uploads GROUP BY hash) x"),
  ]);
  const disk = await statfs(env.uploadsDir).then((s) => ({ total: s.blocks * s.bsize, free: s.bavail * s.bsize })).catch(() => null);
  const backups = env.backupsDir ? await dirBytes(env.backupsDir) : { total: 0, files: 0, newest: null };
  const transcripts = await dirBytes(env.transcriptsDir);
  const conduta = Number(db?.bytes || 0) + Number(uploads?.bytes || 0) + backups.total + transcripts.total;
  return c.json({
    hours, bucket, now: { ...sample(), uptimeSec: Math.round(process.uptime()) },
    totals: { requests: Number(totals?.requests || 0), errors: Number(totals?.errors || 0), mcp: Number(totals?.mcp || 0), slow: Number(totals?.slow || 0), cpuMax: totals?.cpu_max ?? 0, rssMax: totals?.rss_max ?? 0, memMax: totals?.mem_max ?? 0, loadMax: totals?.load_max ?? 0 },
    series: series.map((x) => ({ at: ms(x.at)!, requests: Number(x.requests), errors: Number(x.errors), mcp: Number(x.mcp), slow: Number(x.slow), cpu: x.cpu, rss: x.rss, mem: x.mem, load: x.load, avgMs: Math.round(Number(x.avg_ms)) })),
    peaks: peaks.map((p) => ({ at: ms(p.minute)!, requests: p.requests, errors: p.errors, mcp: p.mcp, cpu: p.cpu_pct, rss: p.rss_mb, mem: p.mem_pct, msMax: p.ms_max })),
    busy: busy.map((b) => ({ id: b.user_id, handle: b.handle, name: b.name, requests: Number(b.requests), minutes: Number(b.minutes), peak: Number(b.peak), last: ms(b.last) })),
    mcpBusy: mcpBusy.map((b) => ({ id: b.user_id, handle: b.handle, name: b.name, calls: Number(b.calls), peak: Number(b.peak), last: ms(b.last) })),
    errors: errors.map((e) => ({ id: e.id, at: ms(e.at)!, method: e.method, path: e.path, status: e.status, message: e.message, stack: e.stack, handle: e.handle })),
    errorsByPath: errorsByPath.map((e) => ({ path: e.path, message: e.message, n: Number(e.n), last: ms(e.last) })),
    disk: disk && { total: disk.total, free: disk.free, used: disk.total - disk.free, conduta, others: Math.max(0, disk.total - disk.free - conduta) },
    sizes: { db: Number(db?.bytes || 0), uploads: Number(uploads?.bytes || 0), uploadFiles: Number(uploads?.files || 0), backups: backups.total, backupFiles: backups.files, lastBackup: backups.newest, transcripts: transcripts.total, tables: tables.map((t) => ({ name: t.name, bytes: Number(t.bytes) })) },
  });
});

/* ---------- banco de questões ---------- */
export const REASONS: Record<string, string> = {
  video_diverge: "Vídeo diverge do gabarito", video_em_duvida: "Professor em dúvida no vídeo", recurso: "Recurso ou anulação sugerida", polemica: "Polêmica", duas_possiveis: "Duas respostas possíveis", anulacao_esperada: "Anulação esperada",
  desatualizada: "Desatualizada", alterada_apos_recurso: "Gabarito alterado após recurso", anulada: "Anulada", sem_video: "Sem correção em vídeo", sem_explicacao: "Sem explicação", outro: "Outro",
};

r.get("/admin/banco", async (c) => {
  requireAdmin(c);
  const b = bank(), extra = bankExtra();
  const flags = await q<{ qid: string; n: number; open: number }>("SELECT qid, count(*) AS n, count(*) FILTER (WHERE status = 'novo') AS open FROM question_flags GROUP BY qid");
  const flagBy = new Map(flags.map((f) => [f.qid, f]));
  const collected = new Map(extra.provas.map((p) => [p.id, p.coleta]));
  type Row = { total: number; ok: number; anuladas: number; problema: number; diverge: number; flagged: number };
  const zero = (): Row => ({ total: 0, ok: 0, anuladas: 0, problema: 0, diverge: 0, flagged: 0 });
  const exams = new Map<string, Row>(), areas = new Map<string, Row>(), reasons = new Map<string, number>(), esp = new Map<string, Row>();
  const add = (m: Map<string, Row>, k: string) => { let x = m.get(k); if (!x) { x = zero(); m.set(k, x); } return x; };
  for (const qq of [...b.all, ...b.annulled]) {
    const ex = extra.questoes[qq.id], ms_ = ex?.m || [], f = flagBy.get(qq.id);
    for (const x of [add(exams, qq.p), add(areas, qq.area), add(esp, qq.area + "/" + (qq.esp || "Outros"))]) {
      x.total++;
      if (qq.an) x.anuladas++; else if (qq.ok) x.ok++; else x.problema++;
      if (ms_.includes("video_diverge")) x.diverge++;
      if (f) x.flagged++;
    }
    for (const k of ms_) reasons.set(k, (reasons.get(k) || 0) + 1);
  }
  const growth = new Map<string, { questoes: number; provas: number }>();
  for (const e of b.exams) {
    const day = collected.get(e.id) || "sem data", g = growth.get(day) || { questoes: 0, provas: 0 }, x = exams.get(e.id);
    g.questoes += x?.total || 0; g.provas++; growth.set(day, g);
  }
  let acc = 0;
  const curve = [...growth.entries()].filter(([d]) => d !== "sem data").sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([day, g]) => { acc += g.questoes; return { day, added: g.questoes, provas: g.provas, total: acc }; });
  const pctOf = (x: Row) => ({ ...x, pDiverge: x.total ? x.diverge / x.total : 0, pProblema: x.total ? x.problema / x.total : 0, pAnuladas: x.total ? x.anuladas / x.total : 0 });
  const all = [...exams.values()].reduce((s, x) => ({ total: s.total + x.total, ok: s.ok + x.ok, anuladas: s.anuladas + x.anuladas, problema: s.problema + x.problema, diverge: s.diverge + x.diverge, flagged: s.flagged + x.flagged }), zero());
  return c.json({
    geral: { ...pctOf(all), provas: b.exams.length, bancas: new Set(b.exams.map((e) => e.banca)).size },
    curve,
    exams: b.exams.map((e) => ({ id: e.id, nome: e.nome, banca: e.banca, ano: e.ano, coleta: collected.get(e.id) || null, ...pctOf(exams.get(e.id) || zero()) })),
    areas: (Object.keys(AREAS) as (keyof typeof AREAS)[]).map((k) => ({ id: k, nome: AREAS[k], ...pctOf(areas.get(k) || zero()) })),
    especialidades: [...esp.entries()].map(([k, x]) => ({ chave: k, nome: k.split("/")[1], area: k.split("/")[0], ...pctOf(x) })).sort((x, y) => y.total - x.total).slice(0, 40),
    motivos: [...reasons.entries()].map(([id, n]) => ({ id, nome: REASONS[id] || id, n })).sort((x, y) => y.n - x.n),
  });
});

/** as questões de um motivo, para ir atrás de outro canal corrigindo */
r.get("/admin/banco/questoes", async (c) => {
  requireAdmin(c);
  const motivo = c.req.query("motivo") || "video_diverge", prova = c.req.query("prova") || null, sinalizadas = c.req.query("sinalizadas") === "1";
  const b = bank(), extra = bankExtra().questoes;
  const flags = await q<{ qid: string; n: number; reasons: string[] }>("SELECT qid, count(*) AS n, array_agg(DISTINCT reason) AS reasons FROM question_flags GROUP BY qid");
  const flagBy = new Map(flags.map((f) => [f.qid, f]));
  const items = [...b.all, ...b.annulled].filter((x) => (!prova || x.p === prova) && (sinalizadas ? flagBy.has(x.id) : (extra[x.id]?.m || []).includes(motivo)));
  return c.json({
    total: items.length,
    items: items.slice(0, 300).map((x) => {
      const ex = extra[x.id];
      return { id: x.id, prova: b.examById.get(x.p)?.nome || x.p, numero: x.n, area: x.area, esp: x.esp, tema: x.tema, gabarito: x.g || null, videoDisse: ex?.rv || null, aviso: ex?.av || null, trecho: ex?.ev || null, motivos: ex?.m || [], canal: x.v?.c || null, video: x.v ? { id: x.v.id, s: x.v.s } : null, flags: flagBy.get(x.id)?.n || 0, flagReasons: flagBy.get(x.id)?.reasons || [] };
    }),
  });
});

/* ---------- configurações: e-mail e segredos ---------- */
r.get("/admin/config", async (c) => {
  requireAdmin(c);
  const [mail, pass, key, ia] = await Promise.all([getSetting("mail"), secretInfo("mail_password"), secretInfo("anthropic"), getSetting("ia")]);
  return c.json({ mail: { ...mail, password: pass, ready: await mailReady() }, anthropic: key, ia });
});

r.put("/admin/config/mail", async (c) => {
  const a = requireAdmin(c);
  const b = await jsonBody(c, z.object({ from: z.email("Confira o e-mail."), name: z.string().trim().min(1).max(60).optional(), host: z.string().trim().min(3).max(120).optional(), port: z.number().int().optional(), password: z.string().max(200).optional() }));
  await setSetting("mail", { from: b.from.toLowerCase(), ...(b.name ? { name: b.name } : {}), ...(b.host ? { host: b.host } : {}), ...(b.port ? { port: b.port } : {}) });
  // o Gmail mostra a senha de app em grupos de 4 com espaços
  const pass = b.password?.replace(/\s+/g, "");
  if (pass) await setSecret("mail_password", pass, a.id);
  return c.body(null, 204);
});

r.delete("/admin/config/mail", async (c) => {
  requireAdmin(c);
  await deleteSecret("mail_password");
  return c.body(null, 204);
});

r.post("/admin/config/mail/testar", async (c) => {
  const a = requireAdmin(c);
  try {
    await verifyMail();
    await sendMail({ to: a.email, ...resetCodeMail(a.name, "123456"), subject: "Teste de envio do Conduta Med" });
  } catch (e) { throw invalid(`Não funcionou: ${(e as Error).message}`.slice(0, 300)); }
  return c.json({ to: a.email });
});

r.put("/admin/config/anthropic", async (c) => {
  const a = requireAdmin(c);
  const b = await jsonBody(c, z.object({ key: z.string().trim().min(20, "Essa chave parece incompleta.").max(300) }));
  if (!b.key.startsWith("sk-ant-")) throw invalid("A chave da Anthropic começa com sk-ant-.");
  await setSecret("anthropic", b.key, a.id);
  return c.json(await secretInfo("anthropic"));
});

r.delete("/admin/config/anthropic", async (c) => {
  requireAdmin(c);
  await deleteSecret("anthropic");
  return c.body(null, 204);
});

export default r;
