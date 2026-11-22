/* Pessoas: buscar colegas por nome, @ ou faculdade; quem você segue e quem segue você; pedidos para seguir.
   Seguir pede o aceite da outra pessoa e não traz notificação nem feed. */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { apiDelete, apiGet, apiPost } from "../../api/client";
import type { PersonCard, Relation } from "../../api/types";
import { Page } from "../../app/Page";
import { Button, SegmentedControl } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Dialog, useToast } from "../../ds/overlay";
import { num } from "../../lib/format";
import { spring } from "../../lib/motion";
import { useMe } from "../comunidade/me";
import { EmptyState, Loading, Problem, errText, relTime, useApi } from "../comunidade/parts";
import { PersonTile } from "./parts";
import { useRequests } from "./requests";
import type { FollowRequest } from "./requests";

const Enter = ({ i, children }: { i: number; children: React.ReactNode }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { ...spring.smooth, delay: Math.min(i, 10) * 0.025 } }}>{children}</motion.div>
);

export function PessoasPage() {
  const [sp, setSp] = useSearchParams();
  const [query, setQuery] = useState(sp.get("q") || "");
  const [q, setQ] = useState(query.trim());
  const [people, setPeople] = useState<PersonCard[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => setQ(query.trim()), 260); return () => clearTimeout(t); }, [query]);
  useEffect(() => { setSp(q ? { q } : {}, { replace: true }); }, [q]); // eslint-disable-line
  // o endereço mudou por fora (voltar, "Buscar pessoas" na barra lateral): a busca acompanha
  useEffect(() => { const x = sp.get("q") || ""; if (x !== q) { setQuery(x); setQ(x); } }, [sp.get("q")]); // eslint-disable-line
  useEffect(() => { if (!sp.get("q")) input.current?.focus(); }, []); // eslint-disable-line
  useEffect(() => {
    if (q.length < 2) { setPeople(null); setError(null); setLoading(false); return; }
    const ac = new AbortController();
    setLoading(true); setError(null);
    apiGet<{ people: PersonCard[] }>(`/users/search?q=${encodeURIComponent(q)}`, ac.signal).then(
      (r) => { setPeople(r.people); setLoading(false); },
      (e) => { if ((e as Error).name !== "AbortError") { setError(e); setPeople(null); setLoading(false); } },
    );
    return () => ac.abort();
  }, [q, tick]);
  const setRelation = (handle: string, relation: Relation) => setPeople((xs) => (xs || []).map((p) => (p.handle === handle ? { ...p, relation } : p)));

  return (
    <Page title="Pessoas" subtitle="Ache colegas, veja o que compartilham e peça para seguir.">
      <label className="search cm-search">
        <Icon name="search" size={18} />
        <input ref={input} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome, @usuario ou faculdade" aria-label="Buscar pessoas" autoComplete="off" spellCheck={false} />
      </label>
      {q.length < 2 ? (
        <p className="cm-hint">Procure pelo nome, pelo @ ou pela faculdade de alguém, com ou sem acento. Seguir pede o aceite da outra pessoa e não traz notificação nem feed: serve para ver o que ela compartilha só com seguidores.</p>
      ) : error ? <Problem error={error} onRetry={() => setTick((t) => t + 1)} />
        : loading && !people ? <Loading label="Buscando" />
        : people && !people.length ? <div className="cm-people"><EmptyState icon="users">Ninguém com “{q}”. Tente outra parte do nome ou a faculdade. Quem deixou o perfil privado não aparece na busca.</EmptyState></div>
        : people ? (
          <div className="grid-auto cm-people" style={{ "--min": "300px" } as React.CSSProperties} aria-live="polite">
            {people.map((p, i) => <Enter key={p.handle} i={i}><PersonTile p={p} onRelation={(r) => setRelation(p.handle, r)} /></Enter>)}
          </div>
        ) : null}
    </Page>
  );
}

type Tab = "seguindo" | "seguidores";

