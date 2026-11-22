/* Navegação principal. No celular, a dock de vidro líquido do design system (a lente leva a seleção de uma aba
   à outra com mola física); no desktop, a barra lateral. Mesmos destinos, mesma ordem, mesmos nomes. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { reduceMotion, spring } from "../lib/motion";
import { num } from "../lib/format";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

export type NavItem = { id: string; label: string; icon: string; badge?: "dot" | number | string; count?: number };

const GLASS_OK = (() => { try { const u = navigator.userAgent; return /Chrome|Chromium|Edg\//.test(u) && !/Firefox|FxiOS/.test(u); } catch { return false; } })();
const glassMade: Record<string, boolean> = {};

/** mapa de refração gerado em canvas + filtro SVG (técnica do liquid-glass-react); só onde o navegador aplica */
function glassFilter(w: number, h: number, band: number, scale: number) {
  w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h));
  const id = `cd-glass-${w}x${h}-${band}`;
  if (!GLASS_OK) return null;
  if (glassMade[id]) return id;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d")!, img = ctx.createImageData(w, h), d = img.data, r = Math.min(w, h) / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + 0.5 - w / 2, py = y + 0.5 - h / 2;
    const qx = Math.abs(px) - (w / 2 - r), qy = Math.abs(py) - (h / 2 - r), ax = Math.max(qx, 0), ay = Math.max(qy, 0);
    const sdf = Math.min(Math.max(qx, qy), 0) + Math.sqrt(ax * ax + ay * ay) - r;
    const t = Math.max(0, Math.min(1, 1 + sdf / band)), k = t * t * (3 - 2 * t);
    let nx = qx > 0 || qy > 0 ? ((ax || 0) / (Math.sqrt(ax * ax + ay * ay) || 1)) * Math.sign(px) : 0;
    let ny = qx > 0 || qy > 0 ? ((ay || 0) / (Math.sqrt(ax * ax + ay * ay) || 1)) * Math.sign(py) : 0;
    if (!(qx > 0 || qy > 0)) { if (qx > qy) nx = Math.sign(px); else ny = Math.sign(py); }
    const i = (y * w + x) * 4;
    d[i] = 128 - nx * k * 127; d[i + 1] = 128 - ny * k * 127; d[i + 2] = 128; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const url = c.toDataURL(), NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.setAttribute("aria-hidden", "true"); svg.style.position = "absolute";
  const ch = (sel: string, s: number) => `<feDisplacementMap in="SourceGraphic" in2="m" scale="${s}" xChannelSelector="R" yChannelSelector="G" result="d${sel}"/>` +
    `<feColorMatrix in="d${sel}" type="matrix" values="${sel === "r" ? "1 0 0 0 0 0 0 0 0 0 0 0 0 0 0" : sel === "g" ? "0 0 0 0 0 0 1 0 0 0 0 0 0 0 0" : "0 0 0 0 0 0 0 0 0 0 0 0 1 0 0"} 0 0 0 1 0" result="c${sel}"/>`;
  svg.innerHTML = `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feImage href="${url}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="m"/>` +
    ch("r", scale * 1.1) + ch("g", scale) + ch("b", scale * 0.88) +
    `<feBlend in="cg" in2="cb" mode="screen" result="gb"/><feBlend in="cr" in2="gb" mode="screen"/></filter>`;
  document.body.appendChild(svg);
  glassMade[id] = true;
  return id;
}

function DockItems({ items, cur, clone, onPick }: { items: NavItem[]; cur: number; clone?: boolean; onPick?: (i: number) => void }) {
  return (
    <>
      {items.map((it, i) => {
        const on = i === cur, b = it.badge;
        const content = (
          <>
            <span className="cd-dock__icon">
              <Icon name={it.icon} size={24} strokeWidth={on || clone ? 2 : 1.75} />
              {b && !clone ? <span className="cd-dock__badge" data-kind={b === "dot" ? "dot" : typeof b === "number" ? "count" : "text"}>{b === "dot" ? null : typeof b === "number" && b > 99 ? "99+" : b}</span> : null}
            </span>
            <span className="cd-dock__label">{it.label}</span>
          </>
        );
        return clone
          ? <span key={it.id} className="cd-dock__item">{content}</span>
          : <button key={it.id} type="button" className="cd-dock__item" data-i={i} aria-current={on ? "page" : undefined}
              aria-label={it.label + (typeof b === "number" ? `, ${b} novas` : b ? ", novidade" : "")} onClick={() => onPick?.(i)}>{content}</button>;
      })}
    </>
  );
}

