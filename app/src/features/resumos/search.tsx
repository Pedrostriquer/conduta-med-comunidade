/* Busca nos resumos: título e texto, sem acento, com o trecho encontrado. */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../ds/Icon";
import { Pulse } from "../../ds/medical";
import { Marked } from "../busca/parts";
import { terms } from "../busca/search";
import { docsApi } from "./api";
import type { SearchHit } from "./api";
import { NodeGlyph, SharedMark } from "./parts";
import { nodeTitle } from "./tree";

export function useDocSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = q.trim();
  useEffect(() => {
    if (clean.length < 2) { setHits([]); setBusy(false); setError(null); return; }
    const ctl = new AbortController();
    setBusy(true);
    const t = setTimeout(() => {
      docsApi.search(clean, ctl.signal)
        .then((r) => { setHits(r); setError(null); })
        .catch((e: Error) => { if (e.name !== "AbortError") { setHits([]); setError(e.message); } })
        .finally(() => { if (!ctl.signal.aborted) setBusy(false); });
    }, 220);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [clean]);
  return { q, setQ, hits, busy, error, active: clean.length >= 2, clean };
}
export type DocSearch = ReturnType<typeof useDocSearch>;

export function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="search rs-search">
      <Icon name="search" size={18} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Buscar nos resumos" aria-label="Buscar nos resumos"
        onKeyDown={(e) => { if (e.key === "Escape" && value) { e.stopPropagation(); onChange(""); } }} />
      {value ? <button type="button" className="rs-search__x" aria-label="Limpar busca" onClick={() => onChange("")}><Icon name="x" size={16} /></button> : null}
    </label>
  );
}

export function SearchResults({ search, activeId }: { search: DocSearch; activeId?: string }) {
  const nav = useNavigate();
  const ts = terms(search.clean);
  if (search.busy && !search.hits.length) return <div className="center-pad rs-search__wait"><Pulse size={56} label="Buscando" /></div>;
  if (search.error) return <p className="rs-search__none">{search.error}</p>;
  if (!search.hits.length) return <p className="rs-search__none">Nada encontrado para “{search.clean}”.</p>;
  return (
    <ul className="rs-hits" aria-label="Resultados da busca">
      {search.hits.map((h) => {
        // o trecho vem como texto; se trouxer marcação, ela não passa
        const snip = (h.snippet || "").replace(/<[^>]*>/g, "");
        return (
          <li key={h.id}>
            <button type="button" className="rs-hit cd-hoverable" aria-current={h.id === activeId ? "page" : undefined} onClick={() => nav("/resumos/" + h.id)}>
              <span className="rs-hit__glyph"><NodeGlyph node={h} /></span>
              <span className="rs-hit__main">
                <span className="rs-hit__title"><Marked text={nodeTitle(h)} ts={ts} /><SharedMark node={h} /></span>
                {snip ? <span className="rs-hit__snip"><Marked text={snip} ts={ts} /></span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
