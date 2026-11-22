/* Etiquetas da pessoa nas questões. As que a IA põe vêm como `erro:diagnostico`; na tela aparecem legíveis. */
const ACENTOS: Record<string, string> = {
  diagnostico: "diagnóstico", atencao: "atenção", distracao: "distração", interpretacao: "interpretação", calculo: "cálculo", memoria: "memória",
  duvida: "dúvida", enunciado: "enunciado", conduta: "conduta", conhecimento: "conhecimento", tratamento: "tratamento", leitura: "leitura", conceito: "conceito",
  tempo: "tempo", exame: "exame", exames: "exames", fisiopatologia: "fisiopatologia", epidemiologia: "epidemiologia", farmaco: "fármaco", farmacos: "fármacos", prognostico: "prognóstico",
  estatistica: "estatística", classificacao: "classificação", definicao: "definição", indicacao: "indicação", complicacao: "complicação", prevencao: "prevenção", chute: "chute",
};

function words(s: string) {
  return s.split(/[_\-\s]+/).filter(Boolean).map((w) => ACENTOS[w.toLowerCase()] || w).join(" ");
}

/** `erro:diagnostico` vira "Falha: diagnóstico"; a etiqueta da própria pessoa fica como ela escreveu */
export function tagLabel(tag: string) {
  const m = /^(erro|falha):(.+)$/i.exec(tag);
  return m ? `Falha: ${words(m[2])}` : tag;
}

/** o que a pessoa digitou, pronto para guardar */
export const cleanTag = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 40);
