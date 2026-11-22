/* Formato das respostas da API: ver docs/CONTRATO-v3.md */
import type { Plan } from "../state/store";
import type { PlanPrefs } from "../state/goals";

export type Visibility = "publico" | "seguidores" | "privado";
export type Me = {
  id: string; name: string; handle: string; email: string; role: "user" | "admin";
  bio: string; faculdade: string | null; semestre: number | null; formado: boolean; cidade: string | null; avatarUrl: string | null;
  visibility: Visibility; showStats: boolean; showFaculdade: boolean; showActivity: boolean; sharePlan: Visibility;
  totalQuestions: number; totalCards: number; sharedMode: boolean; createdAt: number;
};

export type FlagReason = "desatualizada" | "problema" | "gabarito" | "imagem" | "outro";
export type Comment = {
  id: string; qid: string; parentId: string | null; body: string; likes: number; liked: boolean; replies: number; createdAt: number; editedAt: number | null; mine: boolean;
  author: { handle: string; name: string; avatarUrl: string | null; faculdade: string | null };
};

export type Relation = "eu" | "nenhuma" | "pendente" | "seguindo";
export type PersonCard = { handle: string; name: string; avatarUrl: string | null; faculdade: string | null; semestre: number | null; relation: Relation };
export type SharedPlan = { exame: string; banca: string; data: string; inicio: string; dias: number[]; meta: number; simulado: Plan["simulado"]; prefs: PlanPrefs | null; updatedAt: number };
export type SharedDeckCard = {
  id: string; slug: string; name: string; description: string; tags: string[]; visibility: "publico" | "seguidores" | "link"; version: number; cardsCount: number; subscribers: number; updatedAt: number;
  owner: { handle: string; name: string; avatarUrl: string | null }; subscribed: boolean; mine: boolean;
};
export type SharedCard = { key: string; kind: "basic" | "cloze" | "qa"; fields: string[]; ord: number; path: string[]; tags: string[] };
export type PublicProfile = PersonCard & {
  bio: string; cidade: string | null; formado: boolean; since: number; visibility: Visibility; locked: boolean; followsYou: boolean; followers: number; following: number;
  stats: { questions: number; cards: number; days: { day: string; n: number }[] } | null;
  decks: SharedDeckCard[]; plan: SharedPlan | null; docsCount: number;
};

export type DocNode = { id: string; parentId: string | null; kind: "pasta" | "doc"; title: string; icon: string | null; position: number; visibility: Visibility; sharedByParent: boolean; updatedAt: number; origin: "app" | "ia" };
export type Doc = DocNode & { content: unknown; version: number; createdAt: number };

export type FeedbackKind = "sugestao" | "prova" | "problema" | "senha" | "outro";
export type FeedbackItem = { id: string; kind: FeedbackKind; title: string; body: string; source: "app" | "plugin"; status: "novo" | "lendo" | "feito" | "recusado"; reply: string | null; repliedAt: number | null; createdAt: number };

export type PluginSetup = {
  urlNormal: string; urlCompartilhado: string; prompts: { normal: string; compartilhado: string };
  /** o guia que a IA lê (/ia.md) e os links do Claude que abrem o conector já preenchido */
  guia: string; claudeLinks: { normal: string; compartilhado: string };
  clients: { id: string; name: string; steps: string[]; stepsCompartilhado: string[] }[]; tools: { name: string; group: string; summary: string }[];
};
export type PluginStatus = {
  connections: { id: string; kind: string; label: string; lastUsedAt: number | null; createdAt: number }[];
  sharedSessions: { id: string; createdAt: number; lastUsedAt: number; expiresAt: number }[]; sharedMode: boolean; lastUsedAt: number | null;
};