export function SeguindoPage() {
  const me = useMe();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("aba") as Tab) || "seguindo";
  const handle = me?.handle ? encodeURIComponent(me.handle) : null;
  const following = useApi<{ people: PersonCard[] }>(handle ? `/users/${handle}/following` : null);
  const followers = useApi<{ people: PersonCard[] }>(handle ? `/users/${handle}/followers` : null);
  const cur = tab === "seguindo" ? following : followers;
  const [removing, setRemoving] = useState<PersonCard | null>(null);
  const setRel = (api: typeof following, h: string, relation: Relation) => api.setData((d) => (d ? { people: d.people.map((p) => (p.handle === h ? { ...p, relation } : p)) } : d));
  const onRelation = (h: string, r: Relation) => {
    setRel(followers, h, r);
    if (tab === "seguindo" && r !== "seguindo") following.setData((d) => (d ? { people: d.people.filter((p) => p.handle !== h) } : d));
    else setRel(following, h, r);
  };
  const removeFollower = async (p: PersonCard) => {
    try {
      await apiDelete(`/me/followers/${encodeURIComponent(p.handle)}`);
      followers.setData((d) => (d ? { people: d.people.filter((x) => x.handle !== p.handle) } : d));
      toast({ text: `${p.name} não segue mais você.`, icon: "check", duration: 2400 });
    } catch (e) { toast({ text: errText(e), icon: "alert" }); }
  };
  const list = cur.data?.people;
  return (
    <Page title="Seguindo" subtitle="Quem você segue e quem segue você." crumbs={[{ label: "Pessoas", to: "/pessoas" }]}>
      <div className="cm-tabs">
        <SegmentedControl<Tab> size="sm" aria-label="Lista" value={tab} onChange={(v) => setSp(v === "seguindo" ? {} : { aba: v }, { replace: true })} options={[
          { value: "seguindo", label: <>Seguindo{following.data ? <span className="seg-count num"> {num(following.data.people.length)}</span> : null}</> },
          { value: "seguidores", label: <>Seguidores{followers.data ? <span className="seg-count num"> {num(followers.data.people.length)}</span> : null}</> },
        ]} />
      </div>
      {cur.error ? <Problem error={cur.error} onRetry={cur.reload} />
        : !list ? <Loading />
        : !list.length ? (
          tab === "seguindo"
            ? <EmptyState icon="users">Você ainda não segue ninguém. Busque um colega em Pessoas e peça para seguir.</EmptyState>
            : <EmptyState icon="users">Ninguém segue você ainda. Quando alguém pedir, o pedido aparece em Solicitações.</EmptyState>
        ) : (
          <div className="grid-auto" style={{ "--min": "300px" } as React.CSSProperties}>
            {list.map((p, i) => (
              <Enter key={p.handle} i={i}>
                <PersonTile p={p} onRelation={(r) => onRelation(p.handle, r)}>
                  {tab === "seguidores" ? <Button variant="plain" size="sm" onClick={() => setRemoving(p)}>Tirar seguidor</Button> : null}
                </PersonTile>
              </Enter>
            ))}
          </div>
        )}
      <Dialog open={!!removing} onClose={() => setRemoving(null)} onConfirm={() => { if (removing) removeFollower(removing); }} title={`Tirar ${removing?.name || ""} dos seguidores?`} confirmLabel="Tirar" destructive>
        A pessoa não é avisada. Ela deixa de ver o que você compartilha só com seguidores.
      </Dialog>
    </Page>
  );
}

export function SolicitacoesPage() {
  const toast = useToast();
  const { data, error, reload, setData } = useApi<{ requests: FollowRequest[] }>("/me/follow-requests");
  // quem acabou de ser aceito fica na lista, com o botão de seguir de volta
  const [accepted, setAccepted] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const answer = async (p: FollowRequest, accept: boolean) => {
    setBusy(p.handle);
    try {
      await apiPost(`/me/follow-requests/${encodeURIComponent(p.handle)}`, { accept });
      if (accept) { setAccepted((a) => ({ ...a, [p.handle]: true })); toast({ text: `${p.name} agora segue você.`, icon: "check", duration: 2400 }); }
      else setData((d) => (d ? { requests: d.requests.filter((x) => x.handle !== p.handle) } : d));
      useRequests.getState().refresh();
    } catch (e) { toast({ text: errText(e), icon: "alert" }); } finally { setBusy(null); }
  };
  const list = data?.requests;
  return (
    <Page title="Solicitações" subtitle="Quem pediu para seguir você. Recusar não avisa a pessoa." crumbs={[{ label: "Pessoas", to: "/pessoas" }]}>
      {error ? <Problem error={error} onRetry={reload} />
        : !list ? <Loading />
        : !list.length ? <EmptyState icon="users">Nenhum pedido agora.</EmptyState>
        : (
          <div className="grid-auto" style={{ "--min": "320px" } as React.CSSProperties}>
            {list.map((p, i) => (
              <Enter key={p.handle} i={i}>
                {accepted[p.handle] ? (
                  <PersonTile p={p} hint="Agora segue você" onRelation={(r) => setData((d) => (d ? { requests: d.requests.map((x) => (x.handle === p.handle ? { ...x, relation: r } : x)) } : d))} />
                ) : (
                  <PersonTile p={p} hint={`Pediu ${relTime(p.at)}`}>
                    <Button variant="gray" size="sm" disabled={busy === p.handle} onClick={() => answer(p, false)}>Recusar</Button>
                    <Button variant="filled" size="sm" loading={busy === p.handle} onClick={() => answer(p, true)}>Aceitar</Button>
                  </PersonTile>
                )}
              </Enter>
            ))}
          </div>
        )}
    </Page>
  );
}
