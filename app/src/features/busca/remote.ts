/* Pessoas e resumos na busca: vêm do servidor, com atraso e cancelando a consulta anterior, para não atrapalhar a busca
   de questões, que é local e instantânea. Sem rede, some sem aviso: as questões continuam funcionando. */
import { useEffect, useState } from "react";
import { apiGet } from "../../api/client";
import type { DocNode, PersonCard } from "../../api/types";

export type DocHit = DocNode & { snippet: string };
export type RemoteHits = { people: PersonCard[]; docs: DocHit[]; query: string };

export function useRemoteSearch(query: string, enabled = true, delay = 240): RemoteHits {
  const text = query.trim();
  const [hits, setHits] = useState<RemoteHits>({ people: [], docs: [], query: "" });
  useEffect(() => {
    if (!enabled || text.length < 2) { setHits({ people: [], docs: [], query: "" }); return; }
    const ac = new AbortController();
    const t = setTimeout(() => {
      const q = encodeURIComponent(text);
      apiGet<{ people: PersonCard[] }>(`/users/search?q=${q}`, ac.signal).then((r) => setHits((h) => ({ ...h, people: r.people, query: text })), () => {});
      apiGet<{ results: DocHit[] }>(`/docs/search?q=${q}`, ac.signal).then((r) => setHits((h) => ({ ...h, docs: r.results, query: text })), () => {});
    }, delay);
    return () => { clearTimeout(t); ac.abort(); };
  }, [text, enabled, delay]);
  return hits;
}
