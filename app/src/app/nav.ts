import type { NavItem } from "../ds/Dock";

/** Os cinco destinos: mesma ordem e mesmo nome na dock do celular e na barra lateral */
export const NAV: NavItem[] = [
  { id: "hoje", label: "Hoje", icon: "today" },
  { id: "questoes", label: "Questões", icon: "questions" },
  { id: "simulados", label: "Simulados", icon: "exam" },
  { id: "cronograma", label: "Cronograma", icon: "calendar" },
  { id: "perfil", label: "Perfil", icon: "user" },
];
/** só na barra lateral; no celular ficam no Perfil */
export const MORE: NavItem[] = [
  { id: "flashcards", label: "Flashcards", icon: "cards" },
  { id: "assuntos", label: "Assuntos", icon: "layers" },
  { id: "resumos", label: "Resumos", icon: "doc" },
  { id: "treino", label: "Treino", icon: "pulse" },
  { id: "pessoas", label: "Pessoas", icon: "users" },
  { id: "chat", label: "Chat de IA", icon: "message" },
  { id: "analises", label: "Análises com IA", icon: "sparkle" },
  { id: "plugin", label: "Sua IA", icon: "plug" },
  { id: "suporte", label: "Suporte", icon: "help" },
];

export const PATH: Record<string, string> = { hoje: "/", questoes: "/questoes", simulados: "/simulados", cronograma: "/cronograma", perfil: "/perfil", flashcards: "/flashcards", assuntos: "/assuntos", resumos: "/resumos", pessoas: "/pessoas", plugin: "/plugin", suporte: "/suporte", analises: "/analises", chat: "/chat", treino: "/treino" };

/** As páginas de cada seção: aparecem abaixo da seção na barra lateral e como abas no celular.
    `also` são outros começos de endereço que pertencem a esta página (ex.: o baralho pertence a "Baralhos"). */
export type SubItem = { label: string; path: string; also?: string[] };
export const SUB: Record<string, SubItem[]> = {
  questoes: [
    { label: "Montar lista", path: "/questoes" },
    { label: "Salvas e anotações", path: "/questoes/salvas" },
    { label: "Buscar", path: "/busca" },
  ],
  simulados: [
    { label: "Provas", path: "/simulados" },
    { label: "Resultados", path: "/simulados/resultados", also: ["/resultado/", "/correcao/"] },
  ],
  cronograma: [
    { label: "Calendário", path: "/cronograma" },
    { label: "Metas e sequência", path: "/cronograma/metas" },
  ],
  flashcards: [
    { label: "Baralhos", path: "/flashcards", also: ["/flashcards/baralho/", "/flashcards/opcoes/"] },
    { label: "Criar cards", path: "/flashcards/novo" },
    { label: "Gerar com IA", path: "/flashcards/ia" },
    { label: "Compartilhados", path: "/flashcards/compartilhados" },
    { label: "Navegar", path: "/flashcards/navegar" },
    { label: "Estatísticas", path: "/flashcards/estatisticas" },
  ],
  perfil: [
    { label: "Visão geral", path: "/perfil" },
    { label: "Desempenho", path: "/perfil/desempenho" },
    { label: "Editar perfil", path: "/perfil/editar" },
    { label: "Ajustes", path: "/perfil/ajustes" },
  ],
  resumos: [
    { label: "Meus resumos", path: "/resumos" },
    { label: "Lixeira", path: "/resumos/lixeira" },
  ],
  pessoas: [
    { label: "Buscar pessoas", path: "/pessoas", also: ["/u/"] },
    { label: "Seguindo", path: "/pessoas/seguindo" },
    { label: "Solicitações", path: "/pessoas/solicitacoes" },
  ],
  plugin: [
    { label: "Conectar", path: "/plugin", also: ["/plugin/codigo"] },
    { label: "O que a IA fez", path: "/plugin/atividade" },
  ],
};

export function tabFor(path: string) {
  if (path.startsWith("/questoes") || path.startsWith("/busca")) return "questoes";
  if (path.startsWith("/simulados") || path.startsWith("/resultado") || path.startsWith("/correcao")) return "simulados";
  if (path.startsWith("/cronograma")) return "cronograma";
  if (path.startsWith("/flashcards")) return "flashcards";
  if (path.startsWith("/perfil")) return "perfil";
  if (path.startsWith("/assuntos")) return "assuntos";
  if (path.startsWith("/resumos")) return "resumos";
  if (path.startsWith("/pessoas") || path.startsWith("/u/")) return "pessoas";
  if (path.startsWith("/plugin")) return "plugin";
  if (path.startsWith("/suporte")) return "suporte";
  if (path.startsWith("/analises")) return "analises";
  if (path.startsWith("/chat")) return "chat";
  if (path.startsWith("/treino")) return "treino";
  return "hoje";
}

/** a página da seção em que o endereço está: o começo mais longo que casa */
export function subFor(path: string): SubItem | undefined {
  const items = SUB[tabFor(path)] || [];
  let best: SubItem | undefined, len = -1;
  for (const it of items) {
    for (const p of [it.path, ...(it.also || [])]) {
      const hit = p.endsWith("/") ? path.startsWith(p) : path === p || path.startsWith(p + "/");
      if (hit && p.length > len) { best = it; len = p.length; }
    }
  }
  return best;
}
