/* Assuntos: a lista dos assuntos que têm resumo, por grande área, com quantas questões cada um tem
   e quanto a pessoa já fez e acertou (pela última resposta de cada questão). */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { pool, useBank } from "../../data/bank";
import type { Bank } from "../../data/bank";
import { useAssuntos } from "../../data/assuntos";
import { AREAS } from "../../data/types";
import { useStore } from "../../state/store";
import { useStats } from "../../state/stats";
import type { Stats } from "../../state/stats";
import { Page } from "../../app/Page";
import { Button } from "../../ds/basics";
import { AREA_ICON, Icon } from "../../ds/Icon";
import { Pulse } from "../../ds/medical";
import { num, plural } from "../../lib/format";
import { MiniRing } from "../questoes/filters";

export type Progress = { ids: string[]; n: number; done: number; ok: number };

/** por assunto: as questões que entram (com as preferências), quantas a pessoa já fez e quantas acertou na última vez */
export function progressBySlug(bank: Bank, includeAll: boolean, st: Stats) {
  const m = new Map<string, Progress>();
  for (const q of pool(bank, includeAll)) {
    if (!q.as) continue;
    let p = m.get(q.as);
    if (!p) { p = { ids: [], n: 0, done: 0, ok: 0 }; m.set(q.as, p); }
    p.ids.push(q.id); p.n++;
    const a = st.last.get(q.id);
    if (a) { p.done++; if (a.correct) p.ok++; }
  }
  return m;
}

const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

export function AssuntosPage() {
  const nav = useNavigate();
  const bank = useBank()!;
  const st = useStats(bank);
  const inc = useStore((s) => s.settings.incluirTodas);
  const { data, error, retry } = useAssuntos();
  const [query, setQuery] = useState("");
  const prog = useMemo(() => progressBySlug(bank, inc, st), [bank, inc, st]);
  const q = norm(query.trim());
  const groups = useMemo(() => AREAS.map((a) => ({
    a, items: (data || []).filter((x) => x.area === a.id && (!q || norm(x.titulo).includes(q) || x.temas.some((t) => norm(t).includes(q))))
      .sort((x, y) => x.titulo.localeCompare(y.titulo, "pt-BR")),
  })).filter((g) => g.items.length), [data, q]);

  return (
    <Page title="Assuntos" subtitle="O resumo de cada assunto, do jeito que a prova cobra, com as questões dele.">
      {!data ? (
        <div className="empty" role="status">
          {error ? <><p>Não foi possível carregar os assuntos. Confira a conexão e tente de novo.</p><Button variant="gray" onClick={retry}>Tentar de novo</Button></> : <Pulse size={64} label="Carregando os assuntos" />}
        </div>
      ) : (
        <>
          <label className="search as-search">
            <Icon name="search" size={18} />
            <input type="search" placeholder="Buscar assunto" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar assunto" />
          </label>
          {groups.map(({ a, items }) => (
            <section key={a.id} className="as-group" aria-label={a.label}>
              <h2 className="as-group__title"><span className="as-group__icon" aria-hidden><Icon name={AREA_ICON[a.id]} size={17} /></span>{a.label}<span className="as-group__n num">{num(items.length)}</span></h2>
              <ul className="as-grid">
                {items.map((x) => {
                  const p = prog.get(x.slug) || { n: 0, done: 0, ok: 0 };
                  const all = p.n > 0 && p.done === p.n;
                  return (
                    <li key={x.slug}>
                      <button type="button" className="as-card cd-hoverable" onClick={() => nav("/assuntos/" + x.slug)}>
                        <MiniRing value={p.n ? p.done / p.n : 0} size={40} stroke={4} tone={all ? "success" : undefined} />
                        <span className="as-card__text">
                          <span className="as-card__title">{x.titulo}</span>
                          <span className="as-card__meta num">
                            {p.done
                              ? <>{num(p.done)} de {num(p.n)} feitas<span aria-hidden> · </span><b>{Math.round((p.ok / p.done) * 100)}%</b> de acerto</>
                              : plural(p.n, "questão", "questões")}
                          </span>
                        </span>
                        <Icon name="chevron-right" size={18} className="as-card__chev" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {!groups.length ? <div className="empty"><Icon name="search" size={22} /><p>Nenhum assunto com “{query}”.</p></div> : null}
        </>
      )}
    </Page>
  );
}
