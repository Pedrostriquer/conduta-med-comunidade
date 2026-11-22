/* O perfil de uma pessoa: quem é, quanto já estudou (sem acerto e sem ranking) e o que ela escolheu compartilhar.
   Perfil travado mostra só o básico e o botão de seguir. No perfil próprio, a faixa avisa que é a visão dos outros;
   a API devolve tudo para a própria pessoa, por isso aqui se aplica o que ela escondeu. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { ApiError } from "../../api/client";
import type { DocNode, Me, PersonCard, PublicProfile, Relation, SharedPlan } from "../../api/types";
import { Page, Section } from "../../app/Page";
import { PHASES } from "../../data/plan";
import { Button } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Sheet, useToast } from "../../ds/overlay";
import { addDays, cap, diffDays, joinList, longDate, num, plural, shortDate, today, weekdayName, weekdayShort } from "../../lib/format";
import { spring } from "../../lib/motion";
import { DEFAULT_PREFS, useGoals } from "../../state/goals";
import type { PlanPrefs } from "../../state/goals";
import { useStore } from "../../state/store";
import type { Plan } from "../../state/store";
import { Heatmap } from "../perfil/Heatmap";
import { useMe } from "../comunidade/me";
import { Avatar, EmptyState, Loading, Problem, ReportSheet, semestreLabel, sinceLabel, useApi } from "../comunidade/parts";
import { DeckTile } from "../flashcards/SharedPage";
import { FollowButton, PersonTile } from "./parts";

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const fullDate = (k: string) => `${shortDate(k)} de ${k.slice(0, 4)}`;

/** o que os outros veem de você: a API não esconde nada da própria pessoa */
function asOthersSee(p: PublicProfile, me: Me): PublicProfile {
  return {
    ...p,
    faculdade: me.showFaculdade ? p.faculdade : null, semestre: me.showFaculdade ? p.semestre : null,
    stats: me.showStats && p.stats ? { ...p.stats, days: me.showActivity ? p.stats.days : [] } : null,
    decks: p.decks.filter((d) => d.visibility !== "link"),
    plan: me.sharePlan === "privado" ? null : p.plan,
  };
}

export function ProfilePage() {
  const { handle = "" } = useParams();
  return <ProfileView key={handle.toLowerCase()} handle={handle.replace(/^@/, "")} />;
}

