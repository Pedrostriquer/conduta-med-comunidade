/* Peças da parte comunitária: foto ou iniciais, data relativa, carregar da API, estados de erro e denúncia. */
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ApiError, apiGet, apiPost } from "../../api/client";
import { Button } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { Sheet, useToast } from "../../ds/overlay";
import { diffDays, dayKey, monthName, shortDate, today } from "../../lib/format";
import { cx } from "../../lib/cx";

/* ---------- datas ---------- */
export function relTime(ms: number, now = Date.now()) {
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return "agora";
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  const k = dayKey(ms), d = diffDays(k, today());
  if (d <= 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  const year = new Date(ms).getFullYear();
  return year === new Date(now).getFullYear() ? shortDate(k) : `${shortDate(k)} de ${year}`;
}
export const sinceLabel = (ms: number) => { const d = new Date(ms); return `${monthName(d.getMonth())} de ${d.getFullYear()}`; };

/* ---------- pessoa ---------- */
export const initials = (name: string) => (name || "?").trim().split(/\s+/).map((x) => x[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

export function Avatar({ name, url, size = 40, className }: { name: string; url?: string | null; size?: number; className?: string }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [url]);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (url && !bad) return <img className={cx("cm-av", className)} src={url} alt="" style={style} onError={() => setBad(true)} loading="lazy" />;
  return <span className={cx("cm-av cm-av--ini", className)} style={style} aria-hidden>{initials(name)}</span>;
}

export function semestreLabel(p: { semestre: number | null; formado?: boolean }) {
  if (p.formado) return "Formado(a)";
  return p.semestre ? `${p.semestre}º semestre` : null;
}

/* ---------- carregar da API ---------- */
export function useApi<T>(path: string | null) {
  const [state, set] = useState<{ data: T | null; error: ApiError | null; loading: boolean }>({ data: null, error: null, loading: !!path });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) { set({ data: null, error: null, loading: false }); return; }
    const ac = new AbortController();
    set((s) => ({ ...s, loading: true, error: null }));
    apiGet<T>(path, ac.signal).then(
      (data) => set({ data, error: null, loading: false }),
      (e) => { if ((e as Error).name !== "AbortError") set({ data: null, error: e as ApiError, loading: false }); },
    );
    return () => ac.abort();
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((f: (d: T | null) => T | null) => set((s) => ({ ...s, data: f(s.data) })), []);
  return { ...state, reload, setData };
}

export const isOffline = (e: unknown) => (e as ApiError | null)?.code === "sem_rede";
export const errText = (e: unknown) => (e as Error | null)?.message || "Algo deu errado. Tente de novo.";

export function Loading({ label = "Carregando" }: { label?: string }) {
  return <div className="cm-state" role="status"><span className="cd-spinner" aria-hidden />{label}</div>;
}

/** erro de carregamento: diz se é falta de internet e deixa tentar de novo */
export function Problem({ error, onRetry, offline = "Sem conexão. Confira a internet e tente de novo." }: { error: unknown; onRetry?: () => void; offline?: string }) {
  return (
    <div className="cm-state cm-state--err" role="alert">
      <Icon name={isOffline(error) ? "globe" : "alert"} size={18} />
      <span>{isOffline(error) ? offline : errText(error)}</span>
      {onRetry ? <button type="button" className="sec__link" onClick={onRetry}>Tentar de novo</button> : null}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: string; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="cm-empty">
      <Icon name={icon} size={24} />
      {title ? <b>{title}</b> : null}
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

/* ---------- denunciar ---------- */
const REASONS = ["É ofensivo ou desrespeitoso", "É propaganda ou spam", "Traz informação errada e perigosa", "Outro motivo"];

export function ReportSheet({ open, onClose, targetKind, targetId, title, subtitle }: {
  open: boolean; onClose: () => void; targetKind: "comment" | "user" | "doc" | "deck"; targetId: string; title: string; subtitle?: string;
}) {
  const toast = useToast();
  const [reason, setReason] = useState(REASONS[0]);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { if (open) { setReason(REASONS[0]); setDetail(""); setError(null); } }, [open]);
  const send = async () => {
    setBusy(true); setError(null);
    try {
      await apiPost("/reports", { targetKind, targetId, reason: detail.trim() ? `${reason}: ${detail.trim()}` : reason });
      toast({ text: "Recebemos sua denúncia. Obrigado.", icon: "check" });
      onClose();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <span onKeyDown={(e) => e.stopPropagation()}>
      <Sheet open={open} onClose={onClose} title={title} subtitle={subtitle || "Só quem cuida do Conduta Med vê a denúncia."} width={480}
        footer={<><Button variant="gray" onClick={onClose}>Cancelar</Button><Button variant="filled" loading={busy} onClick={send}>Enviar denúncia</Button></>}>
        <ul className="fc-radio" role="radiogroup" aria-label="Motivo">
          {REASONS.map((r, i) => (
            <li key={r}><button type="button" role="radio" aria-checked={reason === r} data-autofocus={i === 0 ? "" : undefined} className="fc-radio__opt cd-hoverable" onClick={() => setReason(r)}>
              <i className="fc-radio__dot" aria-hidden /><span><b>{r}</b></span>
            </button></li>
          ))}
        </ul>
        <label className="pf-field cm-mt"><span>Quer explicar? <small>opcional</small></span>
          <textarea rows={2} maxLength={500} value={detail} onChange={(e) => setDetail(e.target.value)} />
        </label>
        {error ? <Problem error={error} /> : null}
      </Sheet>
    </span>
  );
}
