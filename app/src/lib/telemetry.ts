/* Quais telas a pessoa abriu e por quanto tempo ficou ativa em cada uma, para quem cuida da plataforma entender o uso.
   Vai só o endereço com os ids trocados por :id, nunca o que está na tela. Tempo só conta com a aba à vista e alguém mexendo:
   dois minutos parado, o relógio para. Está dito nos Termos e em Ajustes. */
import { useEffect } from "react";
import { useAuth } from "../state/auth";
import { uid } from "./random";

type Ev = { path: string; at: number; ms: number };
const IDLE_MS = 120_000, TICK_MS = 5_000, FLUSH_MS = 60_000;
const visit = uid();
let queue: Ev[] = [], cur: Ev | null = null, lastInput = Date.now(), started = false;

export function screenOf(path: string) {
  return path
    .replace(/^\/(sessao|resultado|correcao|questao|analises)\/[^/]+/, "/$1/:id")
    .replace(/^\/flashcards\/(baralho|opcoes|revisar)\/[^/]+/, "/flashcards/$1/:id")
    .replace(/^\/u\/[^/]+\/resumos\/[^/]+/, "/u/:handle/resumos/:id")
    .replace(/^\/u\/[^/]+/, "/u/:handle")
    .replace(/^\/resumos\/(?!lixeira)[^/]+/, "/resumos/:id")
    .replace(/^\/admin\/pessoas\/[^/]+/, "/admin/pessoas/:id")
    .slice(0, 80);
}

function close() {
  if (!cur) return;
  if (cur.ms >= 1000) queue.push(cur);
  cur = null;
}
function flush(beacon = false) {
  if (!queue.length || !useAuth.getState().user) { if (!useAuth.getState().user) queue = []; return; }
  const events = queue.slice(0, 50);
  queue = queue.slice(50);
  const body = JSON.stringify({ visit, events });
  if (beacon && navigator.sendBeacon?.("/api/uso", new Blob([body], { type: "application/json" }))) return;
  fetch("/api/uso", { method: "POST", credentials: "same-origin", keepalive: true, headers: { "Content-Type": "application/json" }, body }).catch(() => { /* perder um pedaço do registro não faz mal */ });
}
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const touch = () => { lastInput = Date.now(); };
  for (const e of ["pointerdown", "keydown", "scroll", "wheel"]) addEventListener(e, touch, { passive: true, capture: true });
  setInterval(() => { if (cur && document.visibilityState === "visible" && Date.now() - lastInput < IDLE_MS) cur.ms += TICK_MS; }, TICK_MS);
  setInterval(() => flush(), FLUSH_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden" || !cur) return;
    const path = cur.path;
    close(); flush(true);
    cur = { path, at: Date.now(), ms: 0 };
  });
  addEventListener("pagehide", () => { close(); flush(true); });
}

export function useTelemetry(pathname: string) {
  const signedIn = useAuth((s) => !!s.user);
  useEffect(() => {
    if (!signedIn) { close(); queue = []; return; }
    start();
    close();
    cur = { path: screenOf(pathname), at: Date.now(), ms: 0 };
    touchNow();
    if (queue.length >= 20) flush();
  }, [pathname, signedIn]);
}
const touchNow = () => { lastInput = Date.now(); };