function ProfileView({ handle }: { handle: string }) {
  const me = useMe();
  const nav = useNavigate();
  const toast = useToast();
  const loc = useLocation();
  const back = (loc.state as { back?: string } | null)?.back;
  const path = `/users/${encodeURIComponent(handle)}`;
  const { data, error, loading, reload, setData } = useApi<{ profile: PublicProfile }>(path);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState(false);
  const [people, setPeople] = useState<"followers" | "following" | null>(null);
  const menuBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => { if (e.type === "keydown" ? (e as KeyboardEvent).key === "Escape" : !menuBox.current?.contains(e.target as Node)) setMenu(false); };
    addEventListener("pointerdown", close); addEventListener("keydown", close);
    return () => { removeEventListener("pointerdown", close); removeEventListener("keydown", close); };
  }, [menu]);

  const raw = data?.profile;
  const self = raw?.relation === "eu";
  const profile = useMemo(() => (raw && self && me ? asOthersSee(raw, me) : raw), [raw, self, me]);
  const crumbs = [{ label: "Pessoas", to: "/pessoas" }];
  const backLink = back ? <div className="cm-backq"><button type="button" className="cm-link" onClick={() => nav(back)}><Icon name="chevron-left" size={16} />Voltar para onde você estava</button></div> : null;

  if (!raw) {
    const missing = (error as ApiError | null)?.status === 404;
    return (
      <Page title={missing ? "Perfil" : `@${handle}`} crumbs={crumbs}>
        {backLink}
        {missing ? <EmptyState icon="user" title="Não encontramos essa pessoa">O @ pode ter mudado ou o perfil pode ser privado.</EmptyState>
          : error ? <Problem error={error} onRetry={reload} />
          : loading ? <Loading label="Carregando o perfil" /> : null}
      </Page>
    );
  }
  const p = profile!;
  const setRelation = (relation: Relation) => {
    setData((d) => (d ? { profile: { ...d.profile, relation } } : d));
    // o que a pessoa vê pode mudar com a relação (ao deixar de seguir, por exemplo)
    if (relation === "nenhuma") reload();
  };
  const copyLink = async () => {
    setMenu(false);
    try { await navigator.clipboard.writeText(`${location.origin}/u/${p.handle}`); toast({ text: "Link do perfil copiado.", icon: "link", duration: 2400 }); }
    catch { toast({ text: `${location.origin}/u/${p.handle}`, icon: "link" }); }
  };
  const line = [p.faculdade, semestreLabel({ semestre: p.semestre, formado: !p.locked && p.formado })].filter(Boolean).join(" · ");
  const hasShared = p.decks.length > 0 || !!p.plan || p.docsCount > 0;

  return (
    <Page title={p.name} crumbs={crumbs}>
      {backLink}
      {self ? (
        <div className="cm-mine">
          <span><Icon name="eye" size={18} />{p.visibility === "privado" ? "Seu perfil está privado: só você vê esta página." : p.visibility === "seguidores" ? "É assim que seus seguidores veem seu perfil. Para os outros, só nome e @." : "É assim que os outros veem seu perfil."}</span>
          <button type="button" className="sec__link" onClick={() => nav("/perfil/editar")}>Editar perfil</button>
        </div>
      ) : null}

      <motion.section className="panel cm-prof" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}>
        <Avatar name={p.name} url={p.avatarUrl} size={72} className="cm-prof__av" />
        <div className="cm-prof__text">
          <h2 className="cm-prof__name">{p.name}</h2>
          <div className="cm-prof__handle">@{p.handle}{p.followsYou ? <span className="cd-badge">Segue você</span> : null}</div>
          {line ? <div className="cm-prof__line">{line}</div> : null}
          {!p.locked ? <div className="cm-prof__line">{[p.cidade, `No Conduta Med desde ${sinceLabel(p.since)}`].filter(Boolean).join(" · ")}</div> : null}
          {p.bio ? <p className="cm-prof__bio">{p.bio}</p> : null}
        </div>
        <div className="cm-prof__acts" ref={menuBox}>
          <FollowButton size="md" handle={p.handle} name={p.name} relation={p.relation} onChange={setRelation} />
          {!p.locked || !self ? <Button variant="plain" icon="more" label="Mais opções" aria-expanded={menu} onClick={() => setMenu((m) => !m)} /> : null}
          {menu ? (
            <div className="cm-menu" role="menu">
              <button type="button" role="menuitem" onClick={copyLink}><Icon name="link" size={18} />Copiar link do perfil</button>
              {!self ? <button type="button" role="menuitem" onClick={() => { setMenu(false); setReport(true); }}><Icon name="alert" size={18} />Denunciar perfil</button> : null}
            </div>
          ) : null}
        </div>
        {!p.locked ? (
          <div className="cm-prof__nums">
            <button type="button" onClick={() => setPeople("followers")}><b className="num">{num(p.followers)}</b> {p.followers === 1 ? "seguidor" : "seguidores"}</button>
            <button type="button" onClick={() => setPeople("following")}><b className="num">{num(p.following)}</b> seguindo</button>
          </div>
        ) : null}
      </motion.section>

      {p.locked ? (
        <p className="cm-locked"><Icon name="lock" size={18} />
          <span>{p.relation === "pendente" ? `Você pediu para seguir. Se ${firstName(p.name)} aceitar, o perfil aparece aqui.` : `Este perfil só aparece para quem ${firstName(p.name)} aceitar. Peça para seguir.`}</span>
        </p>
      ) : (
        <>
          {p.stats ? (
            <div className="cm-tiles">
              <div className="cm-tile"><b className="num">{num(p.stats.questions)}</b><small>{p.stats.questions === 1 ? "questão feita" : "questões feitas"} desde que criou a conta</small></div>
              <div className="cm-tile"><b className="num">{num(p.stats.cards)}</b><small>{p.stats.cards === 1 ? "flashcard revisado" : "flashcards revisados"} desde que criou a conta</small></div>
            </div>
          ) : null}
          <Shared p={p} handle={p.handle} self={!!self} onDeck={(slug, subscribed) => setData((d) => (d ? { profile: { ...d.profile, decks: d.profile.decks.map((x) => (x.slug === slug ? { ...x, subscribed, subscribers: x.subscribers + (subscribed ? 1 : -1) } : x)) } } : d))} />
          {!hasShared && !self ? <p className="cm-hint">{firstName(p.name)} ainda não compartilhou baralhos, cronograma ou resumos com você.</p> : null}
        </>
      )}

      <ReportSheet open={report} onClose={() => setReport(false)} targetKind="user" targetId={p.handle} title={`Denunciar ${p.name}`} />
      <PeopleSheet handle={p.handle} dir={people} onClose={() => setPeople(null)} />
    </Page>
  );
}

