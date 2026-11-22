/* No celular, as páginas da seção atual viram abas no topo (na barra lateral do desktop elas ficam abaixo da seção). */
import { useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { SubItem } from "./nav";

export function SubNav({ items, active }: { items: SubItem[]; active?: string }) {
  const nav = useNavigate();
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => { ref.current?.querySelector<HTMLElement>("[aria-current]")?.scrollIntoView({ block: "nearest", inline: "center" }); }, [active]);
  return (
    <nav ref={ref} className="subnav cd-root" aria-label="Páginas desta seção">
      {items.map((it) => (
        <button key={it.path} type="button" className="subnav__item" aria-current={it.path === active ? "page" : undefined} onClick={() => nav(it.path)}>{it.label}</button>
      ))}
    </nav>
  );
}
