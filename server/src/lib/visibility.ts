/* A matriz de visibilidade do contrato mora aqui e só aqui: perfil, plano, baralhos e resumos passam por `canSee`.

   dono do item          nível do item   a própria pessoa   seguidor aceito   qualquer outra pessoa logada
   perfil privado        qualquer        vê                 não               não
   perfil seguidores     publico/link    vê                 vê                vê
   perfil seguidores     seguidores      vê                 vê                não
   perfil publico        publico/link    vê                 vê                vê
   perfil publico        seguidores      vê                 vê                não
   qualquer              privado         vê                 não               não
*/
import { one } from "../db";
import { notFound } from "../http";
import type { UserRow } from "../http";

export type ProfileLevel = "publico" | "seguidores" | "privado";
export type Level = ProfileLevel | "link";
export type FollowStatus = "pendente" | "aceito" | null;
export type Relation = "eu" | "nenhuma" | "pendente" | "seguindo";
export type Viewer = { id: string; status: FollowStatus };
export type Owner = { id: string; visibility: ProfileLevel };

export function canSee(viewer: Viewer, owner: Owner, level: Level): boolean {
  if (viewer.id === owner.id) return true;
  if (owner.visibility === "privado" || level === "privado") return false;
  if (level === "publico" || level === "link") return true;
  // "Quem me segue" é só para quem a pessoa aceitou, mesmo com o perfil público
  return viewer.status === "aceito";
}
/** níveis de item que esta pessoa vê deste dono, para filtrar no SQL sem repetir a regra */
export const visibleLevels = (viewer: Viewer, owner: Owner) => (["privado", "seguidores", "publico"] as const).filter((l) => canSee(viewer, owner, l));
/** o perfil aparece trancado: só nome, @ e o botão de seguir */
export const isLocked = (viewer: Viewer, owner: Owner) => !canSee(viewer, owner, owner.visibility);

export const relationOf = (viewerId: string, ownerId: string, status: FollowStatus): Relation =>
  viewerId === ownerId ? "eu" : status === "aceito" ? "seguindo" : status === "pendente" ? "pendente" : "nenhuma";

/* ---------- cartão de pessoa ---------- */
export type CardRow = { id: string; handle: string; name: string; avatar_url: string | null; faculdade: string | null; semestre: number | null; visibility: ProfileLevel; show_faculdade: boolean; status: FollowStatus };
export type PersonCard = { handle: string; name: string; avatarUrl: string | null; faculdade: string | null; semestre: number | null; relation: Relation };
/** colunas de `CardRow`; a consulta faz LEFT JOIN em `follows f` com o viewer como seguidor */
export const CARD_COLS = "u.id, u.handle, u.name, u.avatar_url, u.faculdade, u.semestre, u.visibility, u.show_faculdade, f.status";

export function personCard(viewerId: string, r: CardRow): PersonCard {
  const self = viewerId === r.id, locked = isLocked({ id: viewerId, status: r.status }, r), fac = self || (!locked && r.show_faculdade);
  return { handle: r.handle, name: r.name, avatarUrl: locked ? null : r.avatar_url, faculdade: fac ? r.faculdade : null, semestre: fac ? r.semestre : null, relation: relationOf(viewerId, r.id, r.status) };
}

/* ---------- dono do conteúdo pedido na rota ---------- */
export type OwnerRow = UserRow & { status: FollowStatus; back: FollowStatus };

/** carrega a pessoa de `:handle` com a relação com quem vê; perfil privado de outra pessoa é 404 */
export async function ownerByHandle(viewerId: string, handle: string): Promise<OwnerRow> {
  const o = await one<OwnerRow>(
    `SELECT u.*, f.status, b.status AS back FROM users u
     LEFT JOIN follows f ON f.follower_id = $1 AND f.followee_id = u.id
     LEFT JOIN follows b ON b.follower_id = u.id AND b.followee_id = $1
     WHERE lower(u.handle) = lower($2)`,
    [viewerId, handle.replace(/^@/, "")],
  );
  if (!o || (o.visibility === "privado" && o.id !== viewerId)) throw notFound("Não encontramos essa pessoa.");
  return o;
}
export function viewerOf(viewerId: string, owner: { status: FollowStatus }): Viewer { return { id: viewerId, status: owner.status }; }