export function Dock({ items, current, onChange, minimized }: { items: NavItem[]; current: string; onChange: (id: string) => void; minimized?: boolean }) {
  const n = items.length;
  const cur = Math.max(0, items.findIndex((i) => i.id === current));
  const dock = useRef<HTMLDivElement>(null), pill = useRef<HTMLSpanElement>(null), lens = useRef<HTMLSpanElement>(null);
  const clone = useRef<HTMLSpanElement>(null), refr = useRef<HTMLSpanElement>(null);
  const S = useRef({ x: 0, v: 0, target: 0, lift: 0, liftTo: 0, raf: 0, last: 0, active: false, drag: null as null | { x0: number; moved: boolean }, tapAt: 0, shown: cur, landing: cur });
  const G = useRef({ tw: 0, pad: 5, ext: 9, w: 0, h: 0 });
  const live = useRef({ items, current, onChange }); live.current = { items, current, onChange };

  const measure = () => {
    const el = dock.current; if (!el || !lens.current || !clone.current || !refr.current) return;
    const w = el.clientWidth, hh = el.clientHeight, g = G.current;
    g.w = w; g.h = hh; g.tw = (w - g.pad * 2) / n;
    const lw = g.tw + g.ext * 2, lh = hh + 14;
    lens.current.style.width = lw + "px"; clone.current.style.width = w + "px"; clone.current.style.height = hh + "px";
    const f = glassFilter(lw, lh, 14, 22); refr.current.style.filter = f ? `url(#${f})` : "";
  };
  const xFor = (i: number) => { const g = G.current; return g.pad + i * g.tw - g.ext; };
  const idxAt = (px: number) => { const g = G.current; return Math.max(0, Math.min(n - 1, Math.floor((px - g.pad) / g.tw))); };
  const placePill = (i: number) => { const g = G.current, p = pill.current; if (!p) return; p.style.width = g.tw + "px"; p.style.transform = `translateX(${g.pad + i * g.tw}px)`; };
  const paint = () => {
    const s = S.current, L = lens.current, C = clone.current; if (!L || !C || !dock.current) return;
    const st = Math.min(Math.abs(s.v) / 2400, 0.26), lf = 0.84 + 0.26 * s.lift;
    L.style.transform = `translateX(${s.x.toFixed(2)}px) scale(${(lf * (1 + st)).toFixed(4)},${(lf * (1 - st * 0.45)).toFixed(4)})`;
    L.style.setProperty("--fringe", (Math.min(1, Math.abs(s.v) / 1300) * 0.85 + 0.2 * s.lift).toFixed(3));
    C.style.transform = `translateX(${(-s.x).toFixed(2)}px)`;
    const g = G.current, lw = g.tw + g.ext * 2, sw = lw * lf * (1 + st);
    dock.current.style.setProperty("--lx", (s.x + lw / 2 - sw / 2).toFixed(1) + "px");
    dock.current.style.setProperty("--lw", sw.toFixed(1) + "px");
  };
  const land = () => { const s = S.current; s.active = false; s.shown = s.landing; placePill(s.landing); dock.current?.removeAttribute("data-moving"); };
  const tick = (t: number) => {
    const s = S.current, dt = s.last ? Math.min(0.034, (t - s.last) / 1000) : 0.016; s.last = t;
    const k = 540, c = 2 * Math.sqrt(k) * 0.66, a = -k * (s.x - s.target) - c * s.v;
    s.v += a * dt; s.x += s.v * dt;
    s.lift += (s.liftTo - s.lift) * Math.min(1, dt * 16);
    paint();
    if (!s.drag && Math.abs(s.x - s.target) < 0.5 && Math.abs(s.v) < 10) {
      if (s.liftTo > 0) { s.liftTo = 0; land(); }
      if (s.lift < 0.02) { s.raf = 0; s.last = 0; return; }
    }
    s.raf = requestAnimationFrame(tick);
  };
  const lift = () => {
    const s = S.current;
    if (!s.active) { s.x = xFor(s.shown); s.v = 0; s.lift = Math.max(s.lift, 0); }
    s.active = true; s.liftTo = 1; dock.current?.setAttribute("data-moving", "");
    if (!s.raf) { s.last = 0; s.raf = requestAnimationFrame(tick); }
  };
  const go = (i: number, notify: boolean) => {
    const s = S.current; s.landing = i;
    if (reduceMotion() || !G.current.tw) { s.shown = i; placePill(i); }
    else { lift(); s.target = xFor(i); }
    const L = live.current;
    if (notify && L.items[i].id !== L.current) L.onChange(L.items[i].id);
  };

  useLayoutEffect(() => { measure(); placePill(cur); S.current.shown = cur; S.current.landing = cur; paint(); }, []); // eslint-disable-line
  useEffect(() => {
    const ro = window.ResizeObserver ? new ResizeObserver(() => { measure(); if (!S.current.active) placePill(S.current.shown); }) : null;
    if (dock.current) ro?.observe(dock.current);
    return () => { ro?.disconnect(); cancelAnimationFrame(S.current.raf); };
  }, []); // eslint-disable-line
  useEffect(() => { if (S.current.landing !== cur && !S.current.drag) go(cur, false); }, [cur]); // eslint-disable-line

  const down = (e: React.PointerEvent) => {
    if (e.button > 0) return;
    measure();
    const s = S.current, r = dock.current!.getBoundingClientRect(), px = e.clientX - r.left, g = G.current;
    s.drag = { x0: e.clientX, moved: false };
    if (reduceMotion()) return;
    lift(); s.target = Math.max(-g.ext, Math.min(g.w - g.tw - g.pad - g.ext, px - g.tw / 2 - g.ext)); s.landing = idxAt(px);
    try { dock.current!.setPointerCapture(e.pointerId); } catch { /* sem captura */ }
  };
  const move = (e: React.PointerEvent) => {
    const s = S.current; if (!s.drag || reduceMotion()) return;
    const r = dock.current!.getBoundingClientRect(), px = e.clientX - r.left, g = G.current;
    if (Math.abs(e.clientX - s.drag.x0) > 6) s.drag.moved = true;
    s.target = Math.max(-g.ext, Math.min(g.w - g.tw - g.pad - g.ext, px - g.tw / 2 - g.ext)); s.landing = idxAt(px);
  };
  const up = (e: React.PointerEvent) => {
    const s = S.current; if (!s.drag) return;
    const r = dock.current!.getBoundingClientRect(), i = idxAt(e.clientX - r.left);
    s.drag = null; s.tapAt = performance.now(); go(i, true);
    dock.current!.querySelector<HTMLElement>(`.cd-dock__row:not(.cd-dock__row--clone) [data-i="${i}"]`)?.focus({ preventScroll: true });
  };
  const pick = (i: number) => { if (performance.now() - S.current.tapAt < 450) return; go(i, true); };
  const keys = (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!d) return;
    e.preventDefault(); const i = (S.current.landing + d + n) % n; go(i, true);
    dock.current!.querySelector<HTMLElement>(`.cd-dock__row:not(.cd-dock__row--clone) [data-i="${i}"]`)?.focus();
  };

  return (
    <nav className="cd-tabbar cd-root ui-tabbar" aria-label="Principal">
      <div ref={dock} className="cd-dock" data-min={minimized ? "" : undefined} style={{ "--n": n } as React.CSSProperties}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={keys}>
        <span className="cd-dock__glass" aria-hidden />
        <span ref={pill} className="cd-dock__pill" aria-hidden />
        <div className="cd-dock__row"><DockItems items={items} cur={cur} onPick={pick} /></div>
        <span ref={lens} className="cd-dock__lens" aria-hidden>
          <span ref={refr} className="cd-lens__refract" />
          <span className="cd-lens__tint" />
          <span ref={clone} className="cd-dock__row cd-dock__row--clone"><DockItems items={items} cur={cur} clone /></span>
          <span className="cd-lens__rim" />
        </span>
      </div>
    </nav>
  );
}

