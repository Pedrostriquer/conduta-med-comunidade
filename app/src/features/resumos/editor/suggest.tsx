/* Os menus que abrem digitando: "/" para os blocos e "@" para achar uma questão do banco. */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Extension } from "@tiptap/core";
import type { Editor, Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";
import type { SuggestionProps } from "@tiptap/suggestion";
import { bodyOf, ensureBodies, getBank } from "../../../data/bank";
import type { Question } from "../../../data/types";
import { Icon } from "../../../ds/Icon";
import { examTag, norm, snippet, terms } from "../../busca/search";
import { searchQuestions } from "../../busca/questions";
import { Glyph } from "../glyphs";
import { CALLOUT_META, labelFor } from "./nodes";
import { CALLOUT_TONES } from "./sanitize";

type PopState<I> = { items: I[]; index: number; rect: DOMRect | null; query: string; pick: (i: I) => void };

/** o estado do menu fica fora do React porque quem manda é o editor */
export function createPop<I>() {
  let state: PopState<I> | null = null;
  const subs = new Set<() => void>();
  const set = (s: PopState<I> | null) => { state = s; subs.forEach((f) => f()); };
  const from = (p: SuggestionProps<I, I>, index: number): PopState<I> => ({ items: p.items, index, rect: p.clientRect?.() ?? null, query: p.query, pick: (i) => p.command(i) });
  return {
    get: () => state,
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
    choose: (i: number) => { if (state) set({ ...state, index: i }); },
    renderer: () => ({
      onStart: (p: SuggestionProps<I, I>) => set(from(p, 0)),
      onUpdate: (p: SuggestionProps<I, I>) => set(from(p, 0)),
      onExit: () => set(null),
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (!state) return false;
        const n = state.items.length;
        if (event.key === "ArrowDown" && n) { set({ ...state, index: (state.index + 1) % n }); return true; }
        if (event.key === "ArrowUp" && n) { set({ ...state, index: (state.index - 1 + n) % n }); return true; }
        if ((event.key === "Enter" || event.key === "Tab") && n) { state.pick(state.items[state.index]); return true; }
        return false;
      },
    }),
  };
}
export type Pop<I> = ReturnType<typeof createPop<I>>;

export function SuggestPopup<I>({ pop, label, render, keyOf, empty }: { pop: Pop<I>; label: string; render: (i: I) => ReactNode; keyOf: (i: I) => string; empty: (q: string) => ReactNode }) {
  const st = useSyncExternalStore(pop.subscribe, pop.get);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const rect = st?.rect;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !rect) { setPos(null); return; }
    const w = el.offsetWidth, h = el.offsetHeight, pad = 8;
    const left = Math.max(pad, Math.min(rect.left, innerWidth - w - pad));
    const top = rect.bottom + 6 + h > innerHeight - pad ? Math.max(pad, rect.top - h - 6) : rect.bottom + 6;
    setPos({ left, top });
  }, [rect, st?.items.length]);
  const idx = st?.index;
  useEffect(() => { box.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [idx]);
  if (!st) return null;
  return createPortal(
    <div ref={box} className="rs-pop rs-suggest cd-root" role="listbox" aria-label={label} style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }} onMouseDown={(e) => e.preventDefault()}>
      {st.items.length ? st.items.map((it, i) => (
        <button key={keyOf(it)} type="button" role="option" aria-selected={i === st.index} tabIndex={-1} className="rs-suggest__item" onMouseEnter={() => pop.choose(i)} onClick={() => st.pick(it)}>{render(it)}</button>
      )) : <p className="rs-suggest__none">{empty(st.query)}</p>}
    </div>,
    document.body,
  );
}

function suggestion<I>(o: { name: string; char: string; pop: Pop<I>; items: (q: string, editor: Editor) => I[] | Promise<I[]>; run: (e: Editor, r: Range, i: I) => void; allowSpaces?: boolean; debounce?: number }) {
  return Extension.create({
    name: o.name,
    addProseMirrorPlugins() {
      return [Suggestion<I, I>({
        editor: this.editor,
        pluginKey: new PluginKey(o.name),
        char: o.char,
        allowSpaces: o.allowSpaces,
        debounce: o.debounce,
        allow: ({ editor }) => !editor.isActive("codeBlock") && !editor.isActive("detailsSummary"),
        items: ({ query, editor }) => o.items(query, editor),
        command: ({ editor, range, props }) => o.run(editor, range, props),
        render: o.pop.renderer as never,
      })];
    },
  });
}