/* ---------- o que a pessoa compartilhou ---------- */
function Shared({ p, handle, self, onDeck }: { p: PublicProfile; handle: string; self: boolean; onDeck: (slug: string, subscribed: boolean) => void }) {
  const docs = useApi<{ nodes: DocNode[] }>(p.docsCount > 0 ? `/users/${encodeURIComponent(handle)}/docs` : null);
  const nodes = useMemo(() => (docs.data?.nodes || []).filter((n) => !self || n.visibility !== "privado" || n.sharedByParent), [docs.data, self]);
  const activity = useMemo(() => new Map((p.stats?.days || []).map((d) => [d.day, d.n])), [p.stats]);
  const left = (
    <>
      {p.stats?.days.length ? (
        <Section title="Atividade">
          <div className="panel"><Heatmap activity={activity} unit={["questão ou card", "questões e cards"]} maxWeeks={26} /></div>
        </Section>
      ) : null}
      {p.decks.length ? (
        <Section title="Baralhos">
          <div className="grid-auto" style={{ "--min": "260px" } as React.CSSProperties}>
            {p.decks.map((d) => <DeckTile key={d.id} d={d} onSubscribed={(on) => onDeck(d.slug, on)} />)}
          </div>
        </Section>
      ) : null}
      {p.docsCount > 0 ? (
        <Section title="Resumos">
          {docs.error ? <Problem error={docs.error} onRetry={docs.reload} />
            : !docs.data ? <Loading label="Carregando os resumos" />
            : !nodes.length ? <p className="cm-hint">Nenhum resumo compartilhado.</p>
            : <div className="panel"><DocsTree nodes={nodes} handle={handle} /></div>}
        </Section>
      ) : null}
    </>
  );
  if (!p.plan) return <div className="cols__main cm-mt">{left}</div>;
  return (
    <div className="cols cm-mt">
      <div className="cols__main">{left}</div>
      <aside className="cols__aside">
        <Section title="Cronograma"><PlanCard plan={p.plan} owner={p.name} self={self} /></Section>
      </aside>
    </div>
  );
}

