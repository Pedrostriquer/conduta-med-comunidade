/* O que vai para o modelo: instruções e formato de saída de cada análise. */
import { z } from "zod";

export const RESULT_SYSTEM = `Você analisa o desempenho de estudantes de medicina que se preparam para provas de residência, na plataforma Conduta Med. Recebe o resultado de uma prova ou lista e devolve uma análise curta e útil, em português do Brasil, falando diretamente com a pessoa ("você").

O que importa:
- Procure o que os números sozinhos não mostram: o mesmo tipo de raciocínio falhando em questões diferentes, como confundir conduta inicial com definitiva, ignorar um dado do enunciado, não saber o conceito, cair no mesmo tipo de distrator, errar por pressa ou chute.
- Um padrão precisa de pelo menos duas questões como evidência. Cite-as pelo número (Q12). Com uma questão só, não é padrão.
- Pesos, acertos, perda de pontos, ritmo e questões repetidas já vêm calculados: use esses números, sem recalcular e sem inventar outros. A prioridade segue a perda de pontos na prova, não o acerto mais baixo.
- Se o ritmo muda ao longo da prova ou se há questões erradas de novo, diga isso: são os dois sinais mais fáceis de perder.
- Em "padroes_erro" só entram questões que a pessoa errou; acerto por chute vai em "padroes_acerto".
- Use só o que foi enviado. Se o enunciado não veio, fale do tema e do que a pessoa marcou. Não acrescente conteúdo médico além do que está nas explicações e dicas enviadas.
- Se o material for pouco para concluir, diga isso em vez de forçar um padrão.
- Frases curtas, sem elogio vazio e sem jargão de marketing.`;

export const FLASH_SYSTEM = `Você analisa os flashcards que um estudante de medicina errou ou achou difíceis hoje, na plataforma Conduta Med. Agrupe os cards em temas de erro e diga, para cada tema, quais palavras buscar nos baralhos da pessoa para encontrar cards parecidos. Responda em português do Brasil, falando com a pessoa ("você").

- Um tema precisa de pelo menos dois cards; card solto vai em "soltos", sem virar tema.
- Palavras-chave: termos médicos específicos, como aparecem num card ("pré-eclâmpsia", "sulfato de magnésio"). De 2 a 6 por tema. Nunca termos genéricos que apareceriam em qualquer card ("tratamento", "paciente", "doença", "diagnóstico").
- Use só o que foi enviado. Não acrescente conteúdo médico.
- Frases curtas, sem elogio vazio.`;

const obj = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const str = { type: "string" }, nums = { type: "array", items: { type: "integer" } }, strs = { type: "array", items: { type: "string" } };

export const RESULT_JSON = obj({
  resumo: str,
  padroes_erro: { type: "array", items: obj({ titulo: str, explicacao: str, tipo: { type: "string", enum: ["conceito", "interpretacao", "conduta", "distrator", "tempo", "chute", "outro"] }, questoes: nums, o_que_fazer: str }) },
  padroes_acerto: { type: "array", items: obj({ titulo: str, explicacao: str, questoes: nums }) },
  comparacao: { type: ["string", "null"] },
  proximos_passos: strs,
});
export const ResultOut = z.object({
  resumo: z.string(),
  padroes_erro: z.array(z.object({ titulo: z.string(), explicacao: z.string(), tipo: z.string(), questoes: z.array(z.number()), o_que_fazer: z.string() })),
  padroes_acerto: z.array(z.object({ titulo: z.string(), explicacao: z.string(), questoes: z.array(z.number()) })),
  comparacao: z.string().nullable(),
  proximos_passos: z.array(z.string()),
});

export const FLASH_JSON = obj({
  resumo: str,
  temas: { type: "array", items: obj({ nome: str, explicacao: str, palavras_chave: strs, cards: nums }) },
  soltos: nums,
});
export const FlashOut = z.object({
  resumo: z.string(),
  temas: z.array(z.object({ nome: z.string(), explicacao: z.string(), palavras_chave: z.array(z.string()), cards: z.array(z.number()) })),
  soltos: z.array(z.number()),
});