/* ---------- "/" ---------- */
export type SlashItem = { id: string; label: string; hint: string; keys: string; glyph?: string; icon?: string; text?: string; run: (e: Editor, r: Range) => void };

export function slashItems(ctx: { pickImage: () => void }): SlashItem[] {
  const chain = (e: Editor, r: Range) => e.chain().focus().deleteRange(r);
  return [
    { id: "p", label: "Texto", hint: "Parágrafo comum", keys: "paragrafo texto", glyph: "text", run: (e, r) => chain(e, r).setParagraph().run() },
    { id: "h1", label: "Título 1", hint: "Seção principal", keys: "titulo h1 cabecalho 1", text: "H1", run: (e, r) => chain(e, r).setHeading({ level: 1 }).run() },
    { id: "h2", label: "Título 2", hint: "Subseção", keys: "titulo h2 subtitulo 2", text: "H2", run: (e, r) => chain(e, r).setHeading({ level: 2 }).run() },
    { id: "h3", label: "Título 3", hint: "Detalhe da subseção", keys: "titulo h3 3", text: "H3", run: (e, r) => chain(e, r).setHeading({ level: 3 }).run() },
    { id: "ul", label: "Lista com marcadores", hint: "Itens sem ordem", keys: "lista marcadores bullet", glyph: "list", run: (e, r) => chain(e, r).toggleBulletList().run() },
    { id: "ol", label: "Lista numerada", hint: "Itens em sequência", keys: "lista numerada ordenada numeros", glyph: "list-ordered", run: (e, r) => chain(e, r).toggleOrderedList().run() },
    { id: "todo", label: "Lista de tarefas", hint: "Com caixa para marcar", keys: "tarefas checkbox todo fazer lista", glyph: "list-task", run: (e, r) => chain(e, r).toggleTaskList().run() },
    ...CALLOUT_TONES.map((t): SlashItem => ({ id: t, label: CALLOUT_META[t].label, hint: "Bloco colorido", keys: "bloco destaque callout aviso " + t, glyph: CALLOUT_META[t].glyph, icon: CALLOUT_META[t].icon, run: (e, r) => chain(e, r).wrapIn("callout", { tone: t }).run() })),
    { id: "details", label: "Bloco recolhível", hint: "Abre e fecha com um clique", keys: "recolhivel details toggle sanfona esconder", glyph: "details", run: (e, r) => chain(e, r).setDetails().updateAttributes("details", { open: true }).run() },
    { id: "quote", label: "Citação", hint: "Trecho destacado", keys: "citacao quote aspas", glyph: "quote", run: (e, r) => chain(e, r).toggleBlockquote().run() },
    { id: "table", label: "Tabela", hint: "3 linhas por 3 colunas", keys: "tabela colunas linhas table", glyph: "table", run: (e, r) => chain(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: "image", label: "Imagem", hint: "Do computador ou do celular", keys: "imagem foto figura upload", icon: "image", run: (e, r) => { chain(e, r).run(); ctx.pickImage(); } },
    { id: "question", label: "Questão do banco", hint: "Busque pelo número ou pelo texto", keys: "questao banco mencao prova", icon: "questions", run: (e, r) => { chain(e, r).run(); startQuestionSearch(e); } },
    { id: "hr", label: "Divisória", hint: "Linha entre partes", keys: "divisoria linha separador hr", glyph: "divider", run: (e, r) => chain(e, r).setHorizontalRule().run() },
    { id: "code", label: "Bloco de código", hint: "Texto em fonte fixa", keys: "codigo code bloco", glyph: "code-block", run: (e, r) => chain(e, r).setCodeBlock().run() },
  ];
}

export function slashExtension(pop: Pop<SlashItem>, ctx: { pickImage: () => void }) {
  const all = slashItems(ctx);
  return suggestion<SlashItem>({
    name: "slashMenu", char: "/", pop,
    items: (q) => {
      const ts = norm(q).split(/\s+/).filter(Boolean);
      return ts.length ? all.filter((i) => { const h = norm(i.label + " " + i.keys); return ts.every((t) => h.includes(t)); }) : all;
    },
    run: (e, r, i) => i.run(e, r),
  });
}

export function SlashRow({ item }: { item: SlashItem }) {
  return (
    <>
      <span className="rs-suggest__glyph">{item.text ? <b>{item.text}</b> : item.glyph ? <Glyph name={item.glyph} size={18} /> : <Icon name={item.icon!} size={18} />}</span>
      <span className="rs-suggest__main"><span className="rs-suggest__label">{item.label}</span><span className="rs-suggest__hint">{item.hint}</span></span>
    </>
  );
}

/* ---------- "@": questão do banco ---------- */
export type QuestionHit = { q: Question; tag: string; snip: string };

let lookup: AbortController | null = null;

/** pelo código, pela prova e número (do índice, na hora) e pelo texto (no servidor); cada chamada cancela a busca anterior */
export async function findQuestions(query: string): Promise<QuestionHit[]> {
  const t = query.trim();
  if (t.length < 1) return [];
  const bank = getBank();
  const out = new Map<string, Question>();
  const add = (q?: Question) => { if (q) out.set(q.id, q); };
  // pelo código: PROVA-2026-Q001
  const up = t.toUpperCase();
  add(bank.byId[up]);
  if (/^[A-Z-]+-\d/.test(up)) for (const q of bank.all) { if (q.id.startsWith(up)) { add(q); if (out.size >= 8) break; } }
  // pela prova e pelo número: "enare 2024 12"
  const ts = norm(t).split(/[\s·,]+/).filter(Boolean);
  const num = ts.length > 1 ? ts[ts.length - 1].replace(/^q/, "") : "";
  if (/^\d{1,3}$/.test(num)) {
    const rest = ts.slice(0, -1);
    for (const e of bank.exams) {
      const h = norm(`${e.nome} ${e.banca} ${e.ano}`);
      if (rest.every((x) => h.includes(x))) add(bank.byExam[e.id]?.find((q) => q.n === Number(num)));
      if (out.size >= 8) break;
    }
  }
  const st = terms(t);
  const snips = new Map<string, string>();
  lookup?.abort();
  const ac = (lookup = new AbortController());
  // pelo texto da questão; sem rede, ficam só as achadas pelo código ou pelo número
  if (out.size < 8 && t.length >= 3) {
    try {
      const r = await searchQuestions({ q: t, todas: true, limit: 8, trecho: 96 }, ac.signal);
      for (const h of r.hits) { if (out.size >= 8) break; if (!out.has(h.id) && bank.byId[h.id]) { add(bank.byId[h.id]); snips.set(h.id, h.text); } }
    } catch { /* cancelada ou sem rede */ }
  }
  // o trecho das achadas pelo índice vem do arquivo da prova; se não vier, a linha fica só com a prova e o número
  const local = [...out.keys()].filter((id) => !snips.has(id));
  if (local.length) await ensureBodies(local).catch(() => {});
  return [...out.values()].map((q) => ({ q, tag: `${examTag(bank, q)} · Questão ${q.n}`, snip: snips.get(q.id) ?? (bodyOf(q.id) ? snippet(bodyOf(q.id)!.e, st, 96) : "") }));
}

export function questionExtension(pop: Pop<QuestionHit>) {
  return suggestion<QuestionHit>({
    name: "questionMenu", char: "@", pop, allowSpaces: true, debounce: 220,
    items: (q) => findQuestions(q),
    run: (e, r, i) => { e.chain().focus().insertContentAt(r, [{ type: "questionRef", attrs: { qid: i.q.id, label: labelFor(i.q.id) } }, { type: "text", text: " " }]).run(); },
  });
}

/** começa a busca de questão no ponto do cursor */
export function startQuestionSearch(editor: Editor) {
  const { $from } = editor.state.selection;
  const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset, undefined, " ");
  editor.chain().focus().insertContent(before && !/\s/.test(before) ? " @" : "@").run();
}
