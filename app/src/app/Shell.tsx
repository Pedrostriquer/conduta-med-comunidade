import { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Dock, Sidebar } from "../ds/Dock";
import type { NavItem } from "../ds/Dock";
import { useRegular, useScrollDown } from "../lib/hooks";
import { useStore } from "../state/store";
import { useAuth } from "../state/auth";
import { useBank } from "../data/bank";
import { useStats } from "../state/stats";
import { buildSchedule, planStatus } from "../data/plan";
import { useDecks } from "../features/flashcards/decks";
import { MORE, NAV, PATH, SUB, subFor, tabFor } from "./nav";
import { SubNav } from "./SubNav";
import { CommandPalette, openPalette } from "../features/busca/CommandPalette";
import { Icon } from "../ds/Icon";
import { Kbd } from "../ds/basics";
import { Avatar } from "../features/comunidade/parts";
import { useRequests, useRequestsPoll } from "../features/pessoas/requests";
import { useFlashAuto } from "../features/analises/auto";
import { useChatOn } from "../features/chat/status";
import { LogoutButton } from "../features/auth/Logout";

export function Shell() {
  const regular = useRegular();
  const loc = useLocation(), nav = useNavigate();
  const sessions0 = useStore((s) => s.sessions);
  // o resultado de uma lista pertence a Questões; o de um simulado, a Simulados
  const resId = /^\/(?:resultado|correcao)\/([^/]+)/.exec(loc.pathname)?.[1];
  const current = resId && sessions0[resId]?.kind === "lista" ? "questoes" : tabFor(loc.pathname);
  const minimized = useScrollDown();
  const bank = useBank();
  const st = useStats(bank);
  const plan = useStore((s) => s.plan), sessions = useStore((s) => s.sessions);
  const { due } = useDecks();
  // pedidos para seguir: a bolinha fica em Pessoas e, no celular (sem barra lateral), em Perfil
  useRequestsPoll();
  const asked = useRequests((s) => s.count > 0);
  const items = useMemo<NavItem[]>(() => {
    const live = Object.values(sessions).some((s) => s.kind === "simulado" && s.status === "ativa");
    let behind = false;
    if (plan && bank) { const days = buildSchedule(plan, bank, st); const ps = planStatus(plan, days, st, sessions); behind = ps.behind > 0 || ps.missedSims.length > 0; }
    return NAV.map((i) => (i.id === "simulados" && live ? { ...i, badge: "dot" as const } : i.id === "cronograma" && behind ? { ...i, badge: "dot" as const } : i));
  }, [sessions, plan, bank, st]);
  const go = (id: string) => nav(PATH[id]);
  const subs = SUB[current] || [];
  const me = useAuth((s) => s.user);
  useFlashAuto();
  // a entrada do chat só aparece para quem tem o chat ligado
  const chatOn = useChatOn(!!me);
  const active = subFor(loc.pathname)?.path;
  return (
    <div className="app" data-layout={regular ? "side" : "dock"}>
      {regular ? (
        <Sidebar top={<button type="button" className="ui-side__search cd-hoverable" onClick={openPalette}><Icon name="search" size={18} />Buscar<Kbd>{/Mac/.test(navigator.platform) ? "⌘K" : "Ctrl K"}</Kbd></button>} items={[...items, ...MORE.map((m) => (m.id === "flashcards" ? { ...m, count: due || undefined } : m.id === "pessoas" && asked ? { ...m, badge: "dot" as const } : m))]} current={current} onChange={go}
          subs={SUB} activeSub={active} onGo={(p) => nav(p)}
          groups={[
            { label: "Estudar", ids: ["hoje", "questoes", "simulados", "assuntos", "flashcards", "resumos", "cronograma", "treino"] },
            { label: "Comunidade", ids: ["pessoas"] },
            { label: "Você", ids: [...(chatOn ? ["chat"] : []), "analises", "plugin", "suporte"] },
          ]}
          footer={me ? (
            <div className="ui-side__mewrap">
              <button type="button" className="ui-side__me cd-hoverable" aria-current={current === "perfil" ? "page" : undefined} onClick={() => go("perfil")}>
                <Avatar name={me.name} url={me.avatarUrl} size={36} />
                <span className="ui-side__me-txt"><b>{me.name}</b><small>@{me.handle}</small></span>
              </button>
              <LogoutButton compact />
            </div>
          ) : null} />
      ) : null}
      <main className="app-main">
        {(!regular || current === "perfil") && subs.length > 1 ? <SubNav items={subs} active={active} /> : null}
        <Outlet />
      </main>
      {bank ? <CommandPalette /> : null}
      {!regular ? <Dock items={asked ? items.map((i) => (i.id === "perfil" ? { ...i, badge: "dot" as const } : i)) : items} current={MORE.some((m) => m.id === current) ? "perfil" : current} onChange={go} minimized={minimized} /> : null}
    </div>
  );
}
