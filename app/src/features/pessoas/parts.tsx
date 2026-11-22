/* Peças de Pessoas: o botão de seguir (Seguir, Solicitado, Seguindo) e o cartão de uma pessoa. */
import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { apiDelete, apiPost } from "../../api/client";
import type { PersonCard, Relation } from "../../api/types";
import { Button } from "../../ds/basics";
import { Dialog, useToast } from "../../ds/overlay";
import { Avatar, errText, semestreLabel } from "../comunidade/parts";

export function FollowButton({ handle, name, relation, onChange, size = "sm" }: {
  handle: string; name: string; relation: Relation; onChange: (r: Relation) => void; size?: "sm" | "md";
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (relation === "eu") return null;
  const call = async (run: () => Promise<{ relation: Relation }>, after?: string) => {
    setBusy(true);
    try { const r = await run(); onChange(r.relation); if (after) toast({ text: after, icon: "check", duration: 2400 }); }
    catch (e) { toast({ text: errText(e), icon: "alert" }); }
    finally { setBusy(false); }
  };
  const path = `/users/${encodeURIComponent(handle)}/follow`;
  if (relation === "nenhuma") return <Button variant="filled" size={size} loading={busy} onClick={() => call(() => apiPost(path))}>Seguir</Button>;
  if (relation === "pendente") {
    return <Button variant="gray" size={size} icon="clock" loading={busy} title="Clique para cancelar o pedido" aria-label={`Pedido enviado para ${name}. Cancelar`} onClick={() => call(() => apiDelete(path), "Pedido cancelado.")}>Solicitado</Button>;
  }
  return (
    <>
      <Button variant="gray" size={size} icon="check" loading={busy} title="Clique para deixar de seguir" aria-label={`Você segue ${name}. Deixar de seguir`} onClick={() => setConfirm(true)}>Seguindo</Button>
      <span onKeyDown={(e) => e.stopPropagation()}>
        <Dialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => call(() => apiDelete(path))} title={`Deixar de seguir ${name}?`} confirmLabel="Deixar de seguir" destructive>
          O que só seguidores veem deixa de aparecer para você. Para voltar, será preciso pedir de novo.
        </Dialog>
      </span>
    </>
  );
}

export function personLine(p: Pick<PersonCard, "faculdade" | "semestre"> & { formado?: boolean }) {
  return [p.faculdade, semestreLabel({ semestre: p.semestre, formado: p.formado })].filter(Boolean).join(" · ");
}

/** cartão de pessoa: o nome leva ao perfil e o botão de seguir fica no próprio cartão */
export function PersonTile({ p, onRelation, children, hint }: { p: PersonCard; onRelation?: (r: Relation) => void; children?: ReactNode; hint?: ReactNode }) {
  const line = personLine(p);
  return (
    <div className="cm-pcard">
      <Link to={"/u/" + p.handle} className="cm-pcard__who">
        <Avatar name={p.name} url={p.avatarUrl} size={44} />
        <span className="cm-pcard__text">
          <span className="cm-pcard__name">{p.name}</span>
          <span className="cm-pcard__sub">@{p.handle}{line ? ` · ${line}` : ""}</span>
          {hint ? <span className="cm-pcard__sub">{hint}</span> : null}
        </span>
      </Link>
      <div className="cm-pcard__acts">
        {children}
        {onRelation ? <FollowButton handle={p.handle} name={p.name} relation={p.relation} onChange={onRelation} /> : null}
      </div>
    </div>
  );
}
