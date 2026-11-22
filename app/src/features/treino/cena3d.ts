/* A cena 3D do treino (ossos e músculos). Este arquivo é o único que importa o three: só é baixado quando a tela abre.

   Lê um modelo de /treino/<id>.bin (gerado por scripts/treino_modelos.mjs a partir do BodyParts3D), já no sistema do app:
   X = esquerda do paciente, Y = para cima, Z = para a frente, em milímetros.
   Cada peça usa um material só, que vai de "fantasma" (translúcido, a borda desenha o volume) a "aceso" (iluminado) e se
   desfaz em poeira quando a pessoa acerta. Ossos ficam sempre como fantasmas; músculos só aparecem quando é a vez deles.
   A miniatura no canto é a mesma cena vista de longe, desenhada num recorte do mesmo canvas. */
import * as THREE from "three";

type Peca = { id: string; tipo: "o" | "m"; v: [number, number]; i: [number, number] };
type Cabecalho = { escala: number; origem: [number, number, number]; pecas: Peca[] };

/** de onde olhar: a(nterior), p(osterior), l(ateral direito), m(edial), s(uperior), i(nferior), ou [giro, inclinação] em radianos */
export type Vista = "a" | "p" | "l" | "m" | "s" | "i" | [number, number];
const VISTAS: Record<string, [number, number]> = { a: [-0.3, 0.12], p: [Math.PI + 0.3, 0.12], l: [-1.3, 0.1], m: [1.3, 0.1], s: [-0.3, 1.15], i: [-0.3, -1.1] };
const angulos = (v: Vista) => (typeof v === "string" ? VISTAS[v] : v);

export type Cena = {
  /** acende as peças e leva a câmera até elas; null = modelo inteiro, nada aceso */
  focar: (pecas: string[] | null, vista?: Vista) => void;
  /** as peças acesas se desfazem; voltam como fantasmas no item seguinte */
  dissolver: (pecas: string[]) => void;
  /** traz de volta o que sumiu (começo de rodada) */
  mostrarTodos: () => void;
  /** troca as cores: no claro, fantasmas em cinza-azulado e a peça da vez em azul (osso) ou vermelho (músculo); no escuro, marfim e coral */
  tema: (claro: boolean) => void;
  destruir: () => void;
};

const VERT = /* glsl */ `
uniform float uSome;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() {
  vP = position;
  vec4 mv = modelViewMatrix * vec4(position + normal * uSome * uSome * 3.0, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform float uAceso; uniform float uSome; uniform float uReforco; uniform float uGrao;
uniform vec3 uCor; uniform vec3 uFantasma; uniform vec3 uBrilho; uniform vec2 uLuz;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float ruido(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float ndv = clamp(dot(n, vV), 0.0, 1.0);
  float borda = pow(1.0 - ndv, 2.2);
  // aceso: luz principal presa à câmera (de cima, à esquerda) + preenchimento frio + borda clara
  vec3 L = normalize(vec3(-0.45, 0.65, 0.62));
  float dif = dot(n, L) * 0.5 + 0.5; dif *= dif;
  float esp = pow(max(dot(n, normalize(L + vV)), 0.0), 26.0) * 0.16;
  vec3 aceso = uCor * (uLuz.x + uLuz.y * dif) + vec3(0.10, 0.13, 0.18) * (1.0 - dif) * 0.5 + uBrilho * borda * 0.30 + esp;
  // fantasma: quase nada de frente, a borda desenha o volume
  float aF = min(1.0, (0.085 + 0.66 * borda) * uReforco);
  vec3 cor = mix(uFantasma * (0.7 + 0.5 * borda), aceso, uAceso);
  float a = mix(aF, 1.0, uAceso);
  if (uSome > 0.0) {
    float r = ruido(vP * uGrao) * 0.65 + ruido(vP * uGrao * 3.1) * 0.35;
    float lim = uSome * 1.12;
    if (r < lim) discard;
    cor += uBrilho * smoothstep(lim + 0.14, lim, r) * 1.6;
  }
  gl_FragColor = vec4(cor, a);
}`;

