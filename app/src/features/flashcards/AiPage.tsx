/* Gerar cards com IA a partir das questões que o aluno errou, sem precisar conectar nada:
   - copiar um prompt pronto com as erradas, colar a resposta da IA e revisar os rascunhos;
   - rascunho automático (sem IA), a partir do gabarito e do resumo da correção.
   Com a IA conectada (página Sua IA), ela cria direto, pedindo confirmação na conversa.
   Nada vira card sem o aluno aceitar; os aceitos vão para o baralho "Meus erros". */
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Page, Section } from "../../app/Page";
import { Badge, Button, Chip, SegmentedControl } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Sheet, useToast } from "../../ds/overlay";
import { useBank, bodyOf, fullQuestion, useBodies } from "../../data/bank";
import { AREAS } from "../../data/types";
import type { AreaId } from "../../data/types";
import { useStats } from "../../state/stats";
import { useStore } from "../../state/store";
import { num, plural, relativeDay, dayKey } from "../../lib/format";
import { spring } from "../../lib/motion";
import { ERR_DECK, acceptDrafts, useDrafts } from "./drafts";
import type { Draft } from "./drafts";
import { parseDelimited, questionCard, shortStem } from "./make";

const MAX = 30;

function buildPrompt(items: { id: string; title: string; e: string; a: Record<string, string>; g: string; mine: string | null; x?: string }[]) {
  const head = [
    "Você vai criar flashcards no estilo Anki para eu estudar para a prova de residência médica, a partir de questões que eu errei.",
    "Regras:",
    "- No máximo 2 cards por questão, só com o que me faria acertar uma questão parecida.",
    "- Frente curta e direta (uma pergunta ou uma lacuna {{c1::...}}); verso com a resposta e uma linha do porquê.",
    "- Use o gabarito e o resumo da correção abaixo. Não invente dados, doses nem critérios que não estejam neles.",
    "- Responda SÓ com linhas em TSV, sem cabeçalho e sem comentários: frente<TAB>verso<TAB>id da questão",
  ];
  const body = items.map((q) => [
    `### ${q.title} (id ${q.id})`,
    `Enunciado: ${q.e.replace(/\s+/g, " ").slice(0, 900)}`,
    `Alternativas: ${Object.entries(q.a).map(([k, v]) => `${k}) ${v}`).join(" | ")}`,
    `Gabarito: ${q.g} · Minha resposta: ${q.mine || "em branco"}`,
    q.x ? `Resumo da correção: ${q.x}` : "",
  ].filter(Boolean).join("\n"));
  return head.join("\n") + "\n\nQuestões:\n\n" + body.join("\n\n");
}

function DraftCard({ d, i }: { d: Draft; i: number }) {
  const bank = useBank();
  const { update, remove } = useDrafts.getState();
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const q = d.qid && bank ? bank.byId[d.qid] : undefined, ex = q && bank ? bank.examById[q.p] : undefined;
  return (
    <motion.li layout className="panel fc-draft" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { ...spring.smooth, delay: Math.min(0.2, i * 0.03) } }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.16 } }}>
      <div className="fc-draft__head">
        <Badge tone={d.origin === "ia" ? "accent" : "neutral"} icon={d.origin === "ia" ? "sparkle" : "bolt"}>{d.origin === "ia" ? "gerado por IA" : "rascunho automático"}</Badge>
        {ex && q ? <span className="fc-draft__src num">{ex.nome} · questão {q.n}</span> : null}
      </div>
      {edit ? (
        <div className="fc-draft__edit">
          <label className="fc-field"><span className="fc-field__label">Frente</span>
            <textarea className="fc-input fc-input--area fc-input--reading" rows={3} value={d.front} onChange={(e) => update(d.id, { front: e.target.value })} /></label>
          <label className="fc-field"><span className="fc-field__label">Verso</span>
            <textarea className="fc-input fc-input--area fc-input--reading" rows={3} value={d.back} onChange={(e) => update(d.id, { back: e.target.value })} /></label>
        </div>
      ) : (
        <div className="fc-draft__body">
          <p className="fc-draft__front">{d.front}</p>
          <p className="fc-draft__back">{d.back}</p>
        </div>
      )}
      <div className="fc-draft__acts">
        <Button variant="plain" size="sm" icon="trash" onClick={() => remove([d.id])}>Descartar</Button>
        <Button variant="gray" size="sm" icon={edit ? "check" : "pencil"} onClick={() => setEdit(!edit)}>{edit ? "Pronto" : "Editar"}</Button>
        <Button variant="filled" size="sm" icon="plus" disabled={!d.front.trim() || !d.back.trim()} onClick={async () => { const n = await acceptDrafts([d]); toast({ icon: "check", text: `${plural(n, "card", "cards")} em Meus erros` }); }}>Aceitar</Button>
      </div>
    </motion.li>
  );
}

