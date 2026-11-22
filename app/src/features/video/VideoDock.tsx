/* Correção em vídeo dentro do app: o vídeo do YouTube abre no segundo exato da questão, numa janela que
   flutua no canto (desktop, dá para arrastar entre os cantos) ou fica presa embaixo (celular, dá para recolher).
   Quando o trecho da questão termina, o vídeo pausa e pergunta se quer continuar. Em Ajustes dá para abrir
   direto no YouTube. */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useCompact } from "../../lib/hooks";
import { ease, spring } from "../../lib/motion";
import { useStore } from "../../state/store";
import { Icon } from "../../ds/Icon";
import { Button } from "../../ds/basics";

export type Clip = { id: string; s: number; f: number | null; channel?: string; title?: string };

type Ctx = { play: (c: Clip) => void; close: () => void; clip: Clip | null };
const VideoCtx = createContext<Ctx>({ play: () => {}, close: () => {}, clip: null });
export const useVideo = () => useContext(VideoCtx);

export const ytUrl = (c: Clip) => `https://www.youtube.com/watch?v=${c.id}&t=${c.s}s`;

/* ---------- API do YouTube, carregada sob demanda ---------- */
type YTPlayer = { destroy(): void; getCurrentTime(): number; pauseVideo(): void; playVideo(): void; getPlayerState(): number };
declare global { interface Window { YT?: { Player: new (el: HTMLElement, o: object) => YTPlayer }; onYouTubeIframeAPIReady?: () => void } }
let ytPromise: Promise<NonNullable<Window["YT"]>> | null = null;
function ensureYT() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytPromise) {
    ytPromise = new Promise((res, rej) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT!); };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api"; s.async = true; s.onerror = () => { ytPromise = null; rej(new Error("yt")); };
      document.head.appendChild(s);
      setTimeout(() => rej(new Error("timeout")), 6000);
    });
  }
  return ytPromise;
}

export function VideoProvider({ children }: { children: ReactNode }) {
  const [clip, setClip] = useState<Clip | null>(null);
  const mode = useStore((s) => s.settings.video);
  const play = useCallback((c: Clip) => {
    if (mode === "youtube") { window.open(ytUrl(c), "_blank", "noopener,noreferrer"); return; }
    setClip(c);
  }, [mode]);
  const close = useCallback(() => setClip(null), []);
  return (
    <VideoCtx.Provider value={{ play, close, clip }}>
      {children}
      {createPortal(<AnimatePresence>{clip ? <VideoDock key={clip.id + ":" + clip.s} clip={clip} onClose={close} /> : null}</AnimatePresence>, document.body)}
    </VideoCtx.Provider>
  );
}

type Corner = "br" | "bl" | "tr" | "tl";

