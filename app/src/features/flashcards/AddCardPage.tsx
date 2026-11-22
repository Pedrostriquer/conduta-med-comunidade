/* Criar cards: escrever (como o "Adicionar" do Anki: básico, básico e invertido, lacunas, com prévia ao vivo),
   importar um .apkg ou colar uma planilha (CSV/TSV). Com ?q=<id da questão>, a frente e o verso já vêm da questão
   do banco (enunciado curto, gabarito e resumo da correção) e o card guarda essa origem. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Page } from "../../app/Page";
import { Badge, Button, Kbd, SegmentedControl } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { useToast } from "../../ds/overlay";
import { useBank, useFullQuestion } from "../../data/bank";
import { useKey } from "../../lib/hooks";
import { num, plural } from "../../lib/format";
import { uid } from "../../lib/random";
import { allDecks, deckCards, putMany } from "./db";
import type { CardRec, DeckRec } from "./db";
import { SEP } from "./decks";
import { parseTags } from "./CardSheets";
import { Face } from "./ReviewPage";
import { Importer } from "./FlashcardsPage";
import { addCards, html, makeCards, parseDelimited, questionCard } from "./make";
import { ERR_DECK } from "./drafts";
import type { Tipo } from "./make";

const NEW = "__novo__";
type Aba = "escrever" | "importar" | "colar";

/** baralho de destino: um existente ou um novo com nome */
function DeckPicker({ decks, deck, setDeck, newName, setNewName }: { decks: DeckRec[] | null; deck: string; setDeck: (v: string) => void; newName: string; setNewName: (v: string) => void }) {
  return (
    <>
      <label className="fc-field">
        <span className="fc-field__label">Baralho</span>
        <select className="fc-input" value={deck} onChange={(e) => setDeck(e.target.value)}>
          {(decks || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          <option value={NEW}>Novo baralho…</option>
        </select>
      </label>
      {deck === NEW ? (
        <label className="fc-field">
          <span className="fc-field__label">Nome do baralho</span>
          <input className="fc-input" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </label>
      ) : null}
    </>
  );
}

async function resolveDeck(deck: string, newName: string, onNew: (d: DeckRec) => void) {
  if (deck !== NEW) return deck;
  const rec: DeckRec = { id: uid(), name: newName.trim() || "Meus cards", file: "", importedAt: Date.now(), cards: 0, images: 0, groups: [] };
  await putMany("decks", [rec]); onNew(rec);
  return rec.id;
}

/** colar CSV/TSV: uma linha por card */
function PastePanel({ decks, setDecks, initialDeck }: { decks: DeckRec[] | null; setDecks: (f: (x: DeckRec[] | null) => DeckRec[]) => void; initialDeck: string }) {
  const toast = useToast(), nav = useNavigate();
  const [deck, setDeck] = useState(initialDeck);
  const [newName, setNewName] = useState("Meus cards");
  const [sub, setSub] = useState("");
  const [text, setText] = useState("");
  const [inverted, setInverted] = useState(false);
  useEffect(() => { if (!deck && initialDeck) setDeck(initialDeck); }, [initialDeck]); // eslint-disable-line
  const parsed = useMemo(() => parseDelimited(text), [text]);
  const sepName = parsed.sep === "\t" ? "tabulação" : parsed.sep === ";" ? "ponto e vírgula" : "vírgula";
  const go = async () => {
    const d = await resolveDeck(deck, newName, (rec) => { setDecks((x) => [...(x || []), rec]); setDeck(rec.id); });
    const path = sub.trim() ? sub.split(/\s*(?:›|::)\s*/).filter(Boolean) : [];
    const cards = parsed.rows.flatMap((r) => makeCards(inverted ? "invertido" : "basico", d, path, [html(r.front), html(r.back)], [...r.tags, "colado"], { csv: 1, ...(r.qid ? { q: r.qid } : {}) }));
    await addCards(d, cards);
    setText("");
    toast({ icon: "check", text: plural(cards.length, "card importado", "cards importados"), action: "Abrir baralho", onAction: () => nav("/flashcards/baralho/" + d) });
  };
  return (
    <div className="fc-add">
      <div className="fc-form panel">
        <div className="fc-grid2">
          <DeckPicker decks={decks} deck={deck} setDeck={setDeck} newName={newName} setNewName={setNewName} />
          {deck !== NEW ? (
            <label className="fc-field"><span className="fc-field__label">Sub-baralho <small>opcional</small></span>
              <input className="fc-input" value={sub} placeholder="Ex.: Cardiologia › Arritmias" onChange={(e) => setSub(e.target.value)} /></label>
          ) : null}
        </div>
        <label className="fc-field">
          <span className="fc-field__label">Planilha</span>
          <textarea className="fc-input fc-input--area fc-input--mono" rows={10} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={"frente;verso;etiquetas\nAntídoto do sulfato de magnésio?;Gluconato de cálcio;obstetricia\nO tratamento da sífilis primária é {{c1::penicilina benzatina}};;infecto"} />
          <span className="fc-help">Copie as colunas do Excel, do Google Planilhas ou de um .csv. Primeira coluna: frente (ou um texto com {"{{c1::lacuna}}"}); segunda: verso; terceira, opcional: etiquetas.</span>
        </label>
        <label className="fc-check-row"><input type="checkbox" checked={inverted} onChange={(e) => setInverted(e.target.checked)} /> Criar também o card invertido (verso → frente)</label>
        <div className="fc-add__foot">
          <span className="fc-help" role="status">{text.trim() ? `${plural(parsed.rows.length, "card", "cards")} lidos, separados por ${sepName}${parsed.skipped ? ` · ${plural(parsed.skipped, "linha ignorada", "linhas ignoradas")}` : ""}` : "Cole as linhas acima."}</span>
          <Button variant="filled" icon="upload" disabled={!parsed.rows.length || (deck === NEW && !newName.trim())} onClick={go}>Importar {parsed.rows.length ? num(parsed.rows.length * (inverted ? 2 : 1)) : ""} cards</Button>
        </div>
      </div>
      <aside className="fc-preview" aria-label="Prévia da planilha">
        <div className="fc-preview__head"><span className="fc-sub" style={{ margin: 0 }}>Prévia</span></div>
        {parsed.rows.length ? (
          <ol className="fc-csv">
            {parsed.rows.slice(0, 6).map((r, i) => (
              <li key={i}><span className="fc-csv__n num">{i + 1}</span><span className="fc-csv__f">{r.front}</span><span className="fc-csv__b">{r.back || <i>lacuna</i>}</span></li>
            ))}
            {parsed.rows.length > 6 ? <li className="fc-csv__more">e mais {num(parsed.rows.length - 6)}</li> : null}
          </ol>
        ) : <div className="fc-preview__empty"><Icon name="file" size={28} /><span>As primeiras linhas aparecem aqui, já separadas em frente e verso.</span></div>}
      </aside>
    </div>
  );
}

export function AddCardPage() {
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const bank = useBank();
  const aba = (sp.get("aba") as Aba) || "escrever";
  const setAba = (a: Aba) => { const n = new URLSearchParams(sp); if (a === "escrever") n.delete("aba"); else n.set("aba", a); setSp(n, { replace: true }); };
  const qid = sp.get("q") || "";
  // o card de uma questão precisa do enunciado e da explicação: chegam com o arquivo da prova
  const { q: fromQ } = useFullQuestion(qid && bank?.byId[qid] ? qid : null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [decks, setDecks] = useState<DeckRec[] | null>(null);
  const [deck, setDeck] = useState(sp.get("deck") || "");
  const [newName, setNewName] = useState("Meus cards");
  const [sub, setSub] = useState(sp.get("sub") || "");
  const [paths, setPaths] = useState<string[]>([]);
  const [tipo, setTipo] = useState<Tipo>("basico");
  const [f0, setF0] = useState(""), [f1, setF1] = useState("");
  const [tags, setTags] = useState("");
  const [side, setSide] = useState<"frente" | "verso">("frente");
  const [added, setAdded] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const urls = useMemo(() => new Map<string, string>(), []);

  useEffect(() => { allDecks().then((ds) => { setDecks(ds); setDeck((d) => d || (ds.sort((a, b) => b.importedAt - a.importedAt)[0]?.id ?? NEW)); }); }, []);
  // a partir de uma questão do banco: frente e verso prontos para editar
  useEffect(() => {
    if (!fromQ || !bank) return;
    const c = questionCard(fromQ, bank.examById[fromQ.p]);
    setTipo("basico"); setF0(c.frontText); setF1(c.backText); setOrigin(fromQ.id);
    setTags((t) => t || ["questao", bank.examById[fromQ.p]?.banca.toLowerCase()].filter(Boolean).join(" "));
  }, [fromQ, bank]);
  // card de questão vai, por padrão, para "Meus erros" (criado se ainda não existir)
  const pickedForQ = useRef(false);
  useEffect(() => {
    if (!fromQ || !decks || pickedForQ.current || sp.get("deck")) return;
    pickedForQ.current = true;
    if (decks.some((x) => x.id === ERR_DECK)) setDeck(ERR_DECK); else { setDeck(NEW); setNewName("Meus erros"); }
  }, [fromQ, decks]); // eslint-disable-line
  useEffect(() => {
    if (!deck || deck === NEW) { setPaths([]); return; }
    deckCards(deck).then((cs) => setPaths([...new Set(cs.map((c) => c.path.join(SEP)).filter(Boolean))].sort().slice(0, 400)));
  }, [deck]);

  const clozeN = (f0.match(/\{\{c(\d+)::/g) || []).length;
  const nextC = Math.max(0, ...[...f0.matchAll(/\{\{c(\d+)::/g)].map((m) => Number(m[1]))) + 1;
  const insertCloze = () => {
    const el = area.current; if (!el) return;
    const a = el.selectionStart, b = el.selectionEnd, sel = f0.slice(a, b) || "";
    const ins = `{{c${nextC}::${sel}}}`;
    const v = f0.slice(0, a) + ins + f0.slice(b);
    setF0(v);
    requestAnimationFrame(() => { el.focus(); const pos = a + ins.length - (sel ? 0 : 2); el.setSelectionRange(sel ? pos : a + ins.length - 2, sel ? pos : a + ins.length - 2); });
  };
  const fields = [html(f0), html(f1)];
  const preview = useMemo<CardRec | null>(() => {
    if (!f0.trim()) return null;
    const p = sub ? sub.split(/\s*(?:›|::)\s*/) : [];
    const cs = makeCards(tipo, deck || "x", p, fields, []);
    return cs[0] || null;
  }, [f0, f1, tipo, deck, sub]); // eslint-disable-line
  const ok = !!f0.trim() && (tipo === "lacunas" ? clozeN > 0 : !!f1.trim()) && (deck !== NEW || !!newName.trim());

  const add = async () => {
    if (!ok) return;
    let d = deck;
    if (d === NEW) {
      const id = origin && newName.trim() === "Meus erros" ? ERR_DECK : uid();
      const rec: DeckRec = { id, name: newName.trim(), file: "", importedAt: Date.now(), cards: 0, images: 0, groups: [] };
      await putMany("decks", [rec]); d = rec.id; setDecks((x) => [...(x || []), rec]); setDeck(d);
    }
    const path = sub.trim() ? sub.split(/\s*(?:›|::)\s*/).filter(Boolean) : [];
    const cs = makeCards(tipo, d, path, fields, parseTags(tags), origin ? { q: origin } : undefined);
    await addCards(d, cs);
    setAdded((n) => n + cs.length); setF0(""); setF1(""); setSide("frente"); setOrigin(null);
    if (qid) { const n = new URLSearchParams(sp); n.delete("q"); setSp(n, { replace: true }); }
    toast({ icon: "check", text: plural(cs.length, "card adicionado", "cards adicionados"), duration: 2200 });
    area.current?.focus();
  };
  useKey((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); add(); }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "c" && tipo === "lacunas") { e.preventDefault(); insertCloze(); }
  });

  const deckName = decks?.find((x) => x.id === sp.get("deck"))?.name;
  const ex = fromQ && bank ? bank.examById[fromQ.p] : undefined;
  return (
    <Page title="Criar cards" subtitle={added ? `${plural(added, "card adicionado", "cards adicionados")} agora` : "Escreva, importe do Anki ou cole uma planilha. Tudo entra como card novo."}
      crumbs={deckName ? [{ label: "Flashcards", to: "/flashcards" }, { label: deckName, to: "/flashcards/baralho/" + sp.get("deck") }] : undefined}>
      <div className="fc-tabs">
        <SegmentedControl aria-label="Como criar" value={aba} onChange={setAba}
          options={[{ value: "escrever", label: "Escrever", icon: "pencil" }, { value: "importar", label: "Importar .apkg", icon: "upload" }, { value: "colar", label: "Colar planilha", icon: "clipboard" }]} />
      </div>
      {aba === "importar" ? <div className="fc-import-tab"><Importer /></div> : aba === "colar" ? <PastePanel decks={decks} setDecks={setDecks} initialDeck={deck} /> : (
      <div className="fc-add">
        <div className="fc-form panel">
          {origin && ex && fromQ ? (
            <div className="fc-origin"><Badge tone="accent" icon="questions">Da questão {ex.nome} · {fromQ.n}</Badge>
              <span className="fc-help">Frente e verso vieram do enunciado, do gabarito e da correção. Edite à vontade.</span>
              <Button variant="plain" size="sm" icon="x" label="Tirar a origem" onClick={() => setOrigin(null)} /></div>
          ) : null}
          <SegmentedControl block aria-label="Tipo de card" value={tipo} onChange={(v) => { setTipo(v); setSide("frente"); }}
            options={[{ value: "basico", label: "Básico" }, { value: "invertido", label: "Básico e invertido" }, { value: "lacunas", label: "Lacunas" }]} />
          <div className="fc-grid2">
            <label className="fc-field">
              <span className="fc-field__label">Baralho</span>
              <select className="fc-input" value={deck} onChange={(e) => setDeck(e.target.value)}>
                {(decks || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                <option value={NEW}>Novo baralho…</option>
              </select>
            </label>
            {deck === NEW ? (
              <label className="fc-field">
                <span className="fc-field__label">Nome do baralho</span>
                <input className="fc-input" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </label>
            ) : (
              <label className="fc-field">
                <span className="fc-field__label">Sub-baralho <small>opcional</small></span>
                <input className="fc-input" list="fc-paths" value={sub} placeholder="Ex.: Cardiologia › Arritmias" onChange={(e) => setSub(e.target.value)} />
                <datalist id="fc-paths">{paths.map((p) => <option key={p} value={p} />)}</datalist>
              </label>
            )}
          </div>
          <label className="fc-field">
            <span className="fc-field__label fc-field__label--row">{tipo === "lacunas" ? "Texto" : "Frente"}
              {tipo === "lacunas" ? <Button variant="tinted" size="sm" icon="plus" onClick={insertCloze}>Lacuna c{nextC}</Button> : null}
            </span>
            <textarea ref={area} className="fc-input fc-input--area fc-input--reading" rows={5} value={f0} autoFocus
              placeholder={tipo === "lacunas" ? "Selecione um trecho e toque em Lacuna: o {{c1::trecho}} vira a pergunta" : "A pergunta"} onChange={(e) => setF0(e.target.value)} />
            {tipo === "lacunas" ? <span className="fc-help">{clozeN ? `${plural(new Set(f0.match(/\{\{c\d+::/g)).size, "card", "cards")} a partir deste texto.` : "Ainda sem lacuna."} Atalho: <Kbd>Ctrl</Kbd><Kbd>Shift</Kbd><Kbd>C</Kbd></span> : null}
          </label>
          <label className="fc-field">
            <span className="fc-field__label">{tipo === "lacunas" ? <>Extra <small>opcional</small></> : "Verso"}</span>
            <textarea className="fc-input fc-input--area fc-input--reading" rows={4} value={f1} placeholder={tipo === "lacunas" ? "Explicação que aparece depois da resposta" : "A resposta"} onChange={(e) => setF1(e.target.value)} />
          </label>
          <label className="fc-field">
            <span className="fc-field__label">Etiquetas <small>opcional</small></span>
            <input className="fc-input" value={tags} placeholder="separadas por espaço, ex.: cardio enare" onChange={(e) => setTags(e.target.value)} />
          </label>
          <div className="fc-add__foot">
            <span className="fc-help">Negrito com &lt;b&gt;…&lt;/b&gt;. Adicionar: <Kbd>Ctrl</Kbd><Kbd>Enter</Kbd></span>
            <Button variant="filled" icon="plus" disabled={!ok} onClick={add}>Adicionar</Button>
          </div>
        </div>

        <aside className="fc-preview" aria-label="Prévia">
          <div className="fc-preview__head">
            <span className="fc-sub" style={{ margin: 0 }}>Prévia</span>
            <SegmentedControl size="sm" aria-label="Lado" value={side} onChange={setSide} options={[{ value: "frente", label: "Pergunta" }, { value: "verso", label: "Resposta" }]} />
          </div>
          {preview ? (
            <div key={tipo} className="cd-fc fc-preview__card fc-tabpane">
              <div className="cd-fc__stack"><div className="cd-fc__card" data-depth="0"><div className="fc-face"><Face card={preview} open={side === "verso"} urls={urls} /></div></div></div>
            </div>
          ) : (
            <div key="empty" className="fc-preview__empty fc-tabpane">
              <Icon name="cards" size={28} />
              <span>Escreva {tipo === "lacunas" ? "o texto" : "a frente"} para ver o card como ele aparece na revisão.</span>
            </div>
          )}
          {tipo === "invertido" ? <p className="fc-help">Gera dois cards: frente → verso e verso → frente.</p> : null}
        </aside>
      </div>
      )}
    </Page>
  );
}
