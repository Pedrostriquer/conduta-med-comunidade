/* Perfil (visão geral): quem estuda e para qual prova, os totais desde que criou a conta, a atividade de cada dia
   (estilo GitHub), os sinais vitais e quem vê o seu perfil. Desempenho, Editar perfil e Ajustes são as outras páginas da
   seção (na barra lateral e nas abas do celular). No celular não há barra lateral, por isso só lá aparece a lista "Mais". */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useBank } from "../../data/bank";
import { useStore } from "../../state/store";
import { useStats } from "../../state/stats";
import { useCardsByDay } from "../../state/goals";
import { MORE, PATH } from "../../app/nav";
import { useChatOn } from "../chat/status";
import { Page, Section } from "../../app/Page";
import { Button } from "../../ds/basics";
import { Vitals } from "../../ds/medical";
import type { Vital } from "../../ds/medical";
import { Icon } from "../../ds/Icon";
import { useRegular } from "../../lib/hooks";
import { addDays, cap, dayKey, diffDays, num, pace, plural, relativeDay, today } from "../../lib/format";
import { Heatmap } from "./Heatmap";
import { LogoutButton } from "../auth/Logout";
import { useDecks } from "../flashcards/decks";
import { useMe } from "../comunidade/me";
import { Avatar, semestreLabel, sinceLabel } from "../comunidade/parts";
import { useRequests } from "../pessoas/requests";