function DocsTree({ nodes, handle }: { nodes: DocNode[]; handle: string }) {
  const nav = useNavigate();
  const ids = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const kids = useMemo(() => {
    const m = new Map<string | null, DocNode[]>();
    for (const n of nodes) { const k = n.parentId && ids.has(n.parentId) ? n.parentId : null; m.set(k, [...(m.get(k) || []), n]); }
    for (const xs of m.values()) xs.sort((a, b) => a.position - b.position);
    return m;
  }, [nodes, ids]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const render = (parent: string | null) => (
    <ul className="cm-tree">
      {(kids.get(parent) || []).map((n) => (
        <li key={n.id}>
          {n.kind === "pasta" ? (
            <>
              <button type="button" className="cm-tree__row cd-hoverable" aria-expanded={!!open[n.id]} onClick={() => setOpen((o) => ({ ...o, [n.id]: !o[n.id] }))}>
                <Icon name="chevron-right" size={16} className="cm-tree__chev" /><Icon name="folder" size={18} /><span>{n.title || "Sem título"}</span>
              </button>
              {open[n.id] ? render(n.id) : null}
            </>
          ) : (
            <button type="button" className="cm-tree__row cd-hoverable" onClick={() => nav(`/u/${handle}/resumos/${n.id}`)}>
              <Icon name="doc" size={18} /><span>{n.title || "Sem título"}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
  return render(null);
}

/* ---------- cronograma ---------- */
function daysText(dias: number[]) {
  if (dias.length === 7) return "Todos os dias";
  const order = [...dias].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  return joinList(order.map((d) => weekdayShort(d)));
}
function simText(s: SharedPlan["simulado"] | null | undefined) {
  if (!s || s.freq === "nenhum") return "Sem simulados";
  const dia = weekdayName(s.dia);
  const artigo = s.dia === 0 || s.dia === 6 ? "no" : "na";
  return s.freq === "semanal" ? `Toda semana, ${artigo} ${dia}` : `A cada 15 dias, ${artigo} ${dia}`;
}
function perDayText(plan: SharedPlan) {
  const prefs = { ...DEFAULT_PREFS, ...(plan.prefs || {}) } as PlanPrefs;
  if (prefs.ritmo === "horas") return "Varia com as horas de cada dia";
  if (prefs.ritmo === "dia") return `Cerca de ${num(plan.meta)}, varia por dia`;
  return `${num(plan.meta)} por dia`;
}

function PlanCard({ plan, owner, self }: { plan: SharedPlan; owner: string; self: boolean }) {
  const [using, setUsing] = useState(false);
  const prefs = { ...DEFAULT_PREFS, ...(plan.prefs || {}) } as PlanPrefs;
  const total = plan.inicio && plan.data ? Math.max(1, diffDays(plan.inicio, plan.data)) : 0;
  const [a, b] = prefs.fases;
  const until = [a, b, 1].map((f) => (total ? addDays(plan.inicio, Math.round(total * f)) : ""));
  const shares = [a, b - a, 1 - b];
  const past = !!plan.data && plan.data < today();
  const extra = prefs.bancas.filter((x) => x !== plan.banca);
  return (
    <div className="panel cm-plan">
      <div className="cm-plan__head">
        <span className="cm-plan__exam">{plan.exame || plan.banca || "Prova"}</span>
        {plan.data ? <span className="cm-plan__date">{cap(longDate(plan.data, true))}</span> : null}
      </div>
      <dl className="cm-plan__facts">
        <div><dt>Dias de estudo</dt><dd>{plan.dias.length ? daysText(plan.dias) : "—"}</dd></div>
        <div><dt>Questões</dt><dd>{perDayText(plan)}</dd></div>
        <div><dt>Simulados</dt><dd>{simText(plan.simulado)}</dd></div>
        {extra.length ? <div><dt>Outras bancas</dt><dd>{joinList(extra)}</dd></div> : null}
      </dl>
      {total ? (
        <div className="cm-phases">
          <div className="cm-phases__bar" aria-hidden>{PHASES.map((ph, i) => <i key={ph.id} style={{ flex: `${Math.max(shares[i], 0.04)} 1 0` }} />)}</div>
          <ul className="cm-phases__list">
            {PHASES.map((ph, i) => <li key={ph.id}><b>{ph.name}</b><span>até {shortDate(until[i])}</span></li>)}
          </ul>
        </div>
      ) : null}
      {!self ? (
        <div className="cm-plan__foot">
          <Button variant="tinted" disabled={past} onClick={() => setUsing(true)}>{past ? "A data desta prova já passou" : "Usar este cronograma"}</Button>
        </div>
      ) : null}
      <UsePlanSheet open={using} onClose={() => setUsing(false)} plan={plan} owner={owner} />
    </div>
  );
}

/** mostra o que muda e só troca o cronograma depois de confirmar */
function UsePlanSheet({ open, onClose, plan, owner }: { open: boolean; onClose: () => void; plan: SharedPlan; owner: string }) {
  const nav = useNavigate();
  const toast = useToast();
  const mine = useStore((s) => s.plan);
  const inicio = plan.inicio > today() ? plan.inicio : today();
  const rows: { label: string; old: string; next: string }[] = [
    { label: "Prova", old: mine?.exame || "—", next: plan.exame || plan.banca },
    { label: "Data", old: mine ? fullDate(mine.data) : "—", next: plan.data ? fullDate(plan.data) : "—" },
    { label: "Começa", old: mine ? shortDate(mine.inicio) : "—", next: shortDate(inicio) },
    { label: "Dias", old: mine ? daysText(mine.dias) : "—", next: daysText(plan.dias) },
    { label: "Questões", old: mine ? `${num(mine.meta)} por dia` : "—", next: perDayText(plan) },
    { label: "Simulados", old: mine ? simText(mine.simulado) : "—", next: simText(plan.simulado) },
  ];
  const apply = () => {
    const next: Plan = {
      banca: plan.banca, exame: plan.exame, data: plan.data, inicio, dias: plan.dias, meta: plan.meta, simulado: plan.simulado || { freq: "nenhum", dia: 6 },
      ajustes: {}, resolvidoAte: null, criadoEm: Date.now(),
    };
    useStore.getState().setPlan(next);
    // plantões e férias são da vida da outra pessoa
    if (plan.prefs) useGoals.getState().setPrefs(next, { ...plan.prefs, plantoes: [], pausas: [] });
    onClose();
    toast({ text: "Agora este é o seu cronograma.", icon: "check" });
    nav("/cronograma");
  };
  return (
    <Sheet open={open} onClose={onClose} title={mine ? "Trocar o seu cronograma?" : "Usar este cronograma?"} subtitle={`O cronograma de ${owner} passa a ser o seu. Dá para ajustar depois.`} width={560}
      footer={<><Button variant="gray" onClick={onClose}>Cancelar</Button><Button variant="filled" onClick={apply}>{mine ? "Substituir o meu" : "Usar este"}</Button></>}>
      <table className="cm-diff">
        <thead><tr><th scope="col"><span className="cd-sr">O quê</span></th>{mine ? <th scope="col">Hoje</th> : null}<th scope="col">Fica assim</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}><th scope="row">{r.label}</th>{mine ? <td>{r.old}</td> : null}<td data-changed={mine && r.old !== r.next ? "" : undefined}>{r.next}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="cm-note">Suas questões feitas e seu histórico continuam. Os plantões e as férias de {firstName(owner)} não vêm junto{mine ? ", e o cronograma atual é substituído" : ""}.</p>
    </Sheet>
  );
}

/* ---------- seguidores e seguindo ---------- */
function PeopleSheet({ handle, dir, onClose }: { handle: string; dir: "followers" | "following" | null; onClose: () => void }) {
  const last = useRef(dir);
  if (dir) last.current = dir;
  const { data, error, reload, setData } = useApi<{ people: PersonCard[] }>(dir ? `/users/${encodeURIComponent(handle)}/${dir}` : null);
  const people = data?.people;
  return (
    <Sheet open={!!dir} onClose={onClose} title={last.current === "followers" ? "Seguidores" : "Seguindo"} subtitle={people ? plural(people.length, "pessoa", "pessoas") : undefined} width={520}>
      {error ? <Problem error={error} onRetry={reload} />
        : !people ? <Loading />
        : !people.length ? <p className="cm-hint">Ninguém por aqui ainda.</p>
        : (
          <div className="cm-sheetlist">
            {people.map((p) => <PersonTile key={p.handle} p={p} onRelation={(r) => setData((d) => (d ? { people: d.people.map((x) => (x.handle === p.handle ? { ...x, relation: r } : x)) } : d))} />)}
          </div>
        )}
    </Sheet>
  );
}