type Parte = { id: string; tipo: "o" | "m"; mesh: THREE.Mesh; mat: THREE.ShaderMaterial; caixa: THREE.Box3; aceso: number; alvoAceso: number; some: number; sumindo: boolean; sumido: boolean };

export async function criarCena(canvas: HTMLCanvasElement, mini: HTMLElement, url: string, vistaPadrao: Vista = "a"): Promise<Cena> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("modelo " + res.status);
  const buf = await res.arrayBuffer();
  const hLen = new DataView(buf).getUint32(0, true);
  const cab = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hLen))) as Cabecalho;
  const nV = cab.pecas.reduce((a, p) => a + p.v[1], 0), nI = cab.pecas.reduce((a, p) => a + p.i[1], 0);
  const q = new Int16Array(buf, 4 + hLen, nV * 3), ind = new Uint16Array(buf, 4 + hLen + nV * 6, nI);

  const scene = new THREE.Scene();
  const reforco = { value: 1 }, luz = { value: new THREE.Vector2(0.3, 0.8) };
  let forca = 1, forcaMini = 1.9; // no claro os fantasmas precisam de mais tinta
  const partes: Parte[] = [];
  const caixaOssos = new THREE.Box3(), caixa = new THREE.Box3();
  for (const p of cab.pecas) {
    const pos = new Float32Array(p.v[1] * 3);
    for (let k = 0; k < p.v[1] * 3; k++) pos[k] = (q[p.v[0] * 3 + k] + 32500) * cab.escala + cab.origem[k % 3];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(ind.slice(p.i[0], p.i[0] + p.i[1]), 1));
    g.computeVertexNormals(); g.computeBoundingBox();
    const tam = g.boundingBox!.getSize(new THREE.Vector3());
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: p.tipo === "m" ? THREE.DoubleSide : THREE.FrontSide,
      uniforms: {
        uAceso: { value: 0 }, uSome: { value: 0 }, uReforco: reforco, uLuz: luz,
        // o grão da poeira acompanha o tamanho da peça: fino num osso do carpo, largo num fêmur
        uGrao: { value: 9 / Math.max(14, Math.cbrt(tam.x * tam.y * tam.z)) },
        uCor: { value: new THREE.Color() }, uBrilho: { value: new THREE.Color() }, uFantasma: { value: new THREE.Color() },
      },
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 1; mesh.visible = p.tipo === "o";
    scene.add(mesh);
    caixa.union(g.boundingBox!);
    if (p.tipo === "o") caixaOssos.union(g.boundingBox!);
    partes.push({ id: p.id, tipo: p.tipo, mesh, mat, caixa: g.boundingBox!, aceso: 0, alvoAceso: 0, some: 0, sumindo: false, sumido: false });
  }
  const porId = new Map(partes.map((o) => [o.id, o]));
  const meio = caixaOssos.getCenter(new THREE.Vector3()), tam = caixaOssos.getSize(new THREE.Vector3());
  const raioGeral = tam.length() / 2;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  const FOV = 30, TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const cam = new THREE.PerspectiveCamera(FOV, 1, 5, 6000);
  const camMini = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);

  // órbita simples: a câmera gira em torno do alvo; cada valor persegue a sua meta
  const [YAW0, PITCH0] = angulos(vistaPadrao);
  let W = 1, H = 1;
  /** distância para caber uma esfera de raio r na altura (ou na largura, em tela em pé) */
  const distPara = (r: number) => r / TAN / Math.min(1, (W / H) * 0.9);
  const o = { yaw: YAW0, pitch: PITCH0, dist: 1000, alvo: meio.clone() };
  const meta = { yaw: YAW0, pitch: PITCH0, dist: 1000, alvo: meio.clone() };
  let raioFoco = raioGeral * 0.62, zoom = 1;
  const calmo = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const medir = () => {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    cam.aspect = W / H; cam.updateProjectionMatrix();
    meta.dist = distPara(raioFoco) * zoom;
  };
  medir(); o.dist = meta.dist;
  const ro = new ResizeObserver(medir);
  ro.observe(canvas);

  // arrastar gira (um dedo ou o mouse); a roda do mouse e a pinça aproximam
  const dedos = new Map<number, { x: number; y: number }>();
  let pinca = 0;
  const down = (e: PointerEvent) => { dedos.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { canvas.setPointerCapture(e.pointerId); } catch { /* ponteiro sintético */ } canvas.dataset.arrastando = ""; pinca = 0; };
  const move = (e: PointerEvent) => {
    const d = dedos.get(e.pointerId);
    if (!d) return;
    if (dedos.size === 1) {
      meta.yaw -= (e.clientX - d.x) * 0.008;
      meta.pitch = THREE.MathUtils.clamp(meta.pitch + (e.clientY - d.y) * 0.006, -1.3, 1.3);
    }
    d.x = e.clientX; d.y = e.clientY;
    if (dedos.size === 2) {
      const [a, b] = [...dedos.values()], dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinca) aproximar(pinca / dist);
      pinca = dist;
    }
  };
  const up = (e: PointerEvent) => { dedos.delete(e.pointerId); pinca = 0; if (!dedos.size) delete canvas.dataset.arrastando; };
  const aproximar = (f: number) => { zoom = THREE.MathUtils.clamp(zoom * f, 0.35, 2.6); meta.dist = distPara(raioFoco) * zoom; };
  const roda = (e: WheelEvent) => { e.preventDefault(); aproximar(Math.exp(e.deltaY * 0.0015)); };
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", roda, { passive: false });

  let raf = 0, antes = performance.now(), vivo = true;
  const quadro = (agora: number) => {
    if (!vivo) return;
    raf = requestAnimationFrame(quadro);
    const dt = Math.min(0.05, (agora - antes) / 1000); antes = agora;
    const k = calmo ? 1 : 1 - Math.exp(-dt * 5.5);
    o.yaw += (meta.yaw - o.yaw) * k; o.pitch += (meta.pitch - o.pitch) * k; o.dist += (meta.dist - o.dist) * k; o.alvo.lerp(meta.alvo, k);
    const balanco = calmo || dedos.size ? 0 : Math.sin(agora / 2600) * 0.05;
    const y = o.yaw + balanco, cp = Math.cos(o.pitch);
    cam.position.set(o.alvo.x + o.dist * Math.sin(y) * cp, o.alvo.y + o.dist * Math.sin(o.pitch), o.alvo.z + o.dist * Math.cos(y) * cp);
    cam.lookAt(o.alvo);

    for (const b of partes) {
      b.aceso += (b.alvoAceso - b.aceso) * (calmo ? 1 : 1 - Math.exp(-dt * 9));
      if (b.sumindo) { b.some = Math.min(1, b.some + dt / (calmo ? 0.2 : 0.62)); if (b.some >= 1) { b.sumindo = false; if (b.tipo === "o" && b.alvoAceso === 0) b.some = 0; else b.sumido = true; } }
      // músculo só existe enquanto está aceso (ou se desfazendo); osso some depois de acertado
      b.mesh.visible = !b.sumido && (b.tipo === "o" || b.aceso > 0.02 || b.sumindo);
      b.mat.uniforms.uAceso.value = b.tipo === "m" ? Math.max(b.aceso, 0.0) : b.aceso; b.mat.uniforms.uSome.value = b.some;
      const solido = b.aceso > 0.5;
      if (b.mat.depthWrite !== solido) { b.mat.depthWrite = solido; b.mesh.renderOrder = solido ? 0 : 1; }
    }

    renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H); renderer.clear();
    reforco.value = forca;
    renderer.render(scene, cam);

    // miniatura: o modelo inteiro, na vista padrão, no retângulo do elemento `mini`
    const rc = canvas.getBoundingClientRect(), rm = mini.getBoundingClientRect();
    if (rm.width > 8 && rm.height > 8) {
      const x = rm.left - rc.left, yb = rc.bottom - rm.bottom, a = rm.width / rm.height;
      const larg = Math.hypot(tam.x, tam.z) * 0.8;
      const meiaH = Math.max(tam.y / 2, larg / 2 / a) * 1.1;
      camMini.top = meiaH; camMini.bottom = -meiaH; camMini.left = -meiaH * a; camMini.right = meiaH * a; camMini.updateProjectionMatrix();
      const ym = YAW0 * 0.8, cpm = Math.cos(PITCH0);
      camMini.position.set(meio.x + 2500 * Math.sin(ym) * cpm, meio.y + 2500 * Math.sin(PITCH0), meio.z + 2500 * Math.cos(ym) * cpm); camMini.lookAt(meio);
      renderer.setScissorTest(true); renderer.setScissor(x, yb, rm.width, rm.height); renderer.setViewport(x, yb, rm.width, rm.height);
      renderer.clearDepth();
      reforco.value = forca * forcaMini;
      renderer.render(scene, camMini);
    }
  };
  raf = requestAnimationFrame(quadro);

  const tema = (claro: boolean) => {
    forca = claro ? 2 : 1; forcaMini = claro ? 0.85 : 1.9;
    luz.value.set(claro ? 0.62 : 0.3, claro ? 0.55 : 0.8);
    const cs = getComputedStyle(canvas), v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
    for (const b of partes) {
      const u = b.mat.uniforms, musculo = b.tipo === "m";
      // o músculo usa tons mais claros que os do tema porque a cor entra na conta de luz sem correção de gama
      (u.uCor.value as THREE.Color).set(musculo ? (claro ? "#ea8664" : "#eda496") : claro ? v("--accent", "#1468d5") : "#efe6d2");
      (u.uBrilho.value as THREE.Color).set(musculo ? (claro ? "#ffe9e3" : "#ffd6cb") : claro ? "#e4f2ff" : "#fff7df");
      (u.uFantasma.value as THREE.Color).set(claro ? "#52698a" : "#b4c3d6");
    }
  };
  tema(document.documentElement.dataset.theme !== "dark");

  return {
    tema,
    focar(ids, vista) {
      const alvo = new Set(ids || []);
      // quem se desfez no item anterior volta como fantasma: a vizinhança ajuda a localizar o próximo
      for (const b of partes) { b.alvoAceso = alvo.has(b.id) ? 1 : 0; if (!b.sumindo) { b.sumido = false; b.some = 0; } }
      const [yaw, pitch] = angulos(vista ?? vistaPadrao);
      // chega pela volta mais curta
      meta.yaw = o.yaw + Math.atan2(Math.sin(yaw - o.yaw), Math.cos(yaw - o.yaw)); meta.pitch = pitch; zoom = 1;
      const cx = new THREE.Box3();
      for (const id of alvo) { const b = porId.get(id); if (b) { b.sumido = false; b.some = 0; b.sumindo = false; cx.union(b.caixa); } }
      if (!cx.isEmpty()) {
        const c = cx.getCenter(new THREE.Vector3()), r = cx.getSize(new THREE.Vector3()).length() / 2;
        // a peça com os vizinhos em volta: nunca tão perto que só ela apareça, nunca mais longe que o modelo inteiro
        raioFoco = Math.min(raioGeral * 1.05, Math.max(r * 1.75, Math.min(raioGeral * 0.5, r * 1.3 + 36)));
        meta.alvo.copy(c).lerp(meio, 0.12);
      } else { raioFoco = raioGeral * 1.02; meta.alvo.copy(meio); }
      meta.dist = distPara(raioFoco);
    },
    dissolver(ids) { for (const id of ids) { const b = porId.get(id); if (b && b.mesh.visible) b.sumindo = true; } },
    mostrarTodos() { for (const b of partes) { b.sumido = false; b.some = 0; b.sumindo = false; } },
    destruir() {
      vivo = false; cancelAnimationFrame(raf); ro.disconnect();
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", roda);
      for (const b of partes) { b.mesh.geometry.dispose(); b.mat.dispose(); }
      renderer.dispose();
    },
  };
}
