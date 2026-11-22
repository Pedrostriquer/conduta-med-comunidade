/* O corpo 3D do treino, fora do jogo: serve para ESCOLHER a região (clicando numa zona do esqueleto) e para EXPLORAR
   (camadas, clicar para ver o nome, isolar, esconder, buscar). Importa o three: só é baixado quando uma dessas telas abre.

   Lê os mesmos arquivos /treino/<id>.bin do jogo (ver scripts/treino_modelos.mjs). Todos estão no mesmo sistema
   (X = esquerda do paciente, Y = para cima, Z = para a frente, em mm), então peças de arquivos diferentes se encaixam.
   Cada peça entra com o id "<arquivo>/<peça>". Aqui as peças são sólidas e iluminadas (não é a cena de fantasmas do jogo). */
import * as THREE from "three";

export type TipoPeca = "o" | "m" | "g" | "p";
export type PecaInfo = { id: string; arquivo: string; peca: string; tipo: TipoPeca };
export type EstadoPeca = "solido" | "fantasma" | "oculto";

export type Corpo = {
  /** baixa um arquivo e põe as peças na cena; devolve as que entraram */
  carregar: (arquivo: string, opts?: { so?: TipoPeca[]; pula?: (peca: string) => boolean; estado?: EstadoPeca }) => Promise<PecaInfo[]>;
  estado: (id: string, e: EstadoPeca) => void;
  /** a peça escolhida fica na cor de destaque */
  selecionar: (id: string | null) => void;
  /** peças realçadas de leve (a zona sob o ponteiro, a região escolhida) */
  realcar: (ids: string[]) => void;
  /** leva a câmera até as peças; null = tudo o que está visível */
  enquadrar: (ids: string[] | null) => void;
  tema: (claro: boolean) => void;
  destruir: () => void;
};

const COR_ORGAO: [RegExp, string][] = [
  [/^coracao/, "#b5483f"], [/^pulmao/, "#dba5a0"], [/^figado/, "#8e4a39"], [/^vesicula/, "#5f8a4e"], [/^estomago/, "#dba78c"], [/^(duodeno|jejuno|ileo)/, "#e2b79b"],
  [/^(colon|apendice|reto)/, "#c99a80"], [/^(rim|suprarrenal|ureter)/, "#96503f"], [/^bexiga/, "#e3c56d"], [/^baco/, "#7c4a5f"], [/^pancreas/, "#e0c080"],
  [/^(aorta|arco|arteria)/, "#c23b2e"], [/^veia/, "#4c70a8"], [/^(traqueia|bronquios|cartilagem)/, "#cdd7dc"], [/^esofago/, "#c98f7e"], [/^timo/, "#e6b8a8"],
  [/^(cerebelo|ponte|bulbo|mesencefalo)/, "#d9c6b6"], [/^olho/, "#f1f1ee"], [/^diafragma/, "#b9584b"],
];

type Parte = PecaInfo & { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; cor: THREE.Color; estado: EstadoPeca };

