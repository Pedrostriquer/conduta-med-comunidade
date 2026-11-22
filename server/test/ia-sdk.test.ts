/* O caminho de verdade até a porta: o SDK da Anthropic contra um servidor falso (o pedido sai no formato certo e a resposta em fluxo
   é entendida) e o nodemailer contra um SMTP falso. O que não dá para testar sem chave é a resposta real da API. */
import { createServer } from "node:http";
import type { IncomingHttpHeaders, Server } from "node:http";
import { createServer as tcp } from "node:net";
import type { AddressInfo, Server as TcpServer } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "../src/db";
import { callModel, ModelError } from "../src/ia/model";
import { sendMail, verifyMail } from "../src/lib/mail";
import { clearSecretCache, setSecret } from "../src/lib/secrets";
import { clearSettingsCache, setSetting } from "../src/lib/settings";
import { useDatabase } from "./rest-helpers";

useDatabase();

let http: Server, seen: { body: any; headers: IncomingHttpHeaders }[] = [], mode: "ok" | "auth" | "refusal" | "cut" = "ok";
const sse = (stop: string) => [
  ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 123, output_tokens: 1, cache_read_input_tokens: 7, cache_creation_input_tokens: 0 } } }],
  ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["content_block_start", { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }],
  ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: '{"resumo":' } }],
  ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: '"ok"}' } }],
  ["content_block_stop", { type: "content_block_stop", index: 1 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 456 } }],
  ["message_stop", { type: "message_stop" }],
].map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");

beforeAll(async () => {
  http = createServer((req, res) => {
    let raw = "";
    req.on("data", (x) => { raw += x; });
    req.on("end", () => {
      seen.push({ body: JSON.parse(raw), headers: req.headers });
      if (mode === "auth") { res.writeHead(401, { "content-type": "application/json" }); res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } })); return; }
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(sse(mode === "refusal" ? "refusal" : mode === "cut" ? "max_tokens" : "end_turn"));
    });
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(() => { delete process.env.ANTHROPIC_BASE_URL; http.close(); });
beforeEach(async () => {
  seen = []; mode = "ok"; clearSecretCache(); clearSettingsCache();
  await pool.query("TRUNCATE app_settings, app_secrets");
  await setSecret("anthropic", "sk-ant-chave-de-teste-123456", null);
});

const call = { model: "claude-haiku-5-5", effort: "low", system: "instruções", user: "material", schema: { type: "object" }, maxTokens: 32000 };

describe("chamada ao modelo", () => {
  it("manda a chave, o esforço e o formato, e entende a resposta em fluxo", async () => {
    const r = await callModel(call);
    expect(r.text).toBe('{"resumo":"ok"}');
    expect(r.usage).toEqual({ in: 123, out: 456, cacheRead: 7, cacheWrite: 0 });
    const { body, headers } = seen[0];
    expect(headers.authorization).toBe("Bearer sk-ant-chave-de-teste-123456");
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.max_tokens).toBe(32000);
    expect(body.stream).toBe(true);
    expect(body.output_config).toEqual({ effort: "low", format: { type: "json_schema", schema: { type: "object" } } });
    expect(body.thinking).toBeUndefined();
  });

  it("desliga o raciocínio do jeito de cada modelo", async () => {
    await callModel({ ...call, thinking: false });
    expect(seen[0].body.thinking).toEqual({ type: "disabled" });
    await callModel({ ...call, model: "claude-sonnet-5-5", thinking: false });
    expect(seen[1].body.thinking).toEqual({ type: "between_tools" });
    await callModel({ ...call, model: "claude-opus-5-5", thinking: false });
    expect(seen[2].body.thinking).toBeUndefined();
  });

  it("chave recusada, recusa do modelo e resposta cortada viram erro legível, com o gasto quando houve", async () => {
    mode = "auth";
    await expect(callModel(call)).rejects.toThrow("A chave de API foi recusada.");
    mode = "refusal";
    const e1 = await callModel(call).catch((e) => e);
    expect(e1).toBeInstanceOf(ModelError);
    expect(e1.message).toContain("recusou");
    expect(e1.usage.out).toBe(456);
    mode = "cut";
    expect((await callModel(call).catch((e) => e)).message).toContain("limite");
  });
});

/** só o que o nodemailer precisa: EHLO, AUTH, MAIL, RCPT, DATA */
function fakeSmtp(onMail: (m: { auth: string; to: string; data: string }) => void, password = "abcdefghijklmnop") {
  return tcp((s) => {
    let inData = false, data = "", auth = "", to = "", buf = "";
    s.write("220 falso ESMTP\r\n");
    s.on("data", (x) => {
      buf += x.toString();
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) {
          if (line === ".") { inData = false; onMail({ auth, to, data }); s.write("250 ok\r\n"); } else data += line + "\n";
          continue;
        }
        const up = line.toUpperCase();
        if (up.startsWith("EHLO")) s.write("250-falso\r\n250 AUTH PLAIN LOGIN\r\n");
        else if (up.startsWith("AUTH PLAIN")) { auth = Buffer.from(line.split(" ")[2], "base64").toString(); s.write(auth.endsWith(password) ? "235 ok\r\n" : "535 senha errada\r\n"); }
        else if (up.startsWith("MAIL")) s.write("250 ok\r\n");
        else if (up.startsWith("RCPT")) { to = line; s.write("250 ok\r\n"); }
        else if (up === "DATA") { inData = true; s.write("354 manda\r\n"); }
        else if (up === "QUIT") { s.write("221 tchau\r\n"); s.end(); }
        else s.write("250 ok\r\n");
      }
    });
    s.on("error", () => {});
  });
}

describe("envio de e-mail", () => {
  let smtp: TcpServer, got: { auth: string; to: string; data: string }[] = [];
  beforeAll(async () => { smtp = fakeSmtp((m) => got.push(m)); await new Promise<void>((r) => smtp.listen(0, "127.0.0.1", r)); });
  afterAll(() => { smtp.close(); });

  it("autentica com a senha de app e entrega", async () => {
    got = [];
    await setSetting("mail", { from: "pessoa@gmail.com", host: "127.0.0.1", port: (smtp.address() as AddressInfo).port });
    await setSecret("mail_password", "abcdefghijklmnop", null);
    await verifyMail();
    await sendMail({ to: "aluno@teste.com", subject: "123456 é o seu código", text: "corpo", html: "<p>corpo</p>" });
    expect(got).toHaveLength(1);
    expect(got[0].auth).toContain("pessoa@gmail.com");
    expect(got[0].to).toContain("aluno@teste.com");
    expect(got[0].data).toContain("123456");
  });

  it("senha errada aparece como erro, em vez de fingir que foi", async () => {
    await setSetting("mail", { from: "pessoa@gmail.com", host: "127.0.0.1", port: (smtp.address() as AddressInfo).port });
    await setSecret("mail_password", "senha-errada", null);
    await expect(verifyMail()).rejects.toThrow();
  });
});