export function AiPage() {
  const nav = useNavigate(), toast = useToast();
  const bank = useBank()!;
  const st = useStats(bank);
  const drafts = useDrafts((s) => s.drafts);
  const [periodo, setPeriodo] = useState<"7" | "30" | "tudo">("30");
  const [area, setArea] = useState<AreaId | "todas">("todas");
  const [promptOpen, setPromptOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [pasteMsg, setPasteMsg] = useState<string | null>(null);
  // vindo do Resultado (?sessao=): só as erradas (e em branco) daquela lista ou simulado
  const [sp, setSp] = useSearchParams();
  const sid = sp.get("sessao") || "";
  const session = useStore((x) => (sid ? x.sessions[sid] : undefined));
  const sessionWrong = useMemo(() => (session ? session.qids.filter((id) => bank.byId[id] && session.answers[id]?.choice !== bank.byId[id].g) : null), [session, bank]);

  const wrong = useMemo(() => {
    if (sessionWrong && session) {
      const at = session.finishedAt || session.createdAt;
      return sessionWrong
        .map((id) => ({ q: bank.byId[id], a: { choice: session.answers[id]?.choice ?? null, at: session.answers[id]?.at ?? at } }))
        .filter((x) => area === "todas" || x.q.area === area);
    }
    const since = periodo === "tudo" ? 0 : Date.now() - Number(periodo) * 86400000;
    return st.wrong
      .map((id) => ({ q: bank.byId[id], a: st.last.get(id)! }))
      .filter((x) => x.q && x.a && x.a.at >= since && (area === "todas" || x.q.area === area))
      .sort((a, b) => b.a.at - a.a.at);
  }, [st, bank, periodo, area, sessionWrong, session]);
  const pick = useMemo(() => wrong.slice(0, MAX), [wrong]);
  // enunciado, alternativas e explicação vêm do arquivo de cada prova: o pedido só fica pronto quando chegam
  const body = useBodies(useMemo(() => pick.map((x) => x.q.id), [pick]));
  const full = useMemo(() => (body.ready ? pick.flatMap(({ q, a }) => { const f = fullQuestion(q.id); return f ? [{ q: f, a }] : []; }) : []), [pick, body.ready]);
  const prompt = useMemo(() => buildPrompt(full.map(({ q, a }) => ({ id: q.id, title: `${bank.examById[q.p]?.nome || q.p} · questão ${q.n}`, e: q.e, a: q.a, g: q.g, mine: a.choice, x: q.x }))), [full, bank]);

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast({ icon: "clipboard", text: what + " copiado" }); return true; } catch { return false; }
  };
  const auto = () => {
    const n = useDrafts.getState().add(full.map(({ q }) => { const c = questionCard(q, bank.examById[q.p]); return { front: shortStem(q.e, 240), back: c.backText, qid: q.id, origin: "auto" as const }; }));
    toast({ icon: "bolt", text: n ? `${plural(n, "rascunho novo", "rascunhos novos")} na bandeja` : "Esses rascunhos já estão na bandeja" });
  };
  const fromPaste = () => {
    const { rows, skipped } = parseDelimited(paste);
    const n = useDrafts.getState().add(rows.map((r) => ({ front: r.front, back: r.back, qid: r.qid && bank.byId[r.qid] ? r.qid : undefined, origin: "ia" as const })));
    setPasteMsg(rows.length ? `${plural(n, "rascunho novo", "rascunhos novos")}${skipped ? `; ${plural(skipped, "linha ignorada", "linhas ignoradas")}` : ""}.` : "Não achei linhas no formato frente<TAB>verso. Peça para a IA responder só em TSV.");
    if (n) setPaste("");
  };

  return (
    <Page title="Gerar com IA" subtitle="Cards das questões que você errou. Você revisa cada rascunho antes de ele entrar no baralho.">
      <div className="fc-ai">
        <div className="fc-ai__main">
          <Section title="Das questões que errei">
            <div className="panel fc-gen">
              {session ? (
                <div className="fc-origin"><Badge tone="accent" icon={session.kind === "simulado" ? "exam" : "questions"}>{session.title}</Badge>
                  <span className="fc-help">Só as erradas e em branco desta {session.kind === "simulado" ? "prova" : "lista"}.</span>
                  <Button variant="plain" size="sm" onClick={() => setSp({}, { replace: true })}>Ver todas as erradas</Button></div>
              ) : null}
              <div className="fc-gen__filters">
                {!session ? <SegmentedControl size="sm" aria-label="Período" value={periodo} onChange={setPeriodo} options={[{ value: "7", label: "7 dias" }, { value: "30", label: "30 dias" }, { value: "tudo", label: "Tudo" }]} /> : null}
                <div className="chips" role="group" aria-label="Área">
                  <Chip pressed={area === "todas"} onChange={() => setArea("todas")}>Todas</Chip>
                  {AREAS.map((a) => <Chip key={a.id} pressed={area === a.id} onChange={() => setArea(a.id)}>{a.short}</Chip>)}
                </div>
              </div>
              {wrong.length ? (
                <>
                  <p className="fc-gen__count"><b className="num">{num(wrong.length)}</b> {wrong.length === 1 ? "questão errada" : "questões erradas"}{wrong.length > MAX ? ` · as ${MAX} ${session ? "primeiras" : "mais recentes"} entram no pedido` : ""}</p>
                  <ul className="fc-gen__list">
                    {pick.slice(0, 4).map(({ q, a }) => (
                      <li key={q.id}><span className="fc-gen__src num">{bank.examById[q.p]?.nome || q.p} · {q.n}</span><span className="fc-gen__stem">{bodyOf(q.id) ? shortStem(bodyOf(q.id)!.e, 120) : body.error ? "" : "Carregando…"}</span><span className="fc-gen__when">{relativeDay(dayKey(a.at))}</span></li>
                    ))}
                    {pick.length > 4 ? <li className="fc-gen__more">e mais {num(pick.length - 4)}</li> : null}
                  </ul>
                  {body.error ? <p className="fc-help" role="alert">Não foi possível carregar o texto das questões. <Button variant="plain" size="sm" onClick={body.retry}>Tentar de novo</Button></p> : null}
                  <div className="fc-gen__acts">
                    <Button variant="filled" icon="clipboard" disabled={!full.length} onClick={async () => { if (!(await copy(prompt, "Prompt"))) setPromptOpen(true); }}>Copiar prompt para a IA</Button>
                    <Button variant="gray" disabled={!full.length} onClick={() => setPromptOpen(true)}>Ver o prompt</Button>
                    <Button variant="plain" icon="bolt" disabled={!full.length} onClick={auto}>Rascunho automático, sem IA</Button>
                  </div>
                  <p className="fc-help">Cole o prompt no Claude, no ChatGPT ou na IA que você usa; a resposta vem em linhas que você cola aqui embaixo. Com a <Link to="/plugin">sua IA conectada</Link>, ela cria os cards direto, sem copiar nada.</p>
                </>
              ) : (
                <div className="fc-gen__empty">
                  <Icon name="check" size={22} />
                  <p>{st.wrong.length ? "Nenhuma questão errada neste período ou área." : "Você ainda não errou nenhuma questão. Quando errar, ela aparece aqui para virar card."}</p>
                  {!st.wrong.length ? <Button variant="tinted" onClick={() => nav("/questoes")}>Resolver questões</Button> : null}
                </div>
              )}
            </div>
          </Section>

          <Section title="Colar a resposta da IA">
            <div className="panel fc-paste">
              <textarea className="fc-input fc-input--area fc-input--mono" rows={5} value={paste} onChange={(e) => { setPaste(e.target.value); setPasteMsg(null); }}
                placeholder={"Uma linha por card: frente<TAB>verso<TAB>id da questão\nEx.: Antídoto do sulfato de magnésio?\tGluconato de cálcio\tENARE-2026-Q012"} aria-label="Resposta da IA" />
              <div className="fc-paste__foot">
                <span className="fc-help" role="status">{pasteMsg || "Aceita tabulação, ponto e vírgula ou vírgula."}</span>
                <Button variant="filled" disabled={!paste.trim()} onClick={fromPaste}>Transformar em rascunhos</Button>
              </div>
            </div>
          </Section>
        </div>

        <div className="fc-ai__tray">
          <Section title={<>Rascunhos {drafts.length ? <span className="fc-tray__n num">{num(drafts.length)}</span> : null}</>}
            action={drafts.length ? (
              <div className="cd-row">
                <Button variant="plain" size="sm" onClick={() => useDrafts.getState().remove(drafts.map((d) => d.id))}>Descartar todos</Button>
                <Button variant="tinted" size="sm" icon="plus" onClick={async () => { const n = await acceptDrafts(drafts.filter((d) => d.front.trim() && d.back.trim())); toast({ icon: "check", text: `${plural(n, "card", "cards")} em Meus erros`, action: "Abrir", onAction: () => nav("/flashcards/baralho/" + ERR_DECK) }); }}>Aceitar todos</Button>
              </div>
            ) : null}>
            {drafts.length ? (
              <ul className="fc-tray">
                <AnimatePresence initial={false}>{drafts.map((d, i) => <DraftCard key={d.id} d={d} i={i} />)}</AnimatePresence>
              </ul>
            ) : (
              <div className="fc-tray__empty"><Icon name="inbox" size={24} /><p>Os rascunhos aparecem aqui. Aceitos, vão para o baralho <b>Meus erros</b>, separados por área.</p></div>
            )}
          </Section>
        </div>
      </div>

      <Sheet open={promptOpen} onClose={() => setPromptOpen(false)} title="Prompt pronto" subtitle={`${plural(pick.length, "questão", "questões")}, até 2 cards por questão, resposta em TSV.`} width={680}
        footer={<div className="cd-row" style={{ justifyContent: "flex-end" }}><Button variant="gray" onClick={() => setPromptOpen(false)}>Fechar</Button><Button variant="filled" icon="clipboard" onClick={() => copy(prompt, "Prompt")}>Copiar</Button></div>}>
        <textarea className="fc-input fc-input--area fc-input--mono fc-prompt" readOnly value={prompt} rows={16} aria-label="Prompt" onFocus={(e) => e.currentTarget.select()} />
      </Sheet>
    </Page>
  );
}
