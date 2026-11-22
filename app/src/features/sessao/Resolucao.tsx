/* A resolução completa da questão, que só existe depois de responder: o que decide, o raciocínio em passos, cada alternativa
   com o veredito e o motivo, o cuidado e o que levar, com o link para o ponto do resumo do assunto.
   O arquivo de resoluções do assunto só é pedido quando este componente aparece (ou seja, com a questão já respondida).
   Vem sempre aberta, tenha a pessoa acertado ou errado; dá para recolher. */
import { useState } from "react";
import { Link } from "react-router-dom";
import type { FullQuestion } from "../../data/types";
import { useAssuntoInfo, useResolucao, ytClip } from "../../data/assuntos";
import type { Resolucao as Res } from "../../data/assuntos";
import { limpa } from "../../data/limpo";
import { Icon } from "../../ds/Icon";
import { MdInline } from "../../lib/md";
import { VideoCard } from "../video/VideoDock";

function Divergencia({ d }: { d: NonNullable<Res["divergencia"]> }) {
  if (typeof d === "string") { const t = limpa(d); return t ? <p className="rz-note__text"><MdInline text={t} /></p> : null; }
  const rows = (d.linhas || []).map((l) => ({ fonte: limpa(l.fonte), diz: limpa(l.diz) })).filter((l) => l.diz);
  if (!rows.length) return null;
  return (
    <dl className="rz-sides">
      {rows.map((l, i) => <div key={i}>{l.fonte ? <dt><MdInline text={l.fonte} /></dt> : null}<dd><MdInline text={l.diz} /></dd></div>)}
    </dl>
  );
}

export function Resolucao({ q, choice, examLabel }: { q: FullQuestion; choice: string | null; examLabel: string }) {
  const res = useResolucao(q.id, q.as);
  const info = useAssuntoInfo(res?.resumo ? q.as : null);
  const [open, setOpen] = useState(true);
  if (!res) return null;

  const decide = limpa(res.decide), levar = limpa(res.levar), cuidado = limpa(res.cuidado);
  const steps = (res.raciocinio || []).map((x) => limpa(x).replace(/^\s*\d+[.)º]\s*/, "")).filter(Boolean);
  const alts = (res.alternativas || []).map((a) => ({ ...a, m: limpa(a.m) }));
  // todos os canais que corrigiram a questão; o vídeo que o Conduta já mostra em cima não se repete
  const clips = (res.videos || []).map((v) => ({ c: ytClip(v.url), canal: v.canal })).filter((v) => v.c && v.c.id !== q.v?.id);
  const where = res.resumo?.bloco && q.as
    ? `/assuntos/${q.as}${res.resumo.trecho ? "?t=" + encodeURIComponent(res.resumo.trecho) : ""}#${encodeURIComponent(res.resumo.bloco)}` : null;
  const hasBody = decide || steps.length || alts.length || levar;
  if (!hasBody && !clips.length) return null;

  return (
    <section className="rz" aria-label="Resolução">
      {hasBody ? (
        <button type="button" className="rz__head cd-hoverable" aria-expanded={open} onClick={(e) => { if (e.detail > 0) e.currentTarget.blur(); setOpen(!open); }}>
          <span className="rz__head-text">
            <span className="rz__title">Resolução</span>
            {!open ? <span className="rz__sub">O raciocínio, cada alternativa e o que levar</span> : null}
          </span>
          <Icon name="chevron-down" size={18} className="rz__chev" />
        </button>
      ) : null}
      {hasBody && open ? (
        <div className="rz__body">
          {res.desatualizada ? (
            <div className="rz-note" data-tone="warning">
              <span className="rz-note__icon" aria-hidden><Icon name="clock" size={18} /></span>
              <div>
                <p className="rz-note__title">Regra antiga: a conduta mudou depois desta prova.</p>
                {res.divergencia ? <Divergencia d={res.divergencia} /> : null}
              </div>
            </div>
          ) : null}

          {decide ? (
            <div className="rz__part">
              <h3 className="rz__label">O que decide a questão</h3>
              <p className="rz__text"><MdInline text={decide} /></p>
            </div>
          ) : null}

          {steps.length ? (
            <div className="rz__part">
              <h3 className="rz__label">Raciocínio</h3>
              <ol className="rz-steps">
                {steps.map((x, i) => <li key={i}><span className="rz-steps__n num" aria-hidden>{i + 1}</span><span className="rz__text"><MdInline text={x} /></span></li>)}
              </ol>
            </div>
          ) : null}

          {alts.length ? (
            <div className="rz__part">
              <h3 className="rz__label">Alternativas</h3>
              <ul className="rz-alts">
                {alts.map((a) => {
                  const ok = /cert|corret/i.test(a.v || "");
                  return (
                    <li key={a.l} className="rz-alt" data-ok={ok ? "" : undefined}>
                      <span className="rz-alt__letter">{a.l}</span>
                      <div className="rz-alt__main">
                        <div className="rz-alt__meta">
                          <span className="rz-alt__verdict">{ok ? <Icon name="check" size={14} strokeWidth={2.5} /> : null}{ok ? "Certa" : "Errada"}</span>
                          {a.l === choice ? <span className="rz-alt__tag">sua resposta</span> : null}
                          {a.p ? <span className="rz-alt__tag" data-kind="trap">pegadinha</span> : null}
                        </div>
                        {a.m ? <p className="rz__text"><MdInline text={a.m} /></p> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {cuidado ? (
            <div className="rz-note" data-tone="caution">
              <span className="rz-note__icon" aria-hidden><Icon name="alert" size={18} /></span>
              <div>
                <p className="rz-note__title">Cuidado</p>
                <p className="rz-note__text"><MdInline text={cuidado} /></p>
              </div>
            </div>
          ) : null}

          {res.divergencia && !res.desatualizada ? (
            <div className="rz-note" data-tone="neutral">
              <span className="rz-note__icon" aria-hidden><Icon name="swap" size={18} /></span>
              <div>
                <p className="rz-note__title">As fontes divergem</p>
                <Divergencia d={res.divergencia} />
              </div>
            </div>
          ) : null}

          {levar ? (
            <div className="rz-take">
              <h3 className="rz-take__label">Para levar</h3>
              <p className="rz-take__text"><MdInline text={levar} /></p>
            </div>
          ) : null}

          {where ? (
            <Link to={where} className="rz-link cd-hoverable">
              <span className="rz-link__icon" aria-hidden><Icon name="layers" size={18} /></span>
              <span className="rz-link__text">
                <span className="rz-link__title">Ver no resumo</span>
                {info ? <span className="rz-link__sub">{info.titulo}</span> : null}
              </span>
              <Icon name="chevron-right" size={18} className="rz-link__chev" />
            </Link>
          ) : null}
        </div>
      ) : null}
      {clips.length ? <div className="rz__video">{clips.map((v) => <VideoCard key={v.c!.id + v.c!.s} clip={{ id: v.c!.id, s: v.c!.s, f: null, channel: v.canal, title: `${examLabel} · Questão ${q.n}` }} />)}</div> : null}
    </section>
  );
}
