/* Configuração, lida uma vez ao subir. Sem valor padrão para o que muda entre ambientes em produção. */
const need = (k: string, dev?: string) => {
  const v = process.env[k] ?? (process.env.NODE_ENV === "production" ? undefined : dev);
  if (v === undefined) throw new Error(`Falta a variável de ambiente ${k}`);
  return v;
};

export const env = {
  prod: process.env.NODE_ENV === "production",
  /** só com NODE_ENV=development: libera o que o modo de exemplo do app usa sem conta (a busca de questões) */
  dev: process.env.NODE_ENV === "development",
  port: Number(process.env.PORT || 8300),
  databaseUrl: need("DATABASE_URL", "postgres://conduta@localhost:5544/conduta"),
  /** endereço público do app, sem barra no fim */
  publicUrl: need("PUBLIC_URL", "http://localhost:5180").replace(/\/$/, ""),
  /** outros endereços de onde o navegador pode escrever na API (o painel do admin no subdomínio dele, o domínio antigo), separados por vírgula */
  extraOrigins: (process.env.EXTRA_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean),
  dataDir: need("DATA_DIR", "../app/public/data"),
  transcriptsDir: need("TRANSCRIPTS_DIR", "./data/transcricoes"),
  uploadsDir: need("UPLOADS_DIR", "./uploads"),
  bankExtraFile: process.env.BANK_EXTRA_FILE || "./data/banco-extra.json",
  backupsDir: process.env.BACKUPS_DIR || "",
  confirmSecret: need("CONFIRM_SECRET", "dev-only-secret-troque-em-producao"),
  /** chave que cifra os segredos guardados no banco (chave de API, senha do e-mail). Sem ela não dá para ler o que está guardado */
  secretsKey: need("SECRETS_KEY", "dev-only-chave-de-segredos-troque-em-producao"),
  adminEmails: (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
};
