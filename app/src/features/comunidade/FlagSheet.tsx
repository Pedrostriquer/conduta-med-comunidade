/* Sinalizar a questão: desatualizada, problema no enunciado, gabarito que parece errado, imagem ruim ou outro motivo.
   O botão fica na barra da questão e funciona sempre, até antes de responder e em simulado, por isso a folha só mostra
   o que a própria pessoa marcou: a contagem das outras dá pista da resposta e só aparece depois de responder. */
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { apiDelete, apiGet, apiPost } from "../../api/client";
import type { FlagReason } from "../../api/types";
import { Button } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Sheet, useToast } from "../../ds/overlay";
import { haptic } from "../../lib/motion";
import { Problem } from "./parts";

export const FLAG_REASONS: { k: FlagReason; label: string; hint?: string }[] = [
  { k: "desatualizada", label: "Desatualizada", hint: "A conduta mudou" },
  { k: "problema", label: "Problema no enunciado ou nas alternativas" },
  { k: "gabarito", label: "Gabarito parece errado" },
  { k: "imagem", label: "Imagem faltando ou ruim" },
  { k: "outro", label: "Outro" },
];
export const flagLabel = (k: string) => FLAG_REASONS.find((r) => r.k === k)?.label ?? k;

export type FlagState = { counts: Partial<Record<FlagReason, number>>; mine: FlagReason[] };

const useFlags = create<{ byQ: Record<string, FlagState> }>()(() => ({ byQ: {} }));
const put = (qid: string, s: FlagState) => useFlags.setState((x) => ({ byQ: { ...x.byQ, [qid]: s } }));
const inflight = new Map<string, Promise<void>>();

export function loadFlags(qid: string) {
  let p = inflight.get(qid);
  if (!p) {
    p = apiGet<FlagState>(`/q/${encodeURIComponent(qid)}/flags`).then((r) => put(qid, r)).catch(() => {}).finally(() => { inflight.delete(qid); });
    inflight.set(qid, p);
  }
  return p;
}
export const useFlagState = (qid: string) => useFlags((x) => x.byQ[qid]);

export function FlagSheet({ qid, open, onClose, subtitle }: { qid: string; open: boolean; onClose: () => void; subtitle?: string }) {
  const toast = useToast();
  const state = useFlagState(qid);
  const mine = state?.mine || [];
  const [pick, setPick] = useState<FlagReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { if (open) { setPick(null); setNote(""); setError(null); loadFlags(qid); } }, [open, qid]);

  const send = async () => {
    if (!pick) return;
    setBusy(true); setError(null);
    try {
      const r = await apiPost<FlagState>(`/q/${encodeURIComponent(qid)}/flags`, { reason: pick, ...(note.trim() ? { note: note.trim() } : {}) });
      put(qid, r);
      haptic("tick");
      const reason = pick;
      toast({ text: `Marcada: ${flagLabel(reason).toLowerCase()}. Obrigado.`, icon: "flag", action: "Desfazer", duration: 5000, onAction: () => { undo(reason); } });
      onClose();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const undo = async (reason: FlagReason) => {
    setError(null);
    try { put(qid, await apiDelete<FlagState>(`/q/${encodeURIComponent(qid)}/flags/${reason}`)); }
    catch (e) { setError(e); toast({ text: "Não deu para desfazer. Tente de novo.", icon: "alert" }); }
  };

  const available = FLAG_REASONS.filter((r) => !mine.includes(r.k));
  return (
    <span onKeyDown={(e) => e.stopPropagation()}>
      <Sheet open={open} onClose={onClose} title="Sinalizar questão" subtitle={subtitle} width={520}
        footer={<><Button variant="gray" onClick={onClose}>Fechar</Button><Button variant="filled" icon="alert" disabled={!pick} loading={busy} onClick={send}>Marcar</Button></>}>
        {mine.length ? (
          <div className="cm-flagged">
            <span className="fc-field__label">Você já marcou</span>
            <ul className="cm-flagged__list">
              {mine.map((k) => (
                <li key={k}><Icon name="check" size={16} strokeWidth={2.25} /><span>{flagLabel(k)}</span>
                  <Button variant="plain" size="sm" onClick={() => undo(k)}>Desfazer</Button></li>
              ))}
            </ul>
          </div>
        ) : <p className="fc-help cm-flagged__lead">O que está errado nesta questão? A sua marcação chega a quem cuida do banco e ajuda quem vem depois.</p>}
        {available.length ? (
          <ul className="fc-radio" role="radiogroup" aria-label="Motivo">
            {available.map((r, i) => (
              <li key={r.k}><button type="button" role="radio" aria-checked={pick === r.k} data-autofocus={i === 0 ? "" : undefined} className="fc-radio__opt cd-hoverable" onClick={() => setPick(r.k)}>
                <i className="fc-radio__dot" aria-hidden /><span><b>{r.label}</b>{r.hint ? <small>{r.hint}</small> : null}</span>
              </button></li>
            ))}
          </ul>
        ) : null}
        {available.length ? (
          <label className="pf-field cm-mt"><span>Observação <small>opcional</small></span>
            <textarea rows={2} maxLength={1000} value={note} placeholder="O que você viu de errado?" onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} />
          </label>
        ) : null}
        {error ? <Problem error={error} /> : null}
      </Sheet>
    </span>
  );
}

/** o botão discreto da barra da questão */
export function FlagButton({ qid, subtitle }: { qid: string; subtitle?: string }) {
  const state = useFlagState(qid);
  const [open, setOpen] = useState(false);
  const on = !!state?.mine.length;
  useEffect(() => { loadFlags(qid); }, [qid]);
  // aberta com o mouse, a folha não devolve o foco ao botão (senão Enter reabriria em vez de responder)
  const byMouse = useRef(false);
  const close = () => { setOpen(false); if (byMouse.current) setTimeout(() => (document.activeElement as HTMLElement | null)?.blur(), 40); };
  return (
    <>
      <button type="button" className="bm cd-hoverable" data-on={on ? "" : undefined} title="Sinalizar problema" aria-label={on ? "Sinalizar questão (você já marcou)" : "Sinalizar problema na questão"}
        onClick={(e) => { byMouse.current = e.detail > 0; setOpen(true); }}>
        <span className="bm__icon"><Icon name="alert" size={20} filled={on} /></span>
      </button>
      <FlagSheet qid={qid} open={open} onClose={close} subtitle={subtitle} />
    </>
  );
}