export const initialsOf = (name: string) => (name || "Você").trim().split(/\s+/).map((x) => x[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
export const handleFrom = (name: string) => (name || "estudante").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 24) || "estudante";

export function PerfilPage() {
  const nav = useNavigate();
  const bank = useBank()!;
  const st = useStats(bank);
  const settings = useStore((s) => s.settings), plan = useStore((s) => s.plan), sessions = useStore((s) => s.sessions), attempts = useStore((s) => s.attempts);
  const me = useMe();
  const chatOn = useChatOn(!!me);
  const regular = useRegular();
  const requests = useRequests((s) => s.count);
  const { due: cardsDue } = useDecks();
  const cardsByDay = useCardsByDay();
  const t = today();
  const goal = plan ? plan.meta : settings.metaDiaria;
  const name = me?.name || settings.nome || "";
  const handle = me?.handle || handleFrom(name);
  // o servidor soma desde que a conta existe; o que acabou de ser feito neste aparelho pode ainda não ter chegado lá
  const totalQuestions = Math.max(me?.totalQuestions || 0, st.total);
  const totalCards = useMemo(() => { let n = 0; cardsByDay.forEach((v) => { n += v; }); return Math.max(me?.totalCards || 0, n); }, [cardsByDay, me?.totalCards]);

  // sinais vitais: últimas 8 semanas
  const vitals = useMemo<Vital[]>(() => {
    const weeks = Array.from({ length: 8 }, (_, i) => { const end = addDays(t, -7 * (7 - i)); return Array.from({ length: 7 }, (_, d) => addDays(end, -d)); });
    const sum = (ks: string[], m: Map<string, number>) => ks.reduce((s, k) => s + (m.get(k) || 0), 0);
    const acc = weeks.map((w) => { const n = sum(w, st.activity); return n ? Math.round((sum(w, st.correctByDay) / n) * 100) : 0; });
    const perDay = weeks.map((w) => Math.round(sum(w, st.activity) / 7));
    const paceW = weeks.map((w) => {
      const set = new Set(w); let ms = 0, n = 0;
      for (const a of attempts) { if (a.choice && a.ms > 3000 && a.ms < 900000 && set.has(dayKey(a.at))) { ms += a.ms; n++; } }
      return n ? Math.round(ms / n / 1000) : 0;
    });
    const last7 = Array.from({ length: 7 }, (_, d) => addDays(t, -d)), n7 = sum(last7, st.activity);
    return [
      { label: "Acerto", value: Math.round(st.accuracy * 100), unit: "%", goal: 70, trend: acc.filter(Boolean), note: plural(st.total, "resposta", "respostas") },
      { label: "Ritmo", value: Math.round(st.paceSec), display: st.paceSec ? pace(st.paceSec) : "—", unit: "por questão", trend: paceW.filter(Boolean), note: "tempo médio, 14 dias" },
      { label: "Por dia", value: Math.round(n7 / 7), unit: "questões", goal, trend: perDay, note: "média dos últimos 7 dias" },
      { label: "Sequência", value: st.streak, unit: st.streak === 1 ? "dia" : "dias", trend: undefined, note: `maior: ${plural(st.longest, "dia", "dias")}` },
    ];
  }, [st, attempts, t, goal]);

  const sims = Object.values(sessions).filter((s) => s.kind === "simulado" && s.status === "finalizada").sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0)).slice(0, 3);
  const daysLeft = plan ? diffDays(t, plan.data) : null;
  const line = me ? [me.faculdade, semestreLabel(me), me.cidade].filter(Boolean).join(" · ") : "";

  return (
    <Page title="Perfil" subtitle={me?.email} actions={<LogoutButton />}>
      <section className="panel pf-me">
        <Avatar name={name} url={me?.avatarUrl} size={regular ? 64 : 52} />
        <div className="pf-me__text">
          <h2 className="pf-me__name">{name || "Seu perfil"}</h2>
          <p className="pf-me__handle">@{handle}{me ? <> · no Conduta Med desde {sinceLabel(me.createdAt)}</> : null}</p>
          {line ? <p className="pf-me__handle">{line}</p> : null}
          {me?.bio ? <p className="pf-me__bio">{me.bio}</p> : null}
        </div>
        <Button variant="gray" size="sm" icon="eye" onClick={() => nav("/u/" + handle)}>Ver como os outros veem</Button>
        <div className="pf-me__target">
          <Icon name="target" size={18} />
          {plan ? <span><b>{plan.exame}</b> · {cap(relativeDay(plan.data))}{daysLeft != null && daysLeft > 0 ? <> · faltam <b className="num">{num(daysLeft)}</b> {daysLeft === 1 ? "dia" : "dias"}</> : null}</span>
            : <span>Sem prova-alvo. <button type="button" className="sec__link" onClick={() => nav("/cronograma/novo")}>Montar cronograma</button></span>}
        </div>
        <dl className="pf-me__stats">
          <div><dt>{totalQuestions === 1 ? "questão feita" : "questões feitas"}</dt><dd className="num">{num(totalQuestions)}</dd></div>
          <div><dt>{totalCards === 1 ? "flashcard revisado" : "flashcards revisados"}</dt><dd className="num">{num(totalCards)}</dd></div>
          <div><dt>{st.streak === 1 ? "dia seguido" : "dias seguidos"}</dt><dd className="num">{st.streak}</dd></div>
          <div><dt>maior sequência</dt><dd className="num">{st.longest}</dd></div>
        </dl>
      </section>

      {!regular ? (
        <Section title="Mais" className="cm-more-sec">
          <ul className="list">
            {MORE.filter((m) => (m.id !== "admin" || me?.role === "admin") && (m.id !== "chat" || chatOn)).map((m) => (
              <li key={m.id}><button type="button" className="row row--icon cd-hoverable" onClick={() => nav(PATH[m.id])}>
                <span className="row__icon"><Icon name={m.icon} size={20} /></span>
                <span className="row__main"><span className="row__title">{m.label}</span></span>
                <span className="row__end">
                  {m.id === "flashcards" && cardsDue ? <span className="num">{num(cardsDue)}</span> : null}
                  {m.id === "pessoas" && requests ? <span className="cm-count num" aria-label={plural(requests, "solicitação", "solicitações")}>{num(requests)}</span> : null}
                  <Icon name="chevron-right" size={18} className="row__chev" />
                </span>
              </button></li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="cols">
        <div className="cols__main">
          <Section title="Atividade">
            <div className="panel"><Heatmap activity={st.activity} correct={st.correctByDay} goal={goal} /></div>
          </Section>

          <Section title="Sinais vitais">
            <Vitals metrics={vitals} />
          </Section>

          {sims.length ? (
            <Section title="Últimos simulados">
              <ul className="list">
                {sims.map((s) => {
                  const counted = s.qids.filter((id) => !bank.byId[id]?.an), ok = counted.filter((id) => s.answers[id]?.choice === bank.byId[id]?.g).length, sc = ok / Math.max(1, counted.length);
                  return (
                    <li key={s.id}><button type="button" className="row cd-hoverable" onClick={() => nav("/resultado/" + s.id)}>
                      <span className={"hist__score num" + (sc >= 0.7 ? " is-ok" : "")}>{Math.round(sc * 100)}%</span>
                      <span className="row__main"><span className="row__title">{s.title}</span><span className="row__sub">{relativeDay(dayKey(s.finishedAt || s.createdAt))}</span></span>
                      <span className="row__end"><Icon name="chevron-right" size={18} className="row__chev" /></span>
                    </button></li>
                  );
                })}
              </ul>
            </Section>
          ) : null}
        </div>

        <aside className="cols__aside">
          <Section title="Quem vê seu perfil">
            <div className="panel pf-public">
              <p className="cm-who"><Icon name={WHO[me?.visibility || "publico"].icon} size={18} /><span><b>{WHO[me?.visibility || "publico"].label}</b>{WHO[me?.visibility || "publico"].hint}</span></p>
              {me ? (
                <ul className="cm-who__list">
                  <li>Total de questões e flashcards: <b>{me.showStats ? "aparece" : "escondido"}</b></li>
                  <li>Faculdade e semestre: <b>{me.showFaculdade ? "aparecem" : "escondidos"}</b></li>
                  <li>Gráfico de atividade: <b>{me.showStats && me.showActivity ? "aparece" : "escondido"}</b></li>
                  <li>Cronograma: <b>{me.sharePlan === "privado" ? "ninguém vê" : me.sharePlan === "seguidores" ? "seguidores" : "todos"}</b></li>
                </ul>
              ) : null}
              <p className="pf-hint">Sua porcentagem de acerto e seus sinais vitais são só seus: não aparecem para ninguém.</p>
            </div>
          </Section>
        </aside>
      </div>
    </Page>
  );
}

const WHO = {
  publico: { icon: "globe", label: "Público. ", hint: "Qualquer pessoa com conta." },
  seguidores: { icon: "users", label: "Só quem você aceitar. ", hint: "Na busca aparecem só nome e @." },
  privado: { icon: "lock", label: "Privado. ", hint: "Fora da busca e ninguém vê." },
} as const;
