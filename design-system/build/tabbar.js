  /* ---------- Vidro líquido: mapa de refração gerado em canvas + filtro SVG (só onde o navegador aplica) ----------
     Técnica do liquid-glass-react: o fundo borrado (backdrop-filter) recebe filter: url(#mapa), que desloca os pixels
     perto da borda (refração) e separa vermelho/azul alguns pixels (aberração cromática). Safari e Firefox ficam com o
     vidro fosco e o brilho, sem a refração. */
  var GLASS_OK = (function () { try { var u = navigator.userAgent; return /Chrome|Chromium|Edg\//.test(u) && !/Firefox|FxiOS/.test(u); } catch (e) { return false; } })();
  var glassMade = {};
  function glassFilter(w, h, band, scale) {
    w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h));
    var id = "cd-glass-" + w + "x" + h + "-" + band;
    if (glassMade[id] || !GLASS_OK) return GLASS_OK ? id : null;
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    var ctx = c.getContext("2d"), img = ctx.createImageData(w, h), d = img.data, r = Math.min(w, h) / 2;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var px = x + 0.5 - w / 2, py = y + 0.5 - h / 2;
      var qx = Math.abs(px) - (w / 2 - r), qy = Math.abs(py) - (h / 2 - r), ax = Math.max(qx, 0), ay = Math.max(qy, 0);
      var sdf = Math.min(Math.max(qx, qy), 0) + Math.sqrt(ax * ax + ay * ay) - r;
      var t = Math.max(0, Math.min(1, 1 + sdf / band)), k = t * t * (3 - 2 * t);
      var nx = qx > 0 || qy > 0 ? (ax || 0) / (Math.sqrt(ax * ax + ay * ay) || 1) * Math.sign(px) : 0;
      var ny = qx > 0 || qy > 0 ? (ay || 0) / (Math.sqrt(ax * ax + ay * ay) || 1) * Math.sign(py) : 0;
      if (!(qx > 0 || qy > 0)) { if (qx > qy) nx = Math.sign(px); else ny = Math.sign(py); }
      var i = (y * w + x) * 4;
      d[i] = 128 - nx * k * 127; d[i + 1] = 128 - ny * k * 127; d[i + 2] = 128; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    var url = c.toDataURL(), NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.setAttribute("aria-hidden", "true"); svg.style.position = "absolute";
    var ch = function (sel, s) { return '<feDisplacementMap in="SourceGraphic" in2="m" scale="' + s + '" xChannelSelector="R" yChannelSelector="G" result="d' + sel + '"/>' +
      '<feColorMatrix in="d' + sel + '" type="matrix" values="' + (sel === "r" ? "1 0 0 0 0 0 0 0 0 0 0 0 0 0 0" : sel === "g" ? "0 0 0 0 0 0 1 0 0 0 0 0 0 0 0" : "0 0 0 0 0 0 0 0 0 0 0 0 1 0 0") + ' 0 0 0 1 0" result="c' + sel + '"/>'; };
    svg.innerHTML = '<filter id="' + id + '" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' +
      '<feImage href="' + url + '" x="0" y="0" width="' + w + '" height="' + h + '" preserveAspectRatio="none" result="m"/>' +
      ch("r", scale * 1.1) + ch("g", scale) + ch("b", scale * 0.88) +
      '<feBlend in="cg" in2="cb" mode="screen" result="gb"/><feBlend in="cr" in2="gb" mode="screen"/></filter>';
    document.body.appendChild(svg);
    glassMade[id] = true;
    return id;
  }

  /* ---------- TabBar: dock de vidro líquido com a lente que leva a seleção ---------- */
  var NAV = [{ id: "hoje", label: "Hoje", icon: "today" }, { id: "questoes", label: "Questões", icon: "questions" }, { id: "provas", label: "Provas", icon: "exam" }, { id: "flashcards", label: "Flashcards", icon: "cards" }, { id: "desempenho", label: "Desempenho", icon: "pulse" }];
  function DockItems(props) {
    return props.items.map(function (it, i) {
      var on = i === props.cur, b = it.badge;
      return h(props.clone ? "span" : "button", Object.assign({ key: it.id, className: "cd-dock__item" }, props.clone ? null : {
        type: "button", "aria-current": on ? "page" : undefined, "aria-label": it.label + (typeof b === "number" ? ", " + b + " novas" : b ? ", novidade" : ""), "data-i": i,
        onClick: function () { props.onPick(i); }
      }),
        h("span", { className: "cd-dock__icon" }, h(Icon, { name: it.icon, size: 24, strokeWidth: on || props.clone ? 2 : 1.75 }),
          b && !props.clone ? h("span", { className: "cd-dock__badge", "data-kind": b === "dot" ? "dot" : typeof b === "number" ? "count" : "text" }, b === "dot" ? null : typeof b === "number" && b > 99 ? "99+" : b) : null),
        h("span", { className: "cd-dock__label" }, it.label));
    });
  }
  function TabBar(props) {
    var items = props.items || NAV, n = items.length;
    var cur = Math.max(0, items.map(function (i) { return i.id; }).indexOf(props.current));
    var dock = useRef(null), pill = useRef(null), lens = useRef(null), clone = useRef(null), refr = useRef(null), glass = useRef(null);
    var S = useRef({ x: 0, v: 0, target: 0, lift: 0, liftTo: 0, raf: 0, last: 0, active: false, drag: null, tapAt: 0, shown: cur, landing: cur });
    var G = useRef({ tw: 0, pad: 5, ext: 9, w: 0, h: 0 });
    var measure = function () {
      var el = dock.current; if (!el) return;
      var w = el.clientWidth, hh = el.clientHeight, g = G.current;
      g.w = w; g.h = hh; g.tw = (w - g.pad * 2) / n;
      var L = lens.current, C = clone.current, lw = g.tw + g.ext * 2, lh = hh + 14;
      L.style.width = lw + "px"; C.style.width = w + "px"; C.style.height = hh + "px";
      var f = glassFilter(lw, lh, 14, 22); refr.current.style.filter = f ? "url(#" + f + ")" : "";
      var fd = glassFilter(w, hh, 10, 14); glass.current.style.filter = fd ? "url(#" + fd + ")" : "";
    };
    var xFor = function (i) { var g = G.current; return g.pad + i * g.tw - g.ext; };
    var idxAt = function (px) { var g = G.current; return Math.max(0, Math.min(n - 1, Math.floor((px - g.pad) / g.tw))); };
    var placePill = function (i) { var g = G.current, p = pill.current; if (!p) return; p.style.width = g.tw + "px"; p.style.transform = "translateX(" + (g.pad + i * g.tw) + "px)"; };
    var paint = function () {
      var s = S.current, L = lens.current, C = clone.current; if (!L) return;
      var st = Math.min(Math.abs(s.v) / 2400, 0.26), lf = 0.84 + 0.26 * s.lift;
      L.style.transform = "translateX(" + s.x.toFixed(2) + "px) scale(" + (lf * (1 + st)).toFixed(4) + "," + (lf * (1 - st * 0.45)).toFixed(4) + ")";
      L.style.setProperty("--fringe", (Math.min(1, Math.abs(s.v) / 1300) * 0.85 + 0.2 * s.lift).toFixed(3));
      C.style.transform = "translateX(" + (-s.x).toFixed(2) + "px)";
    };
    var land = function () { var s = S.current; s.active = false; s.shown = s.landing; placePill(s.landing); dock.current && dock.current.removeAttribute("data-moving"); };
    var tick = function (t) {
      var s = S.current, dt = s.last ? Math.min(0.034, (t - s.last) / 1000) : 0.016; s.last = t;
      var k = 540, c = 2 * Math.sqrt(k) * 0.66, a = -k * (s.x - s.target) - c * s.v;
      s.v += a * dt; s.x += s.v * dt;
      s.lift += (s.liftTo - s.lift) * Math.min(1, dt * 16);
      paint();
      if (!s.drag && Math.abs(s.x - s.target) < 0.5 && Math.abs(s.v) < 10) {
        if (s.liftTo > 0) { s.liftTo = 0; land(); }
        if (s.lift < 0.02) { s.raf = 0; s.last = 0; return; }
      }
      s.raf = requestAnimationFrame(tick);
    };
    var lift = function () {
      var s = S.current;
      if (!s.active) { s.x = xFor(s.shown); s.v = 0; s.lift = Math.max(s.lift, 0); }
      s.active = true; s.liftTo = 1; dock.current.setAttribute("data-moving", "");
      if (!s.raf) { s.last = 0; s.raf = requestAnimationFrame(tick); }
    };
    var go = function (i, notify) {
      var s = S.current; s.landing = i;
      if (reduceMotion() || !G.current.tw) { s.shown = i; placePill(i); }
      else { lift(); s.target = xFor(i); }
      if (notify && props.onChange && items[i].id !== props.current) props.onChange(items[i].id);
    };
    useLayoutEffect(function () { measure(); placePill(cur); S.current.shown = cur; S.current.landing = cur; paint(); }, []);
    useEffect(function () {
      var ro = window.ResizeObserver ? new ResizeObserver(function () { measure(); if (!S.current.active) placePill(S.current.shown); }) : null;
      ro && ro.observe(dock.current);
      return function () { ro && ro.disconnect(); cancelAnimationFrame(S.current.raf); };
    }, []);
    useEffect(function () { if (S.current.landing !== cur && !S.current.drag) go(cur, false); }, [cur]);
    var down = function (e) {
      if (e.button > 0) return;
      measure();
      var s = S.current, r = dock.current.getBoundingClientRect(), px = e.clientX - r.left, g = G.current;
      s.drag = { x0: e.clientX, moved: false };
      if (reduceMotion()) return;
      lift(); s.target = Math.max(-g.ext, Math.min(g.w - g.tw - g.pad - g.ext, px - g.tw / 2 - g.ext)); s.landing = idxAt(px);
      try { dock.current.setPointerCapture(e.pointerId); } catch (err) {}
    };
    var move = function (e) {
      var s = S.current; if (!s.drag || reduceMotion()) return;
      var r = dock.current.getBoundingClientRect(), px = e.clientX - r.left, g = G.current;
      if (Math.abs(e.clientX - s.drag.x0) > 6) s.drag.moved = true;
      s.target = Math.max(-g.ext, Math.min(g.w - g.tw - g.pad - g.ext, px - g.tw / 2 - g.ext)); s.landing = idxAt(px);
    };
    var up = function (e) {
      var s = S.current; if (!s.drag) return;
      var r = dock.current.getBoundingClientRect(), i = idxAt(e.clientX - r.left);
      s.drag = null; s.tapAt = performance.now(); go(i, true);
      var b = dock.current.querySelector('.cd-dock__row:not(.cd-dock__row--clone) [data-i="' + i + '"]'); b && b.focus({ preventScroll: true });
    };
    var pick = function (i) { if (performance.now() - S.current.tapAt < 450) return; go(i, true); };
    var keys = function (e) {
      var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!d) return;
      e.preventDefault(); var i = (S.current.landing + d + n) % n; go(i, true);
      var b = dock.current.querySelector('.cd-dock__row:not(.cd-dock__row--clone) [data-i="' + i + '"]'); b && b.focus();
    };
    return h("nav", { className: "cd-tabbar cd-root", "aria-label": "Principal", "data-static": props.static ? "" : undefined },
      h("div", { ref: dock, className: "cd-dock", "data-min": props.minimized ? "" : undefined, style: { "--n": n }, onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up, onKeyDown: keys },
        h("span", { ref: glass, className: "cd-dock__glass", "aria-hidden": true }),
        h("span", { ref: pill, className: "cd-dock__pill", "aria-hidden": true }),
        h("div", { className: "cd-dock__row" }, h(DockItems, { items: items, cur: cur, onPick: pick })),
        h("span", { ref: lens, className: "cd-dock__lens", "aria-hidden": true },
          h("span", { ref: refr, className: "cd-lens__refract" }),
          h("span", { className: "cd-lens__tint" }),
          h("span", { ref: clone, className: "cd-dock__row cd-dock__row--clone" }, h(DockItems, { items: items, cur: cur, clone: true })),
          h("span", { className: "cd-lens__rim" }))));
  }
