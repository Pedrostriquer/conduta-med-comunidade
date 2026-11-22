/* Ajustes, em grupos: conta, estudo, metas, leitura e aparência, flashcards e dados. Só o que funciona de verdade: o que
   é público no perfil mora em /perfil/editar. No desktop um índice fixo à esquerda acompanha a rolagem; no celular vem no topo. */
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, apiDelete, apiGet, apiPost } from "../../api/client";
import { useBank } from "../../data/bank";
import { makeDemo } from "../../data/demo";
import { useStore } from "../../state/store";
import { useAuth } from "../../state/auth";
import { usePrefs } from "../../state/prefs";
import type { ThemePref } from "../../state/prefs";
import { syncLabel, syncNow, useSyncStatus } from "../../sync/engine";
import { Page } from "../../app/Page";
import { Button, SegmentedControl, Stepper, Switch } from "../../ds/basics";
import { Dialog, Sheet, useToast } from "../../ds/overlay";
import { Icon } from "../../ds/Icon";
import { cx } from "../../lib/cx";
import { num, plural } from "../../lib/format";
import { errorText, FormError, PasswordField } from "../auth/parts";

const GROUPS = [
  { id: "conta", label: "Conta", icon: "user" },
  { id: "estudo", label: "Estudo", icon: "questions" },
  { id: "metas", label: "Metas e cronograma", icon: "target" },
  { id: "aparencia", label: "Leitura e aparência", icon: "text-size" },
  { id: "flashcards", label: "Flashcards", icon: "cards" },
  { id: "dados", label: "Dados", icon: "file" },
] as const;

const CONFIRM_WORD = "APAGAR";

