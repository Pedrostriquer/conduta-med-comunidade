/* Resultados: o histórico de simulados e listas, com a nota, a data e o tempo; ao lado, a evolução dos simulados. */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { useBank } from "../../data/bank";
import { BANCAS } from "../../data/types";
import { useStore } from "../../state/store";
import type { Session } from "../../state/store";
import { Page } from "../../app/Page";
import { Button, SegmentedControl } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { duration, num, plural, relativeDay, dayKey, shortDate } from "../../lib/format";
import { cx } from "../../lib/cx";
import { PickChip, bancaOrder } from "../questoes/filters";
import { score } from "./SimuladosPage";
import { sessionAnswers } from "../sessao/start";

type Kind = "todos" | "simulado" | "lista";

const kindLabel = (s: Session) => s.kind === "simulado" ? (s.feedback === "imediato" ? "Treino" : "Simulado") : s.source.type === "refazer" ? "Refazer erradas" : "Lista";

/** linha da evolução das notas dos simulados, do mais antigo ao mais novo, com a linha dos 70% */
function Trend({ values }: { values: number[] }) {
  if (values.length < 2) return <p className="rhist__empty">Faça mais um simulado para ver a evolução.</p>;
  const W = 300, H = 90, P = 8;
  const x = (i: number) => P + (i * (W - 2 * P)) / (values.length - 1), y = (v: number) => H - P - v * (H - 2 * P);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="rhist__trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Notas dos últimos ${values.length} simulados: ${values.map((v) => Math.round(v * 100) + "%").join(", ")}`}>
      <line x1={P} x2={W - P} y1={y(0.7)} y2={y(0.7)} className="rhist__goal" />
      <path d={d} className="rhist__line" />
      {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 4 : 2.5} className={cx("rhist__dot", i === values.length - 1 && "is-last")} />)}
    </svg>
  );
}

export function ResultadosPage() {
  const nav = useNavigate();
  const bank = useBank()!;
  const sessions = useStore((s) => s.sessions), attempts = useStore((s) => s.attempts);
  const [kind, setKind] = useState<Kind>("todos");
  const [bancas, setBancas] = useState<string[]>([]);
  const g = (id: string) => bank.byId[id]?.g;
  const sc = (s: Session) => score(s, g, sessionAnswers(s, attempts));
  const done = useMemo(() => Object.values(sessions).filter((s) => s.status === "finalizada" && s.qids.length).sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0)), [sessions]);
  const bancaOf = (s: Session) => (s.source.type === "simulado" || s.source.type === "prova" ? bank.examById[s.source.exam]?.banca : undefined);
  const rows = done.filter((s) => (kind === "todos" || s.kind === kind) && (!bancas.length || bancas.includes(bancaOf(s) || "")));
  const sims = done.filter((s) => s.kind === "simulado" && s.feedback === "final");
  const simScores = sims.map(sc);
  const avg = simScores.length ? simScores.reduce((a, b) => a + b, 0) / simScores.length : 0;
  const best = simScores.length ? Math.max(...simScores) : 0;
  const totalQ = done.reduce((s, x) => s + x.qids.length, 0);
  const present = [...new Set(done.map(bancaOf).filter(Boolean) as string[])];

  return (
    <Page title="Resultados" subtitle="Seus simulados e listas, do mais recente ao mais antigo." crumbs={[{ label: "Simulados", to: "/simulados" }]}>
      {!done.length ? (
        <div className="empty"><Icon name="chart" size={22} /><p>Quando você terminar um simulado ou uma lista, o resultado fica aqui.</p><Button variant="filled" onClick={() => nav("/simulados")}>Escolher uma prova</Button></div>
      ) : (
        <div className="cols">
          <div className="cols__main">
            <div className="qbar__chips">
              <SegmentedControl size="sm" aria-label="Tipo" value={kind} onChange={setKind} options={[{ value: "todos", label: "Todos" }, { value: "simulado", label: "Simulados" }, { value: "lista", label: "Listas" }]} />
              {present.length ? <PickChip label="Banca" options={bancaOrder(BANCAS, present).map((b) => ({ value: b, label: b }))} value={bancas} onChange={setBancas} /> : null}
            </div>
            <ul className="list rlist">
              {rows.map((s, i) => {
                const v = sc(s);
                return (
                  <motion.li key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: Math.min(i, 10) * 0.025, ease: [0.22, 1, 0.36, 1] }}>
                    <button type="button" className="row rrow cd-hoverable" onClick={() => nav("/resultado/" + s.id)}>
                      <span className={cx("hist__score num", v >= 0.7 && "is-ok")}>{Math.round(v * 100)}%</span>
                      <span className="row__main">
                        <span className="row__title">{s.title}</span>
                        <span className="row__sub">{kindLabel(s)} · {relativeDay(dayKey(s.finishedAt || s.createdAt))} · {plural(s.qids.length, "questão", "questões")} · {duration(s.elapsedMs / 1000)}</span>
                      </span>
                      <span className="row__end"><Icon name="chevron-right" size={18} className="row__chev" /></span>
                    </button>
                  </motion.li>
                );
              })}
              {!rows.length ? <li className="empty-row">Nada com esses filtros.</li> : null}
            </ul>
          </div>
          <aside className="cols__aside">
            <section className="panel rhist" aria-label="Resumo">
              <h2 className="qsum__title">Simulados</h2>
              <div className="rhist__tiles">
                <div><b className="num">{num(sims.length)}</b><span>feitos</span></div>
                <div><b className="num">{sims.length ? Math.round(avg * 100) + "%" : "—"}</b><span>média</span></div>
                <div><b className="num">{sims.length ? Math.round(best * 100) + "%" : "—"}</b><span>melhor</span></div>
              </div>
              <Trend values={simScores.slice(0, 12).reverse()} />
              {sims.length ? <p className="result__note">A linha marca 70%. Último em {shortDate(dayKey(sims[0].finishedAt || sims[0].createdAt))}.</p> : null}
              <p className="rhist__total">{plural(totalQ, "questão resolvida", "questões resolvidas")} em {plural(done.length, "sessão", "sessões")}.</p>
            </section>
          </aside>
        </div>
      )}
    </Page>
  );
}
