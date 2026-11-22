/* Os dois palcos do treino: o 3D (ossos e músculos) e o papel milimetrado do ECG. Os dois ouvem o motor. */
import { useEffect, useRef, useState } from "react";
import type { Conjunto, ItemDef } from "./catalogo";
import type { Cena } from "./cena3d";
import { FS, mv, RITMOS, tracado } from "./ecg";
import type { Motor } from "./motor";

const claro = () => document.documentElement.dataset.theme !== "dark";
const itemAtual = (motor: Motor) => motor.atual?.id ?? null;

export function Palco3D({ motor, conjunto }: { motor: Motor; conjunto: Conjunto }) {
  const canvas = useRef<HTMLCanvasElement>(null), mini = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<"carregando" | "pronto" | "erro">("carregando");

  useEffect(() => {
    let cena: Cena | null = null, vivo = true;
    const defs = new Map<string, ItemDef>(conjunto.itens.map((i) => [i.id, i]));
    const pecas = (id: string) => defs.get(id)?.pecas ?? [id];
    const focar = (id: string | null) => { if (cena) cena.focar(id ? pecas(id) : null, id ? defs.get(id)?.vista ?? conjunto.vista : conjunto.vista); };
    const off = motor.ouvir((e) => {
      if (!cena) return;
      if (e.t === "novo") { if (motor.get().idx === 0) cena.mostrarTodos(); focar(e.id); }
      else if (e.t === "certo") cena.dissolver(pecas(e.id));
      else if (e.t === "fim") { cena.mostrarTodos(); focar(null); }
    });
    const mo = new MutationObserver(() => cena?.tema(claro()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    // o three só é baixado aqui, quando a tela abre
    import("./cena3d").then((m) => m.criarCena(canvas.current!, mini.current!, `/treino/${conjunto.modelo}.bin`, conjunto.vista)).then((c) => {
      if (!vivo) { c.destruir(); return; }
      cena = c; c.tema(claro()); focar(itemAtual(motor)); setEstado("pronto");
    }).catch(() => { if (vivo) setEstado("erro"); });
    return () => { vivo = false; off(); mo.disconnect(); cena?.destruir(); };
  }, [motor, conjunto]);

  return (
    <>
      <canvas ref={canvas} className="tr-3d" data-pronto={estado === "pronto" ? "" : undefined} aria-label="Modelo em 3D. Arraste para girar." />
      <div className="tr-mini" ref={mini}><span>{conjunto.legenda}</span></div>
      {estado !== "pronto" ? <p className="tr__aviso">{estado === "erro" ? "Não deu para carregar o modelo 3D. Recarregue a página." : "Carregando o modelo…"}</p> : null}
    </>
  );
}

const VEL = 25, GANHO = 10, ZOOM = 2;

export function PalcoEcg({ motor }: { motor: Motor }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [atual, setAtual] = useState<string | null>(() => itemAtual(motor));

  useEffect(() => {
    const canvas = ref.current!, ctx = canvas.getContext("2d")!;
    let W = 0, H = 0, dpr = 1, raf = 0;
    let cor = { papel: "#fff", fina: "#eee", grossa: "#ddd", traco: "#c00", aro: "#888" };
    let ritmo: string | null = null, t0 = performance.now(), some = 0, sumindo = false;
    const calmo = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const lerCores = () => {
      const cs = getComputedStyle(canvas), v = (n: string) => cs.getPropertyValue(n).trim();
      cor = { papel: v("--tr-papel"), fina: v("--tr-grade"), grossa: v("--tr-grade-2"), traco: v("--tr-traco"), aro: v("--tr-aro") };
    };
    const medir = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(devicePixelRatio || 1, 2); W = Math.max(1, r.width); H = Math.max(1, r.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    };
    lerCores(); medir();
    const ro = new ResizeObserver(medir); ro.observe(canvas);
    const mo = new MutationObserver(lerCores); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const comeca = (id: string | null) => { ritmo = id; t0 = performance.now(); some = 0; sumindo = false; setAtual(id); };
    comeca(itemAtual(motor));
    const off = motor.ouvir((e) => {
      if (e.t === "novo") comeca(e.id);
      else if (e.t === "certo") sumindo = true;
      else if (e.t === "fim") comeca(null);
    });

    /** papel milimetrado: linhas a cada 1 mm e mais fortes a cada 5 mm, alinhadas à linha de base */
    const grade = (x0: number, x1: number, y0: number, y1: number, mm: number, ox: number, oy: number, peso: number) => {
      for (const [passo, c, lw] of [[mm, cor.fina, 1], [mm * 5, cor.grossa, 1.2]] as const) {
        ctx.beginPath(); ctx.strokeStyle = c; ctx.lineWidth = lw * peso;
        for (let x = ox + Math.ceil((x0 - ox) / passo) * passo; x <= x1; x += passo) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
        for (let y = oy + Math.ceil((y0 - oy) / passo) * passo; y <= y1; y += passo) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
        ctx.stroke();
      }
    };

    const quadro = (agora: number) => {
      raf = requestAnimationFrame(quadro);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const compacto = W < 560;
      const mm = Math.min(6.5, Math.max(compacto ? 2.4 : 3, W / 190));   // px por milímetro
      const pxs = VEL * mm, pxmv = GANHO * mm;                             // px por segundo e por mV
      const raio = compacto ? Math.min(58, H * 0.2) : Math.min(118, Math.max(52, H * 0.3, W * 0.09));
      const lx = W - raio - (compacto ? 12 : 28), ly = compacto ? raio + 12 : H / 2;
      const base = Math.round(H * (compacto ? 0.66 : 0.56) / mm / 5) * mm * 5;   // linha de base em cima de uma linha grossa
      const larg = compacto ? W : lx - raio - 18;                          // onde o traçado corre
      ctx.fillStyle = cor.papel; ctx.fillRect(0, 0, W, H);
      grade(0, W, 0, H, mm, 0, base, 1);
      if (!ritmo) return;

      const b = tracado(ritmo), t = calmo ? 60 : (agora - t0) / 1000;
      if (sumindo) some = Math.min(1, some + (calmo ? 1 : 1 / 30));
      const pena = (t * pxs) % larg, vao = 26;
      const y = (tt: number) => base - mv(b, tt) * pxmv;

      ctx.globalAlpha = 1 - some;
      ctx.strokeStyle = cor.traco; ctx.lineWidth = 1.7; ctx.lineJoin = "round"; ctx.lineCap = "round";
      const passo = pxs / FS;
      // a volta atual: da esquerda até a pena
      ctx.beginPath();
      for (let x = 0, n = 0; x <= pena; x += passo, n++) { const yy = y(t - (pena - x) / pxs); n ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
      ctx.lineTo(pena, y(t)); ctx.stroke();
      // a volta anterior, ainda à direita da pena (depois do vão que a pena vai apagando)
      if (t * pxs > larg) {
        ctx.beginPath();
        for (let x = pena + vao, n = 0; x <= larg; x += passo, n++) { const yy = y(t - (pena + larg - x) / pxs); n ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
        ctx.stroke();
      }
      ctx.fillStyle = cor.traco; ctx.beginPath(); ctx.arc(pena, y(t), 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;

      // lupa: o último segundo e pouco, ampliado
      ctx.save();
      ctx.beginPath(); ctx.arc(lx, ly, raio, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = cor.papel; ctx.fillRect(lx - raio, ly - raio, raio * 2, raio * 2);
      const zm = mm * ZOOM, zs = pxs * ZOOM, zv = pxmv * ZOOM, zb = ly + zv * 0.2;
      const tc = t - (raio * 0.55) / zs;                           // o instante no centro da lupa
      grade(lx - raio, lx + raio, ly - raio, ly + raio, zm, lx - ((tc * zs) % (zm * 5)), zb, 1.25);
      ctx.globalAlpha = 1 - some;
      ctx.strokeStyle = cor.traco; ctx.lineWidth = 2.4; ctx.lineJoin = "round";
      ctx.beginPath();
      for (let tt = Math.max(0, tc - raio / zs), n = 0; tt <= t; tt += 1 / FS / 2, n++) { const xx = lx + (tt - tc) * zs, yy = zb - mv(b, tt) * zv; n ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
      ctx.stroke();
      ctx.fillStyle = cor.traco; ctx.beginPath(); ctx.arc(lx + (t - tc) * zs, zb - mv(b, t) * zv, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(lx, ly, raio, 0, Math.PI * 2); ctx.strokeStyle = cor.aro; ctx.lineWidth = 2.5; ctx.stroke();
    };
    raf = requestAnimationFrame(quadro);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); mo.disconnect(); off(); };
  }, [motor]);

  const r = atual ? RITMOS[atual] : undefined;
  return (
    <>
      <canvas ref={ref} className="tr-ecg" aria-label="Traçado de ECG sintético em papel milimetrado" />
      {r ? <div className="tr-deriv"><b>{r.deriv}</b>{r.nota ? <span>{r.nota}</span> : null}</div> : null}
    </>
  );
}