export function AjustesPage() {
  const nav = useNavigate();
  const toast = useToast();
  const bank = useBank()!;
  const s = useStore((x) => x.settings), set = useStore((x) => x.setSettings);
  const demo = useStore((x) => x.demo), plan = useStore((x) => x.plan);
  const user = useAuth((x) => x.user), signOut = useAuth((x) => x.signOut);
  const prefs = usePrefs();
  const sync = useSyncStatus();
  const [confirm, setConfirm] = useState<null | "reset" | "plan" | "sair">(null);
  const [sheet, setSheet] = useState<null | "senha" | "apagar">(null);
  const [exporting, setExporting] = useState(false);
  const [active, setActive] = useState<string>("conta");
  const lock = useRef(0);

  // índice acompanha a rolagem
  useEffect(() => {
    const els = GROUPS.map((g) => document.getElementById("aj-" + g.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis && Date.now() > lock.current) setActive(vis.target.id.slice(3));
    }, { rootMargin: "-20% 0px -65% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  const go = (id: string) => { setActive(id); lock.current = Date.now() + 900; document.getElementById("aj-" + id)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); };

  const exportAll = async () => {
    setExporting(true);
    try {
      syncNow();
      const res = await fetch("/api/me/export", { credentials: "same-origin" });
      if (!res.ok) throw new Error();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await res.blob()); a.download = `conduta-med-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast({ text: "Arquivo exportado.", icon: "check" });
    } catch { toast({ text: "Não deu para exportar agora. Confira a conexão e tente de novo.", icon: "alert" }); }
    setExporting(false);
  };

  return (
    <Page title="Ajustes" subtitle="Tudo fica salvo na hora, neste aparelho e na sua conta.">
      <div className="aj">
        <nav className="aj__nav" aria-label="Grupos de ajustes">
          {GROUPS.map((g) => (
            <button key={g.id} type="button" className={cx("aj__navitem cd-hoverable")} aria-current={active === g.id ? "true" : undefined} onClick={() => go(g.id)}>
              <Icon name={g.icon} size={18} />{g.label}
            </button>
          ))}
        </nav>

        <div className="aj__body">
          <Group id="conta" title="Conta">
            <ul className="list">
              <li><div className="row aj__info">
                <span className="row__main"><span className="row__title">{user?.name}</span><span className="row__sub aj__mail">{user?.email}</span>
                  <span className="row__sub">@{user?.handle}. Nome, @usuario e o que é público ficam em <Link to="/perfil/editar">editar perfil</Link>.</span></span>
              </div></li>
              <li><button type="button" className="row row--icon cd-hoverable" onClick={() => setSheet("senha")}>
                <span className="row__icon"><Icon name="lock" size={20} /></span>
                <span className="row__main"><span className="row__title">Trocar a senha</span><span className="row__sub">Os outros aparelhos saem da conta</span></span>
                <span className="row__end"><Icon name="chevron-right" size={18} className="row__chev" /></span>
              </button></li>
              <li><button type="button" className="row row--icon cd-hoverable" onClick={() => setConfirm("sair")}>
                <span className="row__icon"><Icon name="door" size={20} /></span>
                <span className="row__main"><span className="row__title">Sair</span><span className="row__sub">Seus estudos continuam na sua conta</span></span>
              </button></li>
              <li><button type="button" className="row row--icon row--danger cd-hoverable" onClick={() => setSheet("apagar")}>
                <span className="row__icon"><Icon name="trash" size={20} /></span>
                <span className="row__main"><span className="row__title">Apagar a conta</span><span className="row__sub">Apaga a conta e tudo que é seu. Não dá para desfazer.</span></span>
              </button></li>
            </ul>
          </Group>

          <Group id="estudo" title="Estudo">
            <ul className="list">
              <li><div className="row row--stack">
                <span className="row__main"><span className="row__title">Correção nas listas</span><span className="row__sub">Erradas, temas, provas e as questões do cronograma</span></span>
                <SegmentedControl size="sm" aria-label="Correção nas listas" value={s.feedbackLista} onChange={(v) => set({ feedbackLista: v })} options={[{ value: "imediato", label: "Na hora" }, { value: "final", label: "No final" }]} />
              </div></li>
              <li><div className="row row--stack">
                <span className="row__main"><span className="row__title">Correção nos simulados</span><span className="row__sub">Ao final é como na prova; depois você refaz as que errou</span></span>
                <SegmentedControl size="sm" aria-label="Correção nos simulados" value={s.feedbackSimulado} onChange={(v) => set({ feedbackSimulado: v })} options={[{ value: "final", label: "Ao final" }, { value: "imediato", label: "A cada questão" }]} />
              </div></li>
              <li><div className="row row--stack">
                <span className="row__main"><span className="row__title">Vídeo da correção</span><span className="row__sub">{s.video === "app" ? "Abre aqui, no ponto da questão, sem sair do app" : "Abre o YouTube numa nova aba, no ponto da questão"}</span></span>
                <SegmentedControl size="sm" aria-label="Vídeo da correção" value={s.video} onChange={(v) => set({ video: v })} options={[{ value: "app", label: "No app" }, { value: "youtube", label: "No YouTube" }]} />
              </div></li>
              <li><label className="row">
                <span className="row__main"><span className="row__title">Incluir questões sem vídeo e polêmicas</span><span className="row__sub">Por padrão ficam de fora as sem correção em vídeo ou que geraram discussão</span></span>
                <Switch checked={s.incluirTodas} onChange={(v) => set({ incluirTodas: v })} label="Incluir questões sem vídeo e polêmicas" />
              </label></li>
            </ul>
          </Group>

          <Group id="metas" title="Metas e cronograma">
            <ul className="list">
              {plan ? (
                <li><div className="row">
                  <span className="row__main"><span className="row__title">Meta diária: {num(plan.meta)} questões</span><span className="row__sub">Vem do cronograma até {plan.exame}</span></span>
                </div></li>
              ) : (
                <li><div className="row row--2">
                  <span className="row__main"><span className="row__title">Meta diária</span><span className="row__sub">Sem cronograma, é a meta de Hoje</span></span>
                  <Stepper label="Meta diária" value={s.metaDiaria} min={5} max={150} step={5} onChange={(v) => set({ metaDiaria: v })} />
                </div></li>
              )}
              {!plan ? <LinkRow icon="calendar" title="Montar cronograma" sub="Uma prova, uma data e a meta de cada dia" onClick={() => nav("/cronograma/novo")} /> : null}
            </ul>
          </Group>

          <Group id="aparencia" title="Leitura e aparência">
            <ul className="list">
              <li><div className="row row--stack">
                <span className="row__main"><span className="row__title">Tema</span><span className="row__sub">{prefs.tema === "sistema" ? "Acompanha o claro ou escuro do aparelho" : prefs.tema === "claro" ? "Sempre claro" : "Sempre escuro"}</span></span>
                <SegmentedControl<ThemePref> size="sm" aria-label="Tema" value={prefs.tema} onChange={(v) => prefs.setPrefs({ tema: v })} options={[{ value: "sistema", label: "Sistema" }, { value: "claro", label: "Claro" }, { value: "escuro", label: "Escuro" }]} />
              </div></li>
              <li><div className="row row--stack">
                <span className="row__main"><span className="row__title">Tamanho do texto</span><span className="row__sub">Enunciado, alternativas e flashcards</span></span>
                <SegmentedControl size="sm" aria-label="Tamanho do texto" value={s.leitura.scale} onChange={(v) => set({ leitura: { ...s.leitura, scale: v } })} options={[{ value: 0.9, label: "Menor" }, { value: 1, label: "Padrão" }, { value: 1.15, label: "Maior" }]} />
              </div></li>
              <li><div className="row row--stack">
                <span className="row__main"><span className="row__title">Fonte do enunciado</span></span>
                <SegmentedControl size="sm" aria-label="Fonte do enunciado" value={s.leitura.face} onChange={(v) => set({ leitura: { ...s.leitura, face: v } })} options={[{ value: "serif", label: "Literata" }, { value: "sans", label: "Hanken" }]} />
              </div></li>
              <li className="aj__preview" aria-label="Prévia da leitura">
                <span className="caps">Prévia</span>
                <p style={{ fontFamily: s.leitura.face === "serif" ? "var(--font-reading)" : "var(--font-sans)", fontSize: `calc(17px * ${s.leitura.scale})` }}>
                  Homem de 71 anos, tabagista, chega ao pronto-socorro com dor retroesternal em aperto há 40 minutos, irradiada para o braço esquerdo. Qual é a conduta inicial?
                </p>
              </li>
            </ul>
          </Group>

          <Group id="flashcards" title="Flashcards">
            <ul className="list">
              <li><div className="row row--2">
                <span className="row__main"><span className="row__title">Cards novos por dia</span><span className="row__sub">Padrão para os baralhos que não têm um valor próprio</span></span>
                <Stepper label="Cards novos por dia" value={s.cardsNovosPorDia} min={0} max={200} step={5} onChange={(v) => set({ cardsNovosPorDia: v })} />
              </div></li>
              <li><div className="row"><span className="row__main"><span className="row__sub">Os perfis de estudo e o modo Anki completo ficam nas opções de cada baralho. As revisões de flashcards não entram no desempenho das questões.</span></span></div></li>
            </ul>
          </Group>

          <Group id="dados" title="Dados">
            <ul className="list">
              <li><div className="row row--icon row--2 aj__syncrow">
                <span className="row__icon"><Icon name="sync" size={20} /></span>
                <span className="row__main"><span className="row__title">Sincronização</span><span className="row__sub" role="status">{syncLabel(sync)}</span></span>
                <Button variant="gray" size="sm" loading={sync.state === "enviando"} onClick={() => syncNow()}>Sincronizar agora</Button>
              </div></li>
              <StorageRow />
              <li><button type="button" className="row row--icon cd-hoverable" disabled={exporting} onClick={exportAll}>
                <span className="row__icon">{exporting ? <span className="cd-spinner" aria-label="Exportando" /> : <Icon name="file" size={20} />}</span>
                <span className="row__main"><span className="row__title">Exportar meus dados</span><span className="row__sub">Conta, respostas, simulados, cronograma, metas, flashcards e resumos em um arquivo JSON.</span></span>
              </button></li>
              {import.meta.env.DEV && !demo ? (
                <li><button type="button" className="row row--icon cd-hoverable" onClick={() => { useStore.getState().load(makeDemo(bank)); toast({ text: "Dados de exemplo carregados.", icon: "check" }); nav("/"); }}>
                  <span className="row__icon"><Icon name="layers" size={20} /></span>
                  <span className="row__main"><span className="row__title">Ver com dados de exemplo</span><span className="row__sub">Só em desenvolvimento. Dez semanas de um estudante fictício, sem ir para o servidor.</span></span>
                </button></li>
              ) : null}
              {plan ? (
                <li><button type="button" className="row row--icon row--danger cd-hoverable" onClick={() => setConfirm("plan")}>
                  <span className="row__icon"><Icon name="calendar" size={20} /></span>
                  <span className="row__main"><span className="row__title">Apagar o cronograma</span></span>
                </button></li>
              ) : null}
              <li><button type="button" className="row row--icon row--danger cd-hoverable" onClick={() => setConfirm("reset")}>
                <span className="row__icon"><Icon name="trash" size={20} /></span>
                <span className="row__main"><span className="row__title">{demo ? "Apagar os dados de exemplo" : "Apagar todo o histórico"}</span><span className="row__sub">Respostas, simulados e cronograma, em todos os seus aparelhos. Flashcards ficam.</span></span>
              </button></li>
            </ul>
          </Group>
        </div>
      </div>

      <Dialog open={confirm === "sair"} onClose={() => setConfirm(null)} confirmLabel="Sair" title="Sair da conta?"
        onConfirm={() => { void signOut(); }}>
        {sync.pending && sync.state === "sem_conexao"
          ? `Sem conexão, ${plural(sync.pending, "item ainda não foi enviado e será perdido", "itens ainda não foram enviados e serão perdidos")} ao sair. Se puder, espere a internet voltar.`
          : "Seus estudos continuam na sua conta. O que estava guardado neste navegador sai daqui."}
      </Dialog>
      <Dialog open={confirm === "reset"} onClose={() => setConfirm(null)} destructive confirmLabel="Apagar" title={demo ? "Apagar os dados de exemplo?" : "Apagar todo o histórico?"}
        onConfirm={() => { useStore.getState().resetAll(); nav("/boas-vindas", { replace: true }); }}>
        Respostas, simulados e cronograma saem deste aparelho e da sua conta. Não dá para desfazer.
      </Dialog>
      <Dialog open={confirm === "plan"} onClose={() => setConfirm(null)} destructive confirmLabel="Apagar" title="Apagar o cronograma?"
        onConfirm={() => { useStore.getState().setPlan(null); toast({ text: "Cronograma apagado.", icon: "check" }); }}>
        Suas respostas continuam. Dá para montar outro quando quiser.
      </Dialog>
      <ChangePassword open={sheet === "senha"} onClose={() => setSheet(null)} />
      <DeleteAccount open={sheet === "apagar"} onClose={() => setSheet(null)} />
    </Page>
  );
}

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="aj__group" id={"aj-" + id} aria-labelledby={"aj-t-" + id}>
      <h2 className="sec__title" id={"aj-t-" + id}>{title}</h2>
      {children}
    </section>
  );
}

function LinkRow({ icon, title, sub, onClick }: { icon: string; title: string; sub?: string; onClick: () => void }) {
  return (
    <li><button type="button" className="row row--icon cd-hoverable" onClick={onClick}>
      <span className="row__icon"><Icon name={icon} size={20} /></span>
      <span className="row__main"><span className="row__title">{title}</span>{sub ? <span className="row__sub">{sub}</span> : null}</span>
      <span className="row__end"><Icon name="chevron-right" size={18} className="row__chev" /></span>
    </button></li>
  );
}

function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState(""), [next, setNext] = useState("");
  const [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const close = () => { setCurrent(""); setNext(""); setErr(null); onClose(); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!current) { setErr("Informe a senha atual."); return; }
    if (next.length < 8) { setErr("A senha nova precisa ter ao menos 8 caracteres."); return; }
    setErr(null); setBusy(true);
    try { await apiPost("/auth/password", { current, next }); toast({ icon: "check", text: "Senha trocada. Os outros aparelhos saíram da conta." }); close(); }
    catch (x) { setErr(errorText(x)); }
    setBusy(false);
  };
  return (
    <Sheet open={open} onClose={close} title="Trocar a senha" width={440}>
      <form className="auth-form" onSubmit={submit} noValidate>
        <PasswordField label="Senha atual" autoComplete="current-password" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} />
        <PasswordField label="Senha nova" autoComplete="new-password" hint="Pelo menos 8 caracteres." value={next} onChange={(e) => setNext(e.target.value)} />
        <FormError>{err}</FormError>
        <Button variant="filled" type="submit" block loading={busy}>Trocar a senha</Button>
      </form>
    </Sheet>
  );
}

function DeleteAccount({ open, onClose }: { open: boolean; onClose: () => void }) {
  const forgetLocal = useAuth((s) => s.forgetLocal);
  const [password, setPassword] = useState(""), [word, setWord] = useState("");
  const [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const close = () => { setPassword(""); setWord(""); setErr(null); onClose(); };
  const ready = !!password && word.trim().toUpperCase() === CONFIRM_WORD;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setErr(null); setBusy(true);
    try { await apiDelete("/me", { password }); await forgetLocal(); }
    catch (x) { setErr(x instanceof ApiError ? x.message : "Não deu para apagar agora. Tente de novo."); setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={close} title="Apagar a conta" subtitle="Saem a conta, as respostas, os flashcards, os resumos e os comentários. Não dá para desfazer." width={440}>
      <form className="auth-form" onSubmit={submit} noValidate>
        <PasswordField label="Sua senha" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        <label className="auth-field"><span>Digite {CONFIRM_WORD} para confirmar</span>
          <input autoComplete="off" autoCapitalize="characters" value={word} onChange={(e) => setWord(e.target.value)} />
        </label>
        <FormError>{err}</FormError>
        <Button variant="destructive" type="submit" block disabled={!ready} loading={busy}>Apagar minha conta</Button>
      </form>
    </Sheet>
  );
}

const sizeText = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1).replace(".", ",")} GB` : `${Math.max(b > 0 ? 1 : 0, Math.round(b / 1024 ** 2))} MB`);

/** quanto dos 4 GB a pessoa já usou; baralhos assinados e arquivos que outra pessoa já enviou não contam */
function StorageRow() {
  const [q, setQ] = useState<{ usedBytes: number; limitBytes: number } | null>(null);
  useEffect(() => { apiGet<{ usedBytes: number; limitBytes: number }>("/me/quota").then(setQ, () => setQ(null)); }, []);
  if (!q) return null;
  return (
    <>
    <li className="row row--icon">
      <span className="row__icon"><Icon name="layers" size={20} /></span>
      <span className="row__main"><span className="row__title">Espaço dos seus arquivos: {sizeText(q.usedBytes)} de {sizeText(q.limitBytes)}</span><span className="row__sub">Imagens dos resumos e dos seus baralhos. Baralhos que você assina não contam.</span></span>
    </li>
      <li className="row row--icon">
        <span className="row__icon"><Icon name="eye" size={20} /></span>
        <span className="row__main"><span className="row__title">Registro de uso</span><span className="row__sub">Quem cuida do Conduta Med vê quais telas você abre e por quanto tempo, nunca o que está nelas. A sequência é apagada em 90 dias.</span></span>
      </li>
    </>
  );
}