function VideoDock({ clip, onClose }: { clip: Clip; onClose: () => void }) {
  const compact = useCompact();
  const [mini, setMini] = useState(false);
  const [big, setBig] = useState(false);
  const [corner, setCorner] = useState<Corner>("br");
  const [prog, setProg] = useState(0);
  const [ended, setEnded] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [fallback, setFallback] = useState(false);
  const host = useRef<HTMLDivElement>(null), player = useRef<YTPlayer | null>(null), stopped = useRef(false);
  const span = clip.f && clip.f > clip.s ? clip.f - clip.s : null;

  useEffect(() => {
    let alive = true, poll = 0;
    ensureYT().then((YT) => {
      if (!alive || !host.current) return;
      const el = document.createElement("div"); host.current.appendChild(el);
      player.current = new YT.Player(el, {
        videoId: clip.id, host: "https://www.youtube-nocookie.com", width: "100%", height: "100%",
        playerVars: { start: clip.s, autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, cc_load_policy: 0 },
        events: { onStateChange: (e: { data: number }) => setPlaying(e.data === 1 || e.data === 3) },
      });
      poll = window.setInterval(() => {
        const p = player.current; if (!p?.getCurrentTime) return;
        const t = p.getCurrentTime();
        if (span) setProg(Math.max(0, Math.min(1, (t - clip.s) / span)));
        if (clip.f && !stopped.current && t >= clip.f + 1) { stopped.current = true; p.pauseVideo(); setEnded(true); }
      }, 250);
    }).catch(() => alive && setFallback(true));
    return () => { alive = false; clearInterval(poll); try { player.current?.destroy(); } catch { /* já fechado */ } player.current = null; };
  }, [clip.id, clip.s, clip.f, span]);

  const toggle = () => { const p = player.current; if (!p) return; if (playing) p.pauseVideo(); else { setEnded(false); p.playVideo(); } };
  const resume = () => { setEnded(false); player.current?.playVideo(); };

  const header = (
    <div className="vd__head">
      <span className="vd__live" aria-hidden><Icon name="video" size={16} /></span>
      <div className="vd__titles">
        <div className="vd__title">{clip.title || "Correção em vídeo"}</div>
        {clip.channel ? <div className="vd__sub">{clip.channel}</div> : null}
      </div>
      {compact ? <Button variant="plain" size="sm" icon={mini ? "chevron-up" : "chevron-down"} label={mini ? "Abrir vídeo" : "Recolher vídeo"} onClick={() => setMini(!mini)} /> : (
        <Button variant="plain" size="sm" icon={big ? "collapse" : "expand"} label={big ? "Diminuir" : "Ampliar"} onClick={() => setBig(!big)} />
      )}
      <Button variant="plain" size="sm" icon="external" label="Abrir no YouTube" href={ytUrl(clip)} />
      <Button variant="plain" size="sm" icon="x" label="Fechar vídeo" onClick={onClose} />
    </div>
  );
  const video = (
    <div className="vd__frame">
      {fallback ? (
        <iframe title="Correção em vídeo" src={`https://www.youtube-nocookie.com/embed/${clip.id}?start=${clip.s}&autoplay=1&rel=0&playsinline=1`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
      ) : <div ref={host} className="vd__host" />}
      <AnimatePresence>
        {ended ? (
          <motion.div className="vd__end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <p>O trecho desta questão terminou.</p>
            <div className="vd__end-actions">
              <Button variant="gray" size="sm" onClick={resume}>Continuar vendo</Button>
              <Button variant="filled" size="sm" onClick={onClose}>Fechar</Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
  const bar = span ? <div className="vd__bar" aria-hidden><i style={{ transform: `scaleX(${prog})` }} /></div> : null;

  if (compact) {
    return (
      <motion.div className="vd vd--dock cd-root" data-mini={mini ? "" : undefined} role="region" aria-label="Correção em vídeo"
        initial={{ y: "110%" }} animate={{ y: 0 }} exit={{ y: "110%", transition: { duration: 0.24, ease: ease.exit } }} transition={spring.smooth}
        drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.05, bottom: 0.5 }} dragSnapToOrigin
        onDragEnd={(_, i) => { if (i.offset.y > 60 || i.velocity.y > 500) setMini(true); else if (i.offset.y < -40) setMini(false); }}>
        <span className="cd-grabber vd__grab" aria-hidden />
        {mini ? (
          <div className="vd__mini">
            <button type="button" className="vd__mini-play" onClick={toggle} aria-label={playing ? "Pausar" : "Continuar"}><Icon name={playing ? "pause" : "play"} size={18} /></button>
            <button type="button" className="vd__mini-text" onClick={() => setMini(false)}>
              <span className="vd__title">{clip.title || "Correção em vídeo"}</span>
              {bar}
            </button>
            <Button variant="plain" size="sm" icon="x" label="Fechar vídeo" onClick={onClose} />
          </div>
        ) : null}
        <div className="vd__body" hidden={mini}>{header}{video}{bar}</div>
      </motion.div>
    );
  }
  return (
    <>
      <AnimatePresence>{big ? <motion.div className="vd__scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setBig(false)} /> : null}</AnimatePresence>
      <motion.div layout className="vd vd--float cd-root" data-corner={corner} data-big={big ? "" : undefined} role="region" aria-label="Correção em vídeo"
        initial={{ opacity: 0, scale: 0.92, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.16, ease: ease.exit } }}
        transition={spring.smooth} drag={!big} dragMomentum={false} dragSnapToOrigin
        onDragEnd={(_, i) => {
          const x = i.point.x, y = i.point.y, w = innerWidth, h = innerHeight;
          setCorner(((y < h / 2 ? "t" : "b") + (x < w / 2 ? "l" : "r")) as Corner);
        }}>
        {header}{video}{bar}
      </motion.div>
    </>
  );
}

/** Cartão da correção em vídeo na questão: só o essencial (canal e duração do trecho). */
export function VideoCard({ clip }: { clip: Clip }) {
  const { play, clip: open } = useVideo();
  const mode = useStore((s) => s.settings.video);
  const len = clip.f && clip.f > clip.s ? Math.max(1, Math.round((clip.f - clip.s) / 60)) : null;
  const on = open?.id === clip.id && open.s === clip.s;
  return (
    <div className="vcard-wrap">
    <button type="button" className="vcard cd-hoverable" onClick={() => play(clip)} data-on={on ? "" : undefined}>
      <span className="vcard__play" aria-hidden><Icon name={on ? "video" : "play"} size={20} /></span>
      <span className="vcard__text">
        <span className="vcard__title">{on ? "Assistindo à correção" : "Assistir à correção"}</span>
        <span className="vcard__sub">{[clip.channel, len ? `${len} min` : null].filter(Boolean).join(" · ")}</span>
      </span>
      {mode === "youtube" ? <span className="vcard__go">YouTube<Icon name="external" size={16} /></span> : <Icon name="chevron-right" size={20} className="vcard__chev" />}
    </button>
    {clip.channel ? (
      <p className="vcard__credit">
        Vídeo do canal {clip.channel}. Se a correção ajudou, <a href={`https://www.youtube.com/watch?v=${clip.id}${clip.s ? `&t=${Math.floor(clip.s)}s` : ""}`} target="_blank" rel="noreferrer">deixe um like no vídeo deles</a>.
      </p>
    ) : null}
    </div>
  );
}
