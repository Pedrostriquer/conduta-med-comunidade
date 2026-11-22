/* Editar o perfil e escolher quem vê o quê. Só nome e @ são obrigatórios: faculdade, semestre e o resto ficam para quando
   a pessoa quiser. Nada é gravado até ela tocar em Salvar. Cada escolha de privacidade diz, em português simples, o que muda. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiGet } from "../../api/client";
import type { Me, Visibility } from "../../api/types";
import { Page, Section } from "../../app/Page";
import { Button, SegmentedControl, Switch } from "../../ds/basics";
import { useToast } from "../../ds/overlay";
import { useMe, saveMe } from "../comunidade/me";
import { Avatar, Loading, errText } from "../comunidade/parts";

const MAX_FILE = 10 * 1024 * 1024;
const WHO: { v: Visibility; label: string; hint: string }[] = [
  { v: "publico", label: "Público", hint: "Qualquer pessoa com conta vê seu perfil e acha você na busca." },
  { v: "seguidores", label: "Só quem você aceitar", hint: "Na busca aparecem só seu nome e seu @. O resto, só para quem você aceitar." },
  { v: "privado", label: "Privado", hint: "Fora da busca e ninguém vê. Vale até para o que estiver marcado como público." },
];
const handleProblem = (h: string) => {
  if (h.length < 3 || h.length > 24) return "De 3 a 24 caracteres.";
  if (!/^[a-z0-9._]+$/.test(h)) return "Só letras minúsculas sem acento, números, ponto e sublinhado.";
  if (!/[a-z0-9]/.test(h)) return "Precisa ter ao menos uma letra ou número.";
  return null;
};

type Form = Pick<Me, "name" | "handle" | "bio" | "faculdade" | "semestre" | "formado" | "cidade" | "avatarUrl" | "visibility" | "showStats" | "showFaculdade" | "showActivity" | "sharePlan">;
const KEYS: (keyof Form)[] = ["name", "handle", "bio", "faculdade", "semestre", "formado", "cidade", "avatarUrl", "visibility", "showStats", "showFaculdade", "showActivity", "sharePlan"];
const formOf = (m: Me) => Object.fromEntries(KEYS.map((k) => [k, m[k]])) as Form;

export function EditarPerfilPage() {
  const me = useMe();
  if (!me) return <Page title="Editar perfil" crumbs={[{ label: "Perfil", to: "/perfil" }]}><Loading /></Page>;
  return <EditForm key={me.id} me={me} />;
}

function EditForm({ me }: { me: Me }) {
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState<Form>(() => formOf(me));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* @: formato na hora, disponibilidade com atraso */
  const handle = f.handle;
  const hProblem = handleProblem(handle);
  const [hState, setHState] = useState<"idle" | "checking" | "ok" | "taken">("idle");
  useEffect(() => {
    if (handle === me.handle || hProblem) { setHState("idle"); return; }
    setHState("checking");
    const ac = new AbortController();
    const t = setTimeout(() => {
      apiGet<{ available: boolean }>(`/handles/${encodeURIComponent(handle)}/available`, ac.signal)
        .then((r) => setHState(r.available ? "ok" : "taken")).catch((e) => { if ((e as Error).name !== "AbortError") setHState("idle"); });
    }, 420);
    return () => { clearTimeout(t); ac.abort(); };
  }, [handle, hProblem, me.handle]);

  /* foto: prévia na hora, enviada ao escolher; o perfil só muda ao salvar */
  const file = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const x = e.target.files?.[0];
    e.target.value = "";
    if (!x) return;
    if (x.size > MAX_FILE) { toast({ text: "A foto passou de 10 MB.", icon: "alert" }); return; }
    const url = URL.createObjectURL(x);
    setPreview(url);
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", x);
      const r = await api<{ url: string }>("/uploads/image?kind=avatar", { method: "POST", body: fd });
      set("avatarUrl", r.url);
    } catch (err) { setPreview(null); toast({ text: errText(err), icon: "alert" }); } finally { setUploading(false); }
  };

  const clean = useMemo<Form>(() => ({ ...f, name: f.name.trim(), bio: f.bio.trim(), faculdade: f.faculdade?.trim() || null, cidade: f.cidade?.trim() || null }), [f]);
  const changes = useMemo(() => Object.fromEntries(KEYS.filter((k) => clean[k] !== me[k]).map((k) => [k, clean[k]])) as Partial<Form>, [clean, me]);
  const dirty = Object.keys(changes).length > 0;
  const blocked = !clean.name || !!hProblem || hState === "taken" || hState === "checking" || uploading;
  const save = async () => {
    if (blocked || saving || !dirty) return;
    setSaving(true); setError(null);
    try { await saveMe(changes as Partial<Me>); toast({ text: "Perfil salvo.", icon: "check" }); }
    catch (e) { setError(errText(e)); } finally { setSaving(false); }
  };
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);

  const semValue = f.formado ? "formado" : f.semestre ? String(f.semestre) : "";
  const setSem = (v: string) => setF((x) => ({ ...x, formado: v === "formado", semestre: v && v !== "formado" ? Number(v) : null }));
  const handleHelp = hProblem ? { tone: "no", text: hProblem }
    : hState === "taken" ? { tone: "no", text: "Este @ já está em uso. Escolha outro." }
    : hState === "ok" ? { tone: "ok", text: "Disponível." }
    : hState === "checking" ? { tone: undefined, text: "Conferindo…" }
    : { tone: undefined, text: "Letras minúsculas, números, ponto e sublinhado. É o endereço do seu perfil." };

  return (
    <Page title="Editar perfil" subtitle="Só nome e @ são obrigatórios. O resto você preenche se e quando quiser." crumbs={[{ label: "Perfil", to: "/perfil" }]} className="cm-edit">
      <div className="cols cols--wide-aside">
        <div className="cols__main">
          <Section title="Sobre você">
            <div className="panel pf-form">
              <div className="cm-edit__avatar">
                <Avatar name={f.name} url={preview || f.avatarUrl} size={72} />
                <div className="cm-edit__btns">
                  <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic" hidden onChange={pick} />
                  <Button variant="gray" size="sm" icon="image" loading={uploading} onClick={() => file.current?.click()}>{f.avatarUrl ? "Trocar foto" : "Escolher foto"}</Button>
                  {f.avatarUrl ? <Button variant="plain" size="sm" onClick={() => { setPreview(null); set("avatarUrl", null); }}>Tirar foto</Button> : null}
                </div>
              </div>
              <label className="pf-field"><span>Nome</span>
                <input value={f.name} maxLength={80} autoComplete="name" onChange={(e) => set("name", e.target.value)} />
                {!clean.name ? <small className="cm-check" data-tone="no">Diga seu nome.</small> : null}
              </label>
              <label className="pf-field"><span>@usuario</span>
                <div className="pf-field__prefix"><i>@</i><input value={f.handle} maxLength={24} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => set("handle", e.target.value.trim().replace(/^@/, "").toLowerCase())} /></div>
                <small className="cm-check" data-tone={handleHelp.tone} aria-live="polite">{handleHelp.text}</small>
              </label>
              <label className="pf-field"><span>Bio <small>opcional</small></span>
                <textarea rows={3} maxLength={500} value={f.bio} placeholder="Ex.: 6º semestre, focando em ENARE e SUS-SP" onChange={(e) => set("bio", e.target.value)} />
              </label>
              <label className="pf-field"><span>Faculdade <small>opcional</small></span>
                <input value={f.faculdade || ""} maxLength={120} placeholder="Ex.: USP" autoComplete="organization" onChange={(e) => set("faculdade", e.target.value)} />
              </label>
              <div className="cm-edit__two">
                <label className="pf-field"><span>Semestre <small>opcional</small></span>
                  <select className="fc-input" value={semValue} onChange={(e) => setSem(e.target.value)}>
                    <option value="">Não informar</option>
                    {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}º semestre</option>)}
                    <option value="formado">Formado(a)</option>
                  </select>
                </label>
                <label className="pf-field"><span>Cidade <small>opcional</small></span>
                  <input value={f.cidade || ""} maxLength={80} placeholder="Ex.: Campinas" autoComplete="address-level2" onChange={(e) => set("cidade", e.target.value)} />
                </label>
              </div>
            </div>
          </Section>
        </div>
        <aside className="cols__aside cm-edit__aside">
          <Section title="Privacidade">
            <div className="panel cm-priv">
              <div className="cm-priv__group">
                <span className="fc-field__label">Quem vê seu perfil</span>
                <ul className="fc-radio" role="radiogroup" aria-label="Quem vê seu perfil">
                  {WHO.map((o) => (
                    <li key={o.v}><button type="button" role="radio" aria-checked={f.visibility === o.v} className="fc-radio__opt cd-hoverable" onClick={() => set("visibility", o.v)}>
                      <i className="fc-radio__dot" aria-hidden /><span><b>{o.label}</b><small>{o.hint}</small></span>
                    </button></li>
                  ))}
                </ul>
              </div>
              <div>
                <PrivRow title="Total de questões e flashcards" hint={f.showStats ? "Aparece no perfil." : "Fica escondido, e o gráfico também."} checked={f.showStats} onChange={(v) => set("showStats", v)} />
                <PrivRow title="Faculdade e semestre" hint={f.showFaculdade ? "Aparecem no perfil, nos comentários e na busca." : "Ninguém vê, nem acha você por eles."} checked={f.showFaculdade} onChange={(v) => set("showFaculdade", v)} />
                <PrivRow title="Gráfico de atividade" hint={!f.showStats ? "Depende de mostrar os totais." : f.showActivity ? "Mostra em que dias você estudou, sem acerto." : "Fica escondido."} checked={f.showActivity && f.showStats} onChange={(v) => set("showActivity", v)} disabled={!f.showStats} />
              </div>
              <div className="cm-priv__group">
                <span className="fc-field__label">Compartilhar cronograma</span>
                <SegmentedControl<Visibility> size="sm" block aria-label="Compartilhar cronograma" value={f.sharePlan} onChange={(v) => set("sharePlan", v)}
                  options={[{ value: "privado", label: "Ninguém" }, { value: "seguidores", label: "Seguidores" }, { value: "publico", label: "Todos" }]} />
                <p className="fc-help">{f.sharePlan === "privado" ? "Só você vê o seu cronograma." : f.sharePlan === "seguidores" ? "Quem você aceitou pode ver e usar uma cópia." : "Quem puder ver seu perfil pode ver e usar uma cópia."}</p>
              </div>
              <p className="fc-help">Baralhos e resumos são compartilhados um a um: em Flashcards › Compartilhados e dentro de cada resumo.</p>
            </div>
          </Section>
        </aside>
      </div>
      <div className="cm-savebar" role="region" aria-label="Salvar">
        <span className="cm-savebar__msg" aria-live="polite">{error || (dirty ? "Você tem alterações que ainda não foram salvas." : "Tudo salvo.")}</span>
        <div className="cd-row cm-compose__btns">
          {!dirty ? <Button variant="plain" size="sm" onClick={() => nav("/u/" + me.handle)}>Ver meu perfil</Button> : <Button variant="plain" size="sm" onClick={() => { setF(formOf(me)); setPreview(null); setError(null); }}>Desfazer</Button>}
          <Button variant="filled" loading={saving} disabled={!dirty || blocked} onClick={save}>Salvar</Button>
        </div>
      </div>
    </Page>
  );
}

function PrivRow({ title, hint, checked, onChange, disabled }: { title: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="cm-priv__row" style={disabled ? { opacity: 0.55 } : undefined}>
      <span><b>{title}</b><small>{hint}</small></span>
      <Switch label={title} checked={checked} onChange={(v) => { if (!disabled) onChange(v); }} />
    </div>
  );
}