type SubLink = { label: string; path: string };

/** quais seções estão abertas na barra lateral. Abrir é automático ao entrar na seção; fechar é com o clique da pessoa.
    No máximo MAX_OPEN ficam abertas: ao abrir mais uma, fecha a que foi aberta há mais tempo (nunca a seção atual). */
const MAX_OPEN = 2;
function useOpenSections(current: string) {
  const KEY = "conduta-side-open";
  const cap = (ids: string[], keep: string) => {
    const out = ids.slice();
    while (out.length > MAX_OPEN) { const i = out.findIndex((x) => x !== keep && x !== current); if (i < 0) break; out.splice(i, 1); }
    return out;
  };
  // guardado em ordem de abertura (a mais antiga primeiro); `closed` lembra o que a pessoa fechou de propósito
  const [st, setSt] = useState<{ ids: string[]; closed: string[] }>(() => {
    let ids: string[] = [], closed: string[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (Array.isArray(raw.ids)) { ids = raw.ids; closed = Array.isArray(raw.closed) ? raw.closed : []; }
      else { ids = Object.keys(raw).filter((k) => raw[k]); closed = Object.keys(raw).filter((k) => !raw[k]); }   // formato antigo
    } catch { /* sem armazenamento: começa do zero */ }
    if (!ids.includes(current) && !closed.includes(current)) ids = [...ids, current];
    return { ids: cap(ids, current), closed };
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSt((o) => (o.ids.includes(current) ? o : { ids: cap([...o.ids, current], current), closed: o.closed.filter((x) => x !== current) }));
  }, [current]);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* sem armazenamento */ } }, [st]);
  const toggle = (id: string) => setSt((o) => (o.ids.includes(id)
    ? { ids: o.ids.filter((x) => x !== id), closed: [...o.closed.filter((x) => x !== id), id] }
    : { ids: cap([...o.ids, id], id), closed: o.closed.filter((x) => x !== id) }));
  const open: Record<string, boolean> = Object.fromEntries(st.ids.map((i) => [i, true]));
  return { open, toggle };
}

