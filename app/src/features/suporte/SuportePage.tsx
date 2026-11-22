/* Fale com quem faz o Conduta Med: sugestão, prova que falta, problema ou outro assunto, e as mensagens enviadas com o
   estado e a resposta. Também aparecem as que a IA da pessoa mandou por ela. */
import { useState } from "react";
import { motion } from "motion/react";
import { apiPost } from "../../api/client";
import type { FeedbackItem, FeedbackKind } from "../../api/types";
import { Page, Section } from "../../app/Page";
import { BANCAS } from "../../data/types";
import { Badge, Button } from "../../ds/basics";
import { Icon } from "../../ds/Icon";
import { useToast } from "../../ds/overlay";
import { spring } from "../../lib/motion";
import { EmptyState, Loading, Problem, relTime, useApi } from "../comunidade/parts";

type Kind = Exclude<FeedbackKind, "senha">;
export const KIND: Record<FeedbackKind, { label: string; icon: string; placeholder: string }> = {
  sugestao: { label: "Sugestão de função", icon: "sparkle", placeholder: "O que faria o Conduta Med ajudar mais no seu estudo?" },
  prova: { label: "Prova que falta", icon: "exam", placeholder: "Algo mais sobre essa prova? De onde tirar, por que importa para você…" },
  problema: { label: "Problema", icon: "alert", placeholder: "O que aconteceu? Conte em que tela estava e o que esperava." },
  outro: { label: "Outro", icon: "message", placeholder: "Pode falar." },
  senha: { label: "Pedido de nova senha", icon: "lock", placeholder: "" },
};
export const STATUS: Record<FeedbackItem["status"], { label: string; tone: "neutral" | "accent" | "success" | "warning" }> = {
  novo: { label: "Recebida", tone: "neutral" },
  lendo: { label: "Lendo", tone: "accent" },
  feito: { label: "Feita", tone: "success" },
  recusado: { label: "Não vamos fazer", tone: "warning" },
};
const KINDS: Kind[] = ["sugestao", "prova", "problema", "outro"];

export function SuportePage() {
  const toast = useToast();
  const { data, error, reload, setData } = useApi<{ items: FeedbackItem[] }>("/feedback");
  const [kind, setKind] = useState<Kind>("sugestao");
  const [banca, setBanca] = useState("");
  const [ano, setAno] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);
  const isProva = kind === "prova";
  const wanted = [banca.trim(), ano.trim()].filter(Boolean).join(" ");
  const canSend = isProva ? !!(wanted || body.trim()) : !!body.trim();
  const send = async () => {
    if (!canSend || busy) return;
    setBusy(true); setSendError(null);
    try {
      const payload = isProva
        ? { kind, title: wanted, body: body.trim() || `Quero a prova ${wanted}.`, meta: { banca: banca.trim(), ano: ano.trim() } }
        : { kind, body: body.trim() };
      const { item } = await apiPost<{ item: FeedbackItem }>("/feedback", payload);
      setData((d) => (d ? { items: [item, ...d.items] } : { items: [item] }));
      setBody(""); setBanca(""); setAno("");
      toast({ text: "Recebemos sua mensagem. Obrigado.", icon: "check" });
    } catch (e) { setSendError(e); } finally { setBusy(false); }
  };
  const items = data?.items;
  return (
    <Page title="Fale com quem faz o Conduta Med" subtitle="Uma ideia, uma prova que falta ou algo que não funcionou. A plataforma cresce com o que vocês pedem.">
      <div className="cols cols--wide-aside">
        <div className="cols__main">
          <Section title="Nova mensagem">
            <div className="panel cm-fb">
              <div className="cm-fb__kinds" role="radiogroup" aria-label="Tipo de mensagem">
                {KINDS.map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} className="source cd-hoverable" onClick={() => setKind(k)}>
                    <span className="source__icon"><Icon name={KIND[k].icon} size={20} /></span>
                    <span className="source__title">{KIND[k].label}</span>
                  </button>
                ))}
              </div>
              {isProva ? (
                <div className="cm-edit__two">
                  <label className="fc-field"><span className="fc-field__label">Banca</span>
                    <input className="fc-input" list="cm-bancas" value={banca} maxLength={80} placeholder="Ex.: UNICAMP" onChange={(e) => setBanca(e.target.value)} />
                    <datalist id="cm-bancas">{BANCAS.map((b) => <option key={b} value={b} />)}</datalist>
                  </label>
                  <label className="fc-field"><span className="fc-field__label">Ano</span>
                    <input className="fc-input" inputMode="numeric" value={ano} maxLength={9} placeholder="Ex.: 2024" onChange={(e) => setAno(e.target.value)} />
                  </label>
                </div>
              ) : null}
              <label className="fc-field"><span className="fc-field__label">{isProva ? <>Mensagem <small>opcional</small></> : "Mensagem"}</span>
                <textarea className="fc-input fc-input--area" rows={5} maxLength={8000} value={body} placeholder={KIND[kind].placeholder} onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} />
              </label>
              {sendError ? <Problem error={sendError} /> : null}
              <div className="cm-plan__foot"><Button variant="filled" icon="message" loading={busy} disabled={!canSend} onClick={send}>Enviar</Button></div>
            </div>
          </Section>
        </div>
        <aside className="cols__aside">
          <Section title="Suas mensagens">
            {error ? <Problem error={error} onRetry={reload} />
              : !items ? <Loading />
              : !items.length ? <EmptyState icon="message">Nada por aqui ainda. O que você enviar aparece aqui, com o andamento e a resposta.</EmptyState>
              : (
                <ul className="cm-msgs">
                  {items.map((m, i) => (
                    <motion.li key={m.id} className="panel cm-msg" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { ...spring.smooth, delay: Math.min(i, 8) * 0.025 } }}>
                      <div className="cm-msg__top">
                        <span className="cm-msg__kind">{m.title || (KIND[m.kind] || KIND.outro).label}</span>
                        <Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>
                      </div>
                      <span className="cm-msg__meta">{m.title && m.title !== (KIND[m.kind] || KIND.outro).label ? `${(KIND[m.kind] || KIND.outro).label} · ` : ""}{relTime(m.createdAt)}{m.source === "plugin" ? " · Enviada pela sua IA" : ""}</span>
                      <p className="cm-msg__body">{m.body}</p>
                      {m.reply ? <div className="cm-reply"><b>Resposta{m.repliedAt ? ` ${relTime(m.repliedAt)}` : ""}</b><p>{m.reply}</p></div> : null}
                    </motion.li>
                  ))}
                </ul>
              )}
          </Section>
        </aside>
      </div>
    </Page>
  );
}