export function criarCorpo(canvas: HTMLCanvasElement, opts: { aoClicar?: (id: string | null) => void; aoPairar?: (id: string | null) => void; vista?: [number, number] } = {}): Corpo {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  const FOV = 30, TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const cam = new THREE.PerspectiveCamera(FOV, 1, 10, 12000);
  // a luz acompanha a câmera: a peça da frente está sempre bem iluminada
  const ceu = new THREE.HemisphereLight(0xffffff, 0x54606e, 1.15), sol = new THREE.DirectionalLight(0xffffff, 1.9);
  scene.add(ceu, cam); cam.add(sol); sol.position.set(-0.5, 0.7, 1);

  const partes = new Map<string, Parte>();
  let selecionada: string | null = null, realcadas = new Set<string>(), claro = true;
  const destaque = new THREE.Color("#1468d5");

  const pintar = (p: Parte) => {
    const m = p.mat, fantasma = p.estado === "fantasma" || p.tipo === "p";
    p.mesh.visible = p.estado !== "oculto";
    m.transparent = fantasma; m.depthWrite = !fantasma; m.opacity = p.tipo === "p" ? (claro ? 0.16 : 0.11) : fantasma ? (claro ? 0.2 : 0.14) : 1;
    p.mesh.renderOrder = fantasma ? 2 : 0;
    if (p.id === selecionada) { m.color.copy(destaque); m.emissive.copy(destaque).multiplyScalar(0.25); }
    else { m.color.copy(p.cor); m.emissive.copy(realcadas.has(p.id) ? destaque : p.cor).multiplyScalar(realcadas.has(p.id) ? 0.55 : 0); if (realcadas.has(p.id)) m.color.copy(p.cor).lerp(destaque, 0.45); }
    m.needsUpdate = true;
  };
  const corDe = (tipo: TipoPeca, peca: string) => new THREE.Color(
    tipo === "m" ? "#c4695a" : tipo === "p" ? (claro ? "#7d8ea3" : "#b4c3d6") : tipo === "g" ? (COR_ORGAO.find(([r]) => r.test(peca))?.[1] ?? "#c9a08f") : claro ? "#e3d9c2" : "#ece3cf");

  // órbita: cada valor persegue a sua meta
  const [YAW0, PITCH0] = opts.vista ?? [-0.35, 0.08];
  let W = 1, H = 1, focoH = 900, focoW = 400, zoom = 1;
  /** distância para caber uma caixa de meia-altura h e meia-largura w */
  const distPara = () => Math.max(focoH / TAN, focoW / (TAN * (W / H)));
  const o = { yaw: YAW0, pitch: PITCH0, dist: 3000, alvo: new THREE.Vector3(0, 900, 0) };
  const meta = { yaw: YAW0, pitch: PITCH0, dist: 3000, alvo: new THREE.Vector3(0, 900, 0) };
  let primeira = true;
  const calmo = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const medir = () => {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(W, H, false);
    cam.aspect = W / H; cam.updateProjectionMatrix();
    meta.dist = distPara() * zoom;
  };
  medir();
  const ro = new ResizeObserver(medir); ro.observe(canvas);

  // ponteiro: arrastar gira, a roda e a pinça aproximam; um toque sem arrasto escolhe a peça
  const raio = new THREE.Raycaster(), ponto = new THREE.Vector2();
  const sob = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    ponto.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raio.setFromCamera(ponto, cam);
    const alvos = [...partes.values()].filter((p) => p.estado === "solido" && p.tipo !== "p").map((p) => p.mesh);
    const hit = raio.intersectObjects(alvos, false)[0];
    return hit ? (hit.object.userData.id as string) : null;
  };
  const dedos = new Map<number, { x: number; y: number }>();
  let andou = 0, pinca = 0, pairando: string | null = null;
  const aproximar = (f: number) => { zoom = THREE.MathUtils.clamp(zoom * f, 0.12, 3); meta.dist = distPara() * zoom; };
  const down = (e: PointerEvent) => { dedos.set(e.pointerId, { x: e.clientX, y: e.clientY }); andou = 0; pinca = 0; try { canvas.setPointerCapture(e.pointerId); } catch { /* ponteiro sintético */ } };
  const move = (e: PointerEvent) => {
    const d = dedos.get(e.pointerId);
    if (!d) { const id = sob(e); if (id !== pairando) { pairando = id; canvas.style.cursor = id ? "pointer" : "grab"; opts.aoPairar?.(id); } return; }
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    andou += Math.abs(dx) + Math.abs(dy);
    if (dedos.size === 1 && andou > 4) { meta.yaw -= dx * 0.008; meta.pitch = THREE.MathUtils.clamp(meta.pitch + dy * 0.006, -1.35, 1.35); canvas.style.cursor = "grabbing"; }
    d.x = e.clientX; d.y = e.clientY;
    if (dedos.size === 2) { const [a, b] = [...dedos.values()], dist = Math.hypot(a.x - b.x, a.y - b.y); if (pinca) aproximar(pinca / dist); pinca = dist; }
  };
  const up = (e: PointerEvent) => {
    const tinha = dedos.delete(e.pointerId); pinca = 0; canvas.style.cursor = "grab";
    if (tinha && !dedos.size && andou <= 4) opts.aoClicar?.(sob(e));
  };
  const sair = () => { if (pairando) { pairando = null; opts.aoPairar?.(null); } };
  const roda = (e: WheelEvent) => { e.preventDefault(); aproximar(Math.exp(e.deltaY * 0.0015)); };
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up); canvas.addEventListener("pointerleave", sair); canvas.addEventListener("wheel", roda, { passive: false });
  canvas.style.cursor = "grab"; canvas.style.touchAction = "none";

  let raf = 0, antes = performance.now(), vivo = true;
  const quadro = (agora: number) => {
    if (!vivo) return;
    raf = requestAnimationFrame(quadro);
    const dt = Math.min(0.05, (agora - antes) / 1000); antes = agora;
    const k = calmo || primeira ? 1 : 1 - Math.exp(-dt * 6);
    o.yaw += (meta.yaw - o.yaw) * k; o.pitch += (meta.pitch - o.pitch) * k; o.dist += (meta.dist - o.dist) * k; o.alvo.lerp(meta.alvo, k);
    const cp = Math.cos(o.pitch);
    cam.position.set(o.alvo.x + o.dist * Math.sin(o.yaw) * cp, o.alvo.y + o.dist * Math.sin(o.pitch), o.alvo.z + o.dist * Math.cos(o.yaw) * cp);
    cam.lookAt(o.alvo);
    renderer.render(scene, cam);
  };
  raf = requestAnimationFrame(quadro);

  const enquadrar = (ids: string[] | null) => {
    const cx = new THREE.Box3();
    for (const p of partes.values()) if (ids ? ids.includes(p.id) : p.estado !== "oculto" && p.tipo !== "p") cx.union(p.mesh.geometry.boundingBox!);
    if (cx.isEmpty()) return;
    const t = cx.getSize(new THREE.Vector3()), folga = ids && ids.length === 1 ? 1.7 : 1.1;
    focoH = Math.max(30, t.y / 2) * folga; focoW = Math.max(30, Math.hypot(t.x, t.z) / 2) * folga * 0.9; zoom = 1;
    meta.alvo.copy(cx.getCenter(new THREE.Vector3())); meta.dist = distPara();
    if (primeira) { o.alvo.copy(meta.alvo); o.dist = meta.dist; primeira = false; }
  };

  return {
    async carregar(arquivo, cfg = {}) {
      const res = await fetch(`/treino/${arquivo}.bin`);
      if (!res.ok) throw new Error("modelo " + res.status);
      const buf = await res.arrayBuffer();
      if (!vivo) return [];
      const hLen = new DataView(buf).getUint32(0, true);
      const cab = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hLen))) as { escala: number; origem: number[]; pecas: { id: string; tipo: TipoPeca; v: [number, number]; i: [number, number] }[] };
      const nV = cab.pecas.reduce((a, p) => a + p.v[1], 0), nI = cab.pecas.reduce((a, p) => a + p.i[1], 0);
      const q = new Int16Array(buf, 4 + hLen, nV * 3), ind = new Uint16Array(buf, 4 + hLen + nV * 6, nI);
      const novas: PecaInfo[] = [];
      for (const p of cab.pecas) {
        const id = arquivo + "/" + p.id;
        if (partes.has(id) || (cfg.so && !cfg.so.includes(p.tipo)) || cfg.pula?.(p.id)) continue;
        const pos = new Float32Array(p.v[1] * 3);
        for (let k = 0; k < p.v[1] * 3; k++) pos[k] = (q[p.v[0] * 3 + k] + 32500) * cab.escala + cab.origem[k % 3];
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        g.setIndex(new THREE.BufferAttribute(ind.slice(p.i[0], p.i[0] + p.i[1]), 1));
        g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
        const mat = new THREE.MeshStandardMaterial({ roughness: p.tipo === "o" ? 0.62 : 0.78, metalness: 0, side: p.tipo === "o" ? THREE.FrontSide : THREE.DoubleSide });
        const mesh = new THREE.Mesh(g, mat);
        mesh.userData.id = id;
        scene.add(mesh);
        const parte: Parte = { id, arquivo, peca: p.id, tipo: p.tipo, mesh, mat, cor: corDe(p.tipo, p.id), estado: cfg.estado ?? "solido" };
        partes.set(id, parte); pintar(parte);
        novas.push({ id, arquivo, peca: p.id, tipo: p.tipo });
      }
      if (primeira) enquadrar(null);
      return novas;
    },
    estado(id, e) { const p = partes.get(id); if (p && p.estado !== e) { p.estado = e; pintar(p); } },
    selecionar(id) { const antes = selecionada; selecionada = id; for (const x of [antes, id]) { const p = x ? partes.get(x) : undefined; if (p) pintar(p); } },
    realcar(ids) { const antes = realcadas; realcadas = new Set(ids); for (const x of new Set([...antes, ...ids])) { const p = partes.get(x); if (p) pintar(p); } },
    enquadrar,
    tema(c) {
      claro = c;
      const cs = getComputedStyle(canvas).getPropertyValue("--accent").trim();
      destaque.set(c ? cs || "#1468d5" : "#79b4ff");
      for (const p of partes.values()) { p.cor = corDe(p.tipo, p.peca); pintar(p); }
    },
    destruir() {
      vivo = false; cancelAnimationFrame(raf); ro.disconnect();
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up); canvas.removeEventListener("pointerleave", sair); canvas.removeEventListener("wheel", roda);
      for (const p of partes.values()) { p.mesh.geometry.dispose(); p.mat.dispose(); }
      renderer.dispose();
    },
  };
}
