/* Página com título grande. Ao rolar, o título passa para a barra de vidro no topo (como no iOS).
   Acima do título, a trilha de onde você está (Simulados › ENARE 2026 › Resultado), com cada nível clicável;
   no celular ela vira só o "‹ nível anterior". */
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useScrolledPast } from "../lib/hooks";
import { Icon } from "../ds/Icon";
import { cx } from "../lib/cx";
import { MORE, NAV, PATH, tabFor } from "./nav";

export type Crumb = { label: ReactNode; to?: string };

/** a trilha padrão de uma página interna: a seção a que ela pertence */
function defaultCrumbs(path: string): Crumb[] | null {
  const sec = tabFor(path), root = PATH[sec];
  if (!root || path === root) return null;
  const item = [...NAV, ...MORE].find((i) => i.id === sec);
  return item ? [{ label: item.label, to: root }] : null;
}

export function Page({ title, subtitle, actions, back, crumbs, children, className }: {
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode;
  /** atalho para uma trilha de um nível só */
  back?: { to: string; label: string };
  /** os níveis acima desta página, do mais geral ao mais próximo (sem a própria página) */
  crumbs?: Crumb[];
  children: ReactNode; className?: string;
}) {
  const past = useScrolledPast(52);
  const nav = useNavigate();
  const { pathname } = useLocation();
  const trail = crumbs ?? (back ? [{ label: back.label, to: back.to }] : defaultCrumbs(pathname));
  const up = trail ? [...trail].reverse().find((c) => c.to) : undefined;
  const backBtn = up ? (
    <button type="button" className="backlink cd-hoverable" onClick={() => nav(up.to!)}><Icon name="chevron-left" size={20} strokeWidth={2} />{up.label}</button>
  ) : null;
  return (
    <div className={cx("page", className)}>
      <div className="topbar cd-root" data-on={past ? "" : undefined} aria-hidden={!past}>
        <div className="topbar__side">{backBtn}</div>
        <span className="topbar__title">{title}</span>
        <div className="topbar__side topbar__side--end">{actions}</div>
      </div>
      {trail?.length ? (
        <nav className="crumbs" aria-label="Você está em">
          <div className="crumbs__back">{backBtn}</div>
          <ol className="crumbs__trail">
            {trail.map((c, i) => (
              <li key={i}>
                {c.to ? <button type="button" className="crumbs__link cd-hoverable" onClick={() => nav(c.to!)}>{c.label}</button> : <span className="crumbs__text">{c.label}</span>}
                <Icon name="chevron-right" size={14} strokeWidth={2} className="crumbs__sep" />
              </li>
            ))}
            <li aria-current="page"><span className="crumbs__here">{title}</span></li>
          </ol>
        </nav>
      ) : null}
      <header className="page__head">
        <div className="page__titles">
          <h1 className="page__title">{title}</h1>
          {subtitle ? <p className="page__sub">{subtitle}</p> : null}
        </div>
        {actions ? <div className="page__actions">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function Section({ title, action, children, className, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={cx("sec", className)} id={id}>
      {title || action ? <div className="sec__head">{title ? <h2 className="sec__title">{title}</h2> : <span />}{action}</div> : null}
      {children}
    </section>
  );
}
