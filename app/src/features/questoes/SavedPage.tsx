/* Questões salvas, anotadas e etiquetadas: as mais recentes primeiro, com a anotação e as etiquetas embaixo do trecho.
   Abrir resolve a questão; "Resolver salvas" vira uma lista. */
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { bodyOf, useBank, useBodies } from "../../data/bank";
import { useStore } from "../../state/store";
import { useStats } from "../../state/stats";
import { Page } from "../../app/Page";
import { Button, Chip, SegmentedControl } from "../../ds/basics";
import { useToast } from "../../ds/overlay";
import { Icon } from "../../ds/Icon";
import { dayKey, num, relativeDay } from "../../lib/format";
import { spring } from "../../lib/motion";
import { examTag, snippet } from "../busca/search";
import { SaveToggle, startFound } from "../busca/parts";
import { NoteSheet } from "../busca/NoteSheet";
import { tagLabel } from "../comunidade/tags";

type F = "todas" | "notas";

export function SavedPage() {
  const bank = useBank()!;
  const nav = useNavigate();
  const toast = useToast();
  const saved = useStore((s) => s.saved), notes = useStore((s) => s.notes), qtags = useStore((s) => s.qtags);
  const st = useStats(bank);
  const [f, setF] = useState<F>("todas");
  const [tag, setTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const lastNote = useRef<string | null>(null);
  if (editing) lastNote.current = editing;
  const noteQ = editing || lastNote.current; // mantém a folha montada enquanto fecha

  const all = useMemo(() => {
    const ids = new Set([...Object.keys(saved), ...Object.keys(notes), ...Object.keys(qtags)]);
    const when = (id: string) => Math.max(saved[id] || 0, notes[id]?.at || 0, qtags[id]?.at || 0);
    return [...ids].filter((id) => bank.byId[id]).sort((a, b) => when(b) - when(a));
  }, [saved, notes, qtags, bank]);
  const withNote = all.filter((id) => notes[id]);
  // as etiquetas em uso, as mais frequentes primeiro; a escolhida some do filtro se a última questão com ela sair
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of all) for (const t of qtags[id]?.tags || []) m.set(t, (m.get(t) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1] || tagLabel(a[0]).localeCompare(tagLabel(b[0]), "pt-BR"));
  }, [all, qtags]);
  const activeTag = tag && tagCounts.some(([t]) => t === tag) ? tag : null;
  const ids = (f === "notas" ? withNote : all).filter((id) => !activeTag || qtags[id]?.tags.includes(activeTag));

  // o trecho de cada questão vem do arquivo da prova dela; enquanto não chega, a linha mostra só a prova e o número
  const body = useBodies(ids);

  const open = (id: string) => nav("/sessao/" + startFound([id], "", { type: "salvas" }));
  const resolve = () => nav("/sessao/" + startFound(ids.slice(0, 100), activeTag ? `Etiqueta: ${tagLabel(activeTag)}` : f === "notas" ? "Questões anotadas" : "Questões salvas", { type: "salvas" }));
  const remove = (id: string) => {
    const prev = { at: saved[id], note: notes[id], tags: qtags[id] };
    useStore.getState().forget(id);
    useStore.getState().setTags(id, []);
    toast({
      text: "Questão removida.", icon: "trash", action: "Desfazer", duration: 5000,
      onAction: () => useStore.setState((s) => ({ saved: prev.at ? { ...s.saved, [id]: prev.at } : s.saved, notes: prev.note ? { ...s.notes, [id]: prev.note } : s.notes, qtags: prev.tags ? { ...s.qtags, [id]: prev.tags } : s.qtags })),
    });
  };

  return (
    <Page title="Salvas" subtitle="As questões que você salvou, anotou ou etiquetou." back={{ to: "/questoes", label: "Questões" }}
      actions={ids.length ? <Button variant="filled" icon="play" onClick={resolve}>Resolver {ids.length === 1 ? "esta" : ids.length > 100 ? "100" : `as ${num(ids.length)}`}</Button> : null}>
      {!all.length ? (
        <div className="empty">
          <Icon name="bookmark" size={22} />
          <p>Ao resolver, toque no marcador para salvar uma questão ou no bloco de notas para anotar. Elas ficam aqui para rever.</p>
          <Button variant="tinted" icon="search" onClick={() => nav("/busca")}>Buscar no banco</Button>
        </div>
      ) : (
        <>
          <div className="saved__bar">
            <SegmentedControl size="sm" aria-label="Quais" value={f} onChange={setF}
              options={[{ value: "todas", label: <>Todas <span className="seg-count num">{num(all.length)}</span></> }, { value: "notas", label: <>Com anotação <span className="seg-count num">{num(withNote.length)}</span></> }]} />
          </div>
          {tagCounts.length ? (
            <div className="chips chips--scroll saved__tags" role="group" aria-label="Filtrar por etiqueta">
              {tagCounts.map(([t, n]) => <Chip key={t} icon="tag" count={n} pressed={activeTag === t} onChange={() => setTag(activeTag === t ? null : t)}>{tagLabel(t)}</Chip>)}
            </div>
          ) : null}
          {!ids.length ? <div className="empty"><Icon name="note" size={22} /><p>{activeTag ? "Nenhuma questão anotada com esta etiqueta." : "Nenhuma questão anotada ainda. Na questão, toque no bloco de notas para escrever o que quer lembrar."}</p></div> : (
            <ul className="saved" aria-label="Questões salvas">
              <AnimatePresence initial={false}>
                {ids.map((id, i) => {
                  const q = bank.byId[id], note = notes[id], last = st.last.get(id), tags = qtags[id]?.tags;
                  return (
                    <motion.li key={id} layout className="saved__item" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { ...spring.smooth, delay: Math.min(i, 10) * 0.025 } }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.2 } }} transition={spring.smooth}>
                      <div className="hit cd-hoverable" role="button" tabIndex={0} onClick={() => open(id)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) open(id); }}>
                        <div className="hit__top">
                          <span className="hit__tag">{examTag(bank, q)} · Questão {q.n}</span>
                          {last ? <span className="hit__done" data-ok={last.correct ? "" : undefined}><Icon name={last.correct ? "check" : "x"} size={13} strokeWidth={2.5} />{last.correct ? "Acertou" : "Errou"}</span> : null}
                          <span className="hit__when">{relativeDay(dayKey(Math.max(saved[id] || 0, note?.at || 0, qtags[id]?.at || 0)))}</span>
                        </div>
                        <p className="hit__snip hit__snip--clamp" aria-busy={!bodyOf(id) && !body.error}>{bodyOf(id) ? snippet(bodyOf(id)!.e, [], 220) : body.error ? "Não foi possível carregar o texto desta questão." : "Carregando…"}</p>
                        {note ? <div className="saved__note" onClick={(e) => { e.stopPropagation(); setEditing(id); }}><Icon name="note" size={15} /><span>{note.text}</span></div> : null}
                        {tags?.length ? <div className="cm-tags saved__itemtags">{tags.map((t) => <span key={t} className="cm-tag"><Icon name="tag" size={14} />{tagLabel(t)}</span>)}</div> : null}
                        <div className="saved__acts" onClick={(e) => e.stopPropagation()}>
                          <Button variant="plain" size="sm" icon="note" onClick={() => setEditing(id)}>{note ? "Editar anotação" : "Anotar"}</Button>
                          {saved[id] ? <SaveToggle qid={id} size="sm" withLabel /> : null}
                          <Button variant="plain" size="sm" icon="trash" label="Remover" onClick={() => remove(id)} />
                        </div>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </>
      )}
      {noteQ ? <NoteSheet qid={noteQ} open={!!editing} onClose={() => setEditing(null)} subtitle={`${examTag(bank, bank.byId[noteQ])} · Questão ${bank.byId[noteQ].n}`} /> : null}
    </Page>
  );
}
