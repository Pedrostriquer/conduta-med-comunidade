/* O que a pessoa edita no próprio perfil. Mesma validação para a rota PATCH /api/me e para o plugin. */
import { z } from "zod";
import { one } from "../db";
import { HttpError, notFound, parse } from "../http";
import type { UserRow } from "../http";
import { assertHandle } from "./handles";
import { pgCode, zText } from "./validate";

const optionalText = (max: number, m: string) => zText().max(max, m).nullable().transform((v) => v || null);
const LEVEL = z.enum(["publico", "seguidores", "privado"]);

export const profilePatchSchema = z.object({
  name: zText().min(1, "Diga seu nome.").max(80, "O nome pode ter até 80 caracteres."),
  handle: z.string().transform((h) => assertHandle(h)),
  bio: zText().max(500, "A bio pode ter até 500 caracteres."),
  faculdade: optionalText(120, "O nome da faculdade pode ter até 120 caracteres."),
  semestre: z.number().int().min(1, "O semestre vai de 1 a 12.").max(12, "O semestre vai de 1 a 12.").nullable(),
  formado: z.boolean(),
  cidade: optionalText(80, "O nome da cidade pode ter até 80 caracteres."),
  // só a imagem enviada pela própria plataforma: nada de endereço externo no perfil dos outros
  avatarUrl: z.string().regex(/^\/uploads\/avatar\/[a-f0-9]{64}\.webp$/, "Envie a foto pelo próprio perfil.").nullable(),
  visibility: LEVEL,
  showStats: z.boolean(),
  showFaculdade: z.boolean(),
  showActivity: z.boolean(),
  sharePlan: LEVEL,
  sharedMode: z.boolean(),
}).partial();
export type ProfilePatch = z.input<typeof profilePatchSchema>;

const COLUMNS = {
  name: "name", handle: "handle", bio: "bio", faculdade: "faculdade", semestre: "semestre", formado: "formado", cidade: "cidade", avatarUrl: "avatar_url", visibility: "visibility",
  showStats: "show_stats", showFaculdade: "show_faculdade", showActivity: "show_activity", sharePlan: "share_plan", sharedMode: "shared_mode",
} as const;

/** valida, grava os campos que vieram e devolve a linha atualizada. E-mail e papel não mudam por aqui. */
export async function updateProfile(userId: string, patch: unknown): Promise<UserRow> {
  const p = parse(profilePatchSchema, patch);
  const sets: string[] = [], args: unknown[] = [userId];
  for (const [key, col] of Object.entries(COLUMNS)) {
    const v = p[key as keyof typeof COLUMNS];
    if (v === undefined) continue;
    args.push(v);
    sets.push(`${col} = $${args.length}`);
  }
  try {
    const u = sets.length
      ? await one<UserRow>(`UPDATE users SET ${sets.join(", ")}, updated_at = now() WHERE id = $1 RETURNING *`, args)
      : await one<UserRow>("SELECT * FROM users WHERE id = $1", args);
    if (!u) throw notFound();
    return u;
  } catch (e) {
    if (pgCode(e) === "23505") throw new HttpError("conflito", "Este @ já está em uso. Escolha outro.");
    throw e;
  }
}
