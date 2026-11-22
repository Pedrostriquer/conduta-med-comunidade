/* Terminar de configurar a conta: perfil público, ajustes de estudo e fase. Usa a mesma validação da rota PATCH /api/me. */
import { z } from "zod";
import { env } from "../../env";
import { parse } from "../../http";
import { profilePatchSchema, updateProfile } from "../../lib/profile-store";
import { getRecord } from "../../records";
import type { Change } from "../../records";
import { settingsOf, saveIa } from "../data";
import { ToolError, writeTool } from "../define";

const LEVEL = z.enum(["publico", "seguidores", "privado"]);
const input = {
  nome: z.string().min(1).max(80).optional().describe("Nome que aparece no perfil."),
  usuario: z.string().optional().describe("Novo @usuario, sem o @. Letras minúsculas, números, ponto e sublinhado."),
  faculdade: z.string().max(120).nullable().optional().describe("Faculdade. null apaga."),
  semestre: z.number().int().min(1).max(12).nullable().optional().describe("Semestre, de 1 a 12. null apaga."),
  formado: z.boolean().optional().describe("true se já se formou."),
  cidade: z.string().max(80).nullable().optional().describe("Cidade. null apaga."),
  bio: z.string().max(500).optional().describe("Texto curto sobre a pessoa."),
  visibilidade: LEVEL.optional().describe("Quem vê o perfil. publico: tudo que a pessoa escolheu mostrar. seguidores: na busca só nome e @, o resto para quem ela aceitou. privado: fora da busca."),
  mostrar_estatisticas: z.boolean().optional().describe("Mostra os números de estudo no perfil."),
  mostrar_faculdade: z.boolean().optional().describe("Mostra a faculdade no perfil."),
  mostrar_atividade: z.boolean().optional().describe("Mostra o gráfico de atividade no perfil."),
  compartilhar_cronograma: LEVEL.optional().describe("Quem pode ver o cronograma: publico, seguidores ou privado."),
  fase: z.enum(["internato", "formado", "residente"]).optional().describe("Fase da pessoa."),
  meta_diaria: z.number().int().min(5).max(500).optional().describe("Meta de questões por dia para quem não tem cronograma."),
  correcao_listas: z.enum(["imediato", "final"]).optional().describe("Correção nas listas: a cada questão ou ao final."),
  correcao_simulados: z.enum(["imediato", "final"]).optional().describe("Correção nos simulados: a cada questão (Treino) ou ao final (Simulado)."),
  video: z.enum(["app", "youtube"]).optional().describe("Onde abre o vídeo da correção."),
  incluir_questoes_sem_video: z.boolean().optional().describe("Inclui questões sem vídeo e polêmicas nas listas."),
  cards_novos_por_dia: z.number().int().min(0).max(200).optional().describe("Cards novos por dia, para os baralhos sem valor próprio."),
};
type Input = { [K in keyof typeof input]?: z.infer<(typeof input)[K]> };

const PROFILE: Partial<Record<keyof Input, string>> = { nome: "name", usuario: "handle", faculdade: "faculdade", semestre: "semestre", formado: "formado", cidade: "cidade", bio: "bio", visibilidade: "visibility", mostrar_estatisticas: "showStats", mostrar_faculdade: "showFaculdade", mostrar_atividade: "showActivity", compartilhar_cronograma: "sharePlan" };
const SETTINGS: Partial<Record<keyof Input, string>> = { meta_diaria: "metaDiaria", correcao_listas: "feedbackLista", correcao_simulados: "feedbackSimulado", video: "video", incluir_questoes_sem_video: "incluirTodas", cards_novos_por_dia: "cardsNovosPorDia" };
const LABELS: Partial<Record<keyof Input, string>> = { nome: "Nome", usuario: "@usuario", faculdade: "Faculdade", semestre: "Semestre", formado: "Formado", cidade: "Cidade", bio: "Bio", visibilidade: "Quem vê o perfil", mostrar_estatisticas: "Mostrar números", mostrar_faculdade: "Mostrar faculdade", mostrar_atividade: "Mostrar atividade", compartilhar_cronograma: "Quem vê o cronograma", fase: "Fase", meta_diaria: "Meta diária", correcao_listas: "Correção nas listas", correcao_simulados: "Correção nos simulados", video: "Vídeo", incluir_questoes_sem_video: "Incluir questões sem vídeo", cards_novos_por_dia: "Cards novos por dia" };

const pickBy = (a: Input, map: Partial<Record<keyof Input, string>>) => Object.fromEntries(Object.entries(map).filter(([k]) => a[k as keyof Input] !== undefined).map(([k, col]) => [col, a[k as keyof Input]]));
const show = (v: unknown) => (v === null ? "(apagar)" : v === true ? "sim" : v === false ? "não" : String(v));

export const tools = [
  writeTool({
    name: "conduta_atualizar_perfil", title: "Atualizar perfil e ajustes", group: "Perfil", summary: "Preenche o perfil (faculdade, semestre, cidade, bio, quem vê o quê) e os ajustes de estudo.",
    description: "Use para terminar de configurar a conta com a pessoa: nome, @usuario, faculdade, semestre, cidade, bio, quem vê o quê, fase e ajustes de estudo (meta diária, correção, cards novos por dia). Passe só o que muda. Pergunte antes; não preencha por conta própria. Pede confirmação: a primeira chamada só mostra o que vai mudar. Foto, e-mail e senha só no app.",
    input,
    preview: async (a: Input, c) => {
      const lines = (Object.keys(LABELS) as (keyof Input)[]).filter((k) => a[k] !== undefined).map((k) => `${LABELS[k]}: ${show(a[k])}`);
      if (!lines.length) throw new ToolError("Diga o que mudar no perfil.");
      parse(profilePatchSchema, pickBy(a, PROFILE));
      return ["Atualizar no seu perfil:", ...lines, ...(c.mode === "compartilhado" && a.usuario ? ["Atenção: nas próximas entradas nesta conta compartilhada, use o @usuario novo."] : [])].join("\n");
    },
    apply: async (a: Input, c) => {
      const uid = c.user.id, now = Date.now(), profile = pickBy(a, PROFILE), settings = pickBy(a, SETTINGS), changes: Change[] = [];
      if (Object.keys(profile).length) await updateProfile(uid, profile);
      if (Object.keys(settings).length) changes.push({ c: "settings", id: "main", data: { ...(await settingsOf(uid)), ...settings }, at: now });
      if (a.fase) changes.push({ c: "study", id: "main", data: { bancas: [], prova: null, ...((await getRecord(uid, "study", "main")) as object | null), fase: a.fase }, at: now });
      if (changes.length) await saveIa(uid, changes);
      return { resumo: "perfil atualizado", data: { status: "atualizado", campos: Object.keys(a).filter((k) => a[k as keyof Input] !== undefined), link: `${env.publicUrl}/perfil/editar` } };
    },
  }),
];
