/* Monta a API. Cada arquivo em routes/ exporta um Hono com as rotas do seu assunto. */
import { mkdirSync } from "node:fs";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { env } from "./env";
import { HttpError, invalid, sameOrigin } from "./http";
import type { AppEnv } from "./http";
import { loadUser } from "./routes/auth";
import auth from "./routes/auth";
import me from "./routes/me";
import sync from "./routes/sync";
import community from "./routes/community";
import people from "./routes/people";
import docs from "./routes/docs";
import uploads from "./routes/uploads";
import decks from "./routes/decks";
import support from "./routes/support";
import admin from "./routes/admin";
import pluginApi, { iaPage } from "./routes/plugin";
import usage from "./routes/usage";
import adminUsers from "./routes/admin-users";
import adminSystem from "./routes/admin-system";
import adminIa from "./routes/admin-ia";
import adminPainel from "./routes/admin-painel";
import ia from "./routes/ia";
import chat from "./routes/chat";
import adminChat from "./routes/admin-chat";
import { extras } from "./extras";
import questions from "./routes/questions";
import { monitor, recordError } from "./lib/monitor";
import oauth from "./oauth/routes";
import mcp from "./mcp/routes";

export function createApp() {
  const app = new Hono<AppEnv>();
  app.use("*", secureHeaders({ crossOriginResourcePolicy: false }));
  app.get("/api/health", (c) => c.json({ ok: true }));
  // em produção quem serve os arquivos é o Caddy
  if (!env.prod) {
    mkdirSync(env.uploadsDir, { recursive: true });
    app.use("/uploads/*", serveStatic({ root: env.uploadsDir, rewriteRequestPath: (p) => p.replace(/^\/uploads/, "") }));
  }

  app.use("/api/*", monitor);
  app.use("/mcp", monitor);
  app.use("/mcp/*", monitor);
  app.use("/api/*", sameOrigin);
  // o resto da API recebe JSON pequeno; só estas rotas têm teto próprio, maior
  const small = bodyLimit({ maxSize: 1024 * 1024, onError: () => { throw invalid("O que foi enviado é grande demais."); } });
  app.use("/api/*", (c, next) => (/^\/api\/(sync\/push|docs|decks\/publish|uploads\/image|fc-media)(\/|$)/.test(c.req.path) ? next() : small(c, next)));
  app.use("/api/*", loadUser);
  app.use("/oauth/authorize", loadUser);

  app.route("/api", auth);
  app.route("/api", me);
  app.route("/api", sync);
  app.route("/api", community);
  app.route("/api", people);
  app.route("/api", docs);
  app.route("/api", uploads);
  app.route("/api", decks);
  app.route("/api", support);
  app.route("/api", admin);
  app.route("/api", pluginApi);
  app.route("/api", usage);
  app.route("/api", adminUsers);
  app.route("/api", adminSystem);
  app.route("/api", adminIa);
  app.route("/api", adminPainel);
  app.route("/api", ia);
  app.route("/api", chat);
  app.route("/api", adminChat);
  extras(app);
  app.route("/api", questions);
  app.route("/", iaPage);
  app.route("/", oauth);
  app.route("/", mcp);

  app.notFound((c) => c.json({ error: { code: "nao_encontrado", message: "Não encontramos isso." } }, 404));
  app.onError((e, c) => {
    if (e instanceof HttpError) return c.json({ error: { code: e.code, message: e.message }, ...(e.extra || {}) }, e.status as any);
    console.error(e);
    recordError(e, c);
    return c.json({ error: { code: "erro", message: "Algo deu errado do nosso lado. Tente de novo." } }, 500);
  });
  return app;
}