export function Sidebar({ items, groups, current, onChange, footer, top, subs, activeSub, onGo }: {
  items: NavItem[]; groups: { label: string; ids: string[] }[]; current: string; onChange: (id: string) => void; footer?: React.ReactNode; top?: React.ReactNode;
  /** as páginas de cada seção: a lista fica aberta até a pessoa fechar */
  subs?: Record<string, SubLink[]>; activeSub?: string; onGo?: (path: string) => void;
}) {
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const { open, toggle } = useOpenSections(current);
  return (
    <nav className="cd-side cd-root ui-side" aria-label="Principal">
      <div className="cd-side__brand"><Logo size={26} /></div>
      {top}
      {groups.map((g) => (
        <div key={g.label} className="cd-side__group">
          <div className="cd-side__label">{g.label}</div>
          {g.ids.map((id) => {
            const it = byId[id], on = id === current;
            if (!it) return null;
            const kids = subs?.[id] && subs[id].length > 1 ? subs[id] : null;
            const isOpen = !!kids && !!open[id];
            return (
              <div key={id} className="ui-side__sec" data-subs={kids ? "" : undefined}>
                <button type="button" className="cd-side__item cd-hoverable" aria-current={on ? "page" : undefined}
                  onClick={() => (on && kids ? toggle(id) : onChange(id))}>
                  {on ? <motion.span layoutId="ui-side-pill" className="ui-side__pill" transition={spring.snappy} aria-hidden /> : null}
                  <Icon name={it.icon} size={20} />{it.label}
                  {it.count != null ? <span className="cd-side__count">{num(it.count)}</span> : it.badge === "dot" ? <span className="ui-side__dot" aria-label="novidade" /> : null}
                </button>
                {kids ? (
                  <button type="button" className="ui-side__chev cd-hoverable" aria-expanded={isOpen} aria-label={`${isOpen ? "Recolher" : "Abrir"} ${it.label}`} onClick={() => toggle(id)}>
                    <Icon name="chevron-down" size={16} />
                  </button>
                ) : null}
                {isOpen ? (
                  <ul className="ui-side__sub" aria-label={`Páginas de ${it.label}`}>
                    {kids!.map((k) => (
                      <li key={k.path}>
                        <button type="button" className="ui-side__subitem cd-hoverable" aria-current={on && k.path === activeSub ? "page" : undefined} onClick={() => onGo?.(k.path)}>{k.label}</button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
      {footer ? <div className="ui-side__foot">{footer}</div> : null}
    </nav>
  );
}
