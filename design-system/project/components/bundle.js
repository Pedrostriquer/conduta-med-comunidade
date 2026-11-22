/* @ds-bundle: {"format":4,"namespace":"Conduta","components":[{"name":"Logo"},{"name":"Icon"},{"name":"Button"},{"name":"SegmentedControl"},{"name":"Chip"},{"name":"Badge"},{"name":"Alternative"},{"name":"QuestionCard"},{"name":"VideoCorrection"},{"name":"Flashcard"},{"name":"AnkiImport"},{"name":"ExamNavigator"},{"name":"Dialog"},{"name":"StudyPlan"},{"name":"ProgressRing"},{"name":"Meter"},{"name":"BarList"},{"name":"TabBar"},{"name":"Sidebar"},{"name":"Pulse"},{"name":"Vitals"},{"name":"Toast"}]} */
(function () {
  "use strict";
  var React = window.React;
  var h = React.createElement, F = React.Fragment;
  var useState = React.useState, useEffect = React.useEffect, useRef = React.useRef, useLayoutEffect = React.useLayoutEffect, useCallback = React.useCallback, useMemo = React.useMemo;
  var cx = function () { return Array.prototype.filter.call(arguments, Boolean).join(" "); };
  var reduceMotion = function () { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  var typing = function (e) { var t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };
  var fmt = function (n) { return Number(n).toLocaleString("pt-BR"); };
  var hms = function (s) { s = Math.max(0, Math.round(s)); var H = Math.floor(s / 3600), M = Math.floor(s % 3600 / 60), S = s % 60; return (H ? H + ":" + String(M).padStart(2, "0") : M) + ":" + String(S).padStart(2, "0"); };

  /* ---------- Icon: 24px, traço 1,75, pontas arredondadas ---------- */
  var P = {
    check: ["M5 12.5l4.5 4.5L19 7.5"],
    x: ["M6.5 6.5l11 11M17.5 6.5l-11 11"],
    "chevron-right": ["M9.5 6l6 6-6 6"],
    "chevron-left": ["M14.5 6l-6 6 6 6"],
    "chevron-down": ["M6 9.5l6 6 6-6"],
    external: ["M8.5 15.5L17 7", "M10 7h7v7"],
    clock: ["M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z", "M12 7.5V12l3 2"],
    calendar: ["M6.5 5h11a3 3 0 0 1 3 3v9.5a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z", "M3.5 10h17", "M8 3v4", "M16 3v4"],
    flag: ["M5.5 21V4.5", "M5.5 5h11.5l-2.5 4 2.5 4H5.5"],
    today: ["M12 8.25a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5z", "M12 3v1.5", "M12 19.5V21", "M3 12h1.5", "M19.5 12H21", "M5.64 5.64l1.06 1.06", "M17.3 17.3l1.06 1.06", "M5.64 18.36l1.06-1.06", "M17.3 6.7l1.06-1.06"],
    questions: ["M7.5 3.5h9a2.5 2.5 0 0 1 2.5 2.5v12a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18V6a2.5 2.5 0 0 1 2.5-2.5z", "M8.5 9h7", "M8.5 12.5h7", "M8.5 16h4"],
    exam: ["M7.5 4.5h9a2.5 2.5 0 0 1 2.5 2.5v11a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18V7a2.5 2.5 0 0 1 2.5-2.5z", "M9.5 3h5v3h-5z", "M9 13l2 2 4-4"],
    cards: ["M8.5 3.5h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z", "M3.5 8v9.5a3 3 0 0 0 3 3h9"],
    chart: ["M4 20h16", "M7 16.5v-5", "M12 16.5V7", "M17 16.5V9.5"],
    search: ["M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z", "M16 16l4.5 4.5"],
    filter: ["M4 7h16", "M7 12h10", "M10 17h4"],
    upload: ["M12 15V4.5", "M7.5 9L12 4.5 16.5 9", "M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"],
    undo: ["M9 14L4.5 9.5 9 5", "M4.5 9.5H15a5 5 0 0 1 0 10h-3"],
    strike: ["M5 12h14", "M16 7.5C15.4 5.9 13.8 5 11.8 5 9.5 5 8 6.2 8 8c0 1.2.7 2.1 2 2.6", "M8 16.5c.6 1.6 2.2 2.5 4.2 2.5 2.3 0 3.8-1.2 3.8-3 0-.6-.2-1.2-.6-1.6"],
    "text-size": ["M3 18l4.5-11L12 18", "M4.6 14h5.8", "M13.5 18l3-7 3 7", "M14.6 15.5h3.8"],
    video: ["M5.5 6h8a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 3 15.5v-7A2.5 2.5 0 0 1 5.5 6z", "M16 10.5l5-3v9l-5-3"],
    info: ["M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z", "M12 11v5", "M12 8h.01"],
    alert: ["M10.3 4.9a2 2 0 0 1 3.4 0l7.1 12.3a2 2 0 0 1-1.7 3H4.9a2 2 0 0 1-1.7-3z", "M12 10v4", "M12 17h.01"],
    void: ["M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z", "M6 6l12 12"],
    swap: ["M7 7.5h11.5", "M15 4l3.5 3.5L15 11", "M17 16.5H5.5", "M9 13l-3.5 3.5L9 20"],
    message: ["M6 5h12a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 17h-7.5L6 20.5V17a2.5 2.5 0 0 1-2.5-2.5v-7A2.5 2.5 0 0 1 6 5z"],
    tip: ["M9.5 18h5", "M10.5 21h3", "M12 3.5a5.5 5.5 0 0 0-3.3 9.9c.5.4.8 1 .8 1.6v.5h5V15c0-.6.3-1.2.8-1.6A5.5 5.5 0 0 0 12 3.5z"],
    plus: ["M12 5v14", "M5 12h14"],
    file: ["M7 3.5h6.5L18 8v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z", "M13.5 3.5V8H18"],
    image: ["M6 4.5h12A1.5 1.5 0 0 1 19.5 6v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V6A1.5 1.5 0 0 1 6 4.5z", "M4.5 16l4-4 3 3 2-2 6 6", "M15 8.5h.01"],
    hourglass: ["M7 3.5h10", "M7 20.5h10", "M8 3.5c0 4 8 5 8 8.5s-8 4.5-8 8.5", "M16 3.5c0 4-8 5-8 8.5s8 4.5 8 8.5"],
    pulse: ["M3 12.5h3.5l2-4.5 3.5 10 3-8 1.5 2.5H21"],
    stethoscope: ["M5 3.5V8a4 4 0 0 0 8 0V3.5", "M4 3.5h2", "M12 3.5h2", "M9 12v2.5a4.5 4.5 0 0 0 9 0v-1.75", "M18 8.5a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5z"],
    scalpel: ["M3.5 20.5l6.8-6.8", "M10.3 13.7L18.6 5.4c.9-.9 2.4 0 2 1.2-1.3 3.7-4.8 7-8.7 8.3z"],
    pacifier: ["M12 3.5a2.75 2.75 0 0 0-2.75 2.75V8h5.5V6.25A2.75 2.75 0 0 0 12 3.5z", "M5.5 9.5A1.5 1.5 0 0 1 7 8h10a1.5 1.5 0 0 1 1.5 1.5c0 2.5-2.9 4.5-6.5 4.5S5.5 12 5.5 9.5z", "M12 14.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"],
    uterus: ["M12 6.5c2.3 0 3.6 1.1 3.6 2.8 0 2.3-1.3 4-2.6 4.9v3.3h-2v-3.3c-1.3-.9-2.6-2.6-2.6-4.9 0-1.7 1.3-2.8 3.6-2.8z", "M11 20.5h2", "M12 17.5v3", "M8.6 8.6C7.3 7 5.4 6.8 4.2 8", "M15.4 8.6c1.3-1.6 3.2-1.8 4.4-.6", "M4.4 10.2a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z", "M19.6 10.2a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z"],
    shield: ["M12 3.5l7 2.8v5.2c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6.3z", "M9 12l2 2 4-4"]
  };
  var FILLED = {
    play: "M8.5 5.6v12.8a1 1 0 0 0 1.53.85l10.2-6.4a1 1 0 0 0 0-1.7L10.03 4.75A1 1 0 0 0 8.5 5.6z",
    more: "M6 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"
  };
  function Icon(props) {
    var name = props.name, size = props.size || 20, sw = props.strokeWidth || 1.75;
    var a = { className: cx("cd-icon", props.className), width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": props.label ? undefined : true, role: props.label ? "img" : undefined, "aria-label": props.label, focusable: "false" };
    if (FILLED[name]) return h("svg", a, h("path", { d: FILLED[name], fill: "currentColor" }));
    var d = P[name] || P.info;
    return h("svg", Object.assign(a, { fill: "none", stroke: "currentColor", strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" }),
      props.filled && name === "flag" ? h("path", { d: "M5.5 5h11.5l-2.5 4 2.5 4H5.5z", fill: "currentColor", stroke: "none" }) : null,
      d.map(function (p, i) { return h("path", { key: i, d: p }); }));
  }
  /* ícone de cada grande área: estetoscópio, bisturi, chupeta, útero, escudo */
  var AREA = { "Clínica Médica": "stethoscope", "Cirurgia": "scalpel", "Clínica Cirúrgica": "scalpel", "Pediatria": "pacifier", "Ginecologia e Obstetrícia": "uterus", "Preventiva": "shield", "Medicina Preventiva": "shield", "Preventiva & Social": "shield" };
  Icon.names = Object.keys(P).concat(Object.keys(FILLED));
  Icon.paths = P; Icon.filledPaths = FILLED;

  /* ---------- Logo: a bifurcação de uma conduta, com o caminho escolhido em destaque ---------- */
  function Mark(props) {
    var size = props.size || 32, mono = props.mono;
    return h("svg", { width: size, height: size, viewBox: "0 0 64 64", role: "img", "aria-label": props.label || "Conduta", className: "cd-mark" },
      h("rect", { width: 64, height: 64, rx: 16, fill: mono ? "currentColor" : "var(--accent)" }),
      h("g", { fill: "none", stroke: mono ? "var(--surface)" : "var(--on-accent)", strokeWidth: 5.5, strokeLinecap: "round", strokeLinejoin: "round" },
        h("path", { d: "M32 25c0 6.5-11 7.5-11 13.5", opacity: 0.4 }),
        h("path", { d: "M32 12.5V25c0 6.5 11 7.5 11 13.5" })),
      h("circle", { cx: 43, cy: 49.5, r: 5.5, fill: mono ? "var(--surface)" : "var(--on-accent)" }));
  }
  function Logo(props) {
    var size = props.size || 32;
    if (props.wordmark === false) return h(Mark, props);
    return h("span", { className: "cd-logo", style: { "--s": size + "px" } }, h(Mark, { size: size, mono: props.mono, label: "" }), h("span", { className: "cd-logo__word" }, "conduta"));
  }

  function Kbd(props) { return h("kbd", { className: "cd-kbd", "aria-hidden": true }, props.children); }

  /* ---------- Button ---------- */
  var Button = React.forwardRef(function Button(props, ref) {
    var variant = props.variant || "gray", size = props.size || "md";
    var rest = Object.assign({}, props);
    ["variant", "size", "icon", "iconEnd", "loading", "block", "kbd", "label", "href", "className", "children"].forEach(function (k) { delete rest[k]; });
    var iconOnly = props.icon && !props.children;
    var cls = cx("cd-btn", "cd-hoverable", "cd-btn--" + variant, size !== "md" && "cd-btn--" + size, iconOnly && "cd-btn--icon", props.block && "cd-btn--block", props.className);
    var inner = [
      props.loading ? h("span", { key: "s", className: "cd-spinner", "aria-hidden": true }) : props.icon ? h(Icon, { key: "i", name: props.icon, size: size === "sm" ? 18 : 20 }) : null,
      props.children ? h("span", { key: "c" }, props.children) : null,
      props.iconEnd ? h(Icon, { key: "e", name: props.iconEnd, size: 18 }) : null,
      props.kbd ? h(Kbd, { key: "k" }, props.kbd) : null
    ];
    if (props.href) return h("a", Object.assign({ ref: ref, className: cls, href: props.href, target: "_blank", rel: "noopener noreferrer", "aria-label": props.label }, rest), inner);
    return h("button", Object.assign({ ref: ref, type: "button", className: cls, "aria-label": iconOnly ? props.label : undefined, "aria-busy": props.loading || undefined, disabled: props.disabled }, rest), inner);
  });

  /* ---------- SegmentedControl ---------- */
  function SegmentedControl(props) {
    var opts = props.options, val = props.value, wrap = useRef(null), thumb = useRef(null), first = useRef(true);
    var place = useCallback(function () {
      var el = wrap.current && wrap.current.querySelector('[aria-checked="true"]'), t = thumb.current;
      if (!el || !t) return;
      t.style.setProperty("--x", el.offsetLeft + "px");
      t.style.setProperty("--w", el.offsetWidth + "px");
    }, []);
    useLayoutEffect(function () {
      if (first.current) { thumb.current.setAttribute("data-instant", ""); place(); thumb.current.getBoundingClientRect(); thumb.current.removeAttribute("data-instant"); first.current = false; }
      else place();
    }, [val, place]);
    useEffect(function () {
      if (!window.ResizeObserver) return;
      var ro = new ResizeObserver(function () { thumb.current && thumb.current.setAttribute("data-instant", ""); place(); requestAnimationFrame(function () { thumb.current && thumb.current.removeAttribute("data-instant"); }); });
      ro.observe(wrap.current); return function () { ro.disconnect(); };
    }, [place]);
    var key = function (e) {
      var i = opts.findIndex(function (o) { return o.value === val; }), n = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % opts.length;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + opts.length) % opts.length;
      if (n === null) return;
      e.preventDefault(); props.onChange(opts[n].value);
      var btns = wrap.current.querySelectorAll(".cd-seg__item"); btns[n] && btns[n].focus();
    };
    return h("div", { ref: wrap, role: "radiogroup", "aria-label": props["aria-label"], className: cx("cd-seg", props.size === "sm" && "cd-seg--sm", props.block && "cd-seg--block"), onKeyDown: key },
      h("span", { ref: thumb, className: "cd-seg__thumb", "aria-hidden": true }),
      opts.map(function (o) {
        var on = o.value === val;
        return h("button", { key: o.value, type: "button", role: "radio", "aria-checked": on, tabIndex: on ? 0 : -1, className: "cd-seg__item", onClick: function () { props.onChange(o.value); }, "aria-label": o.ariaLabel },
          o.icon ? h(Icon, { name: o.icon, size: 18 }) : null, o.label);
      }));
  }

  /* ---------- Chip e Badge ---------- */
  function Chip(props) {
    return h("button", { type: "button", className: "cd-chip cd-hoverable", "aria-pressed": !!props.pressed, onClick: function () { props.onChange && props.onChange(!props.pressed); } },
      h("span", { className: "cd-chip__check", "aria-hidden": true }, h(Icon, { name: "check", size: 16, strokeWidth: 2.25 })),
      props.icon ? h(Icon, { name: props.icon, size: 18 }) : null,
      props.children,
      props.count != null ? h("span", { className: "cd-chip__count" }, fmt(props.count)) : null);
  }
  var BADGE = {
    anulada: ["warning", "void", "Anulada"], alterada: ["warning", "swap", "Gabarito alterado"], diverge: ["warning", "video", "Vídeo diverge do gabarito"],
    polemica: ["neutral", "message", "Polêmica"], preliminar: ["neutral", "hourglass", "Gabarito preliminar"], desatualizada: ["neutral", "clock", "Desatualizada"],
    recurso: ["neutral", "alert", "Cabe recurso"], revisao: ["neutral", "info", "Revisão médica pendente"]
  };
  function Badge(props) {
    var p = props.kind ? BADGE[props.kind] : null, tone = props.tone || (p ? p[0] : "neutral"), icon = props.icon || (p ? p[1] : null);
    return h("span", { className: cx("cd-badge", tone !== "neutral" && "cd-badge--" + tone), title: props.title }, icon ? h(Icon, { name: icon, size: 14, strokeWidth: 2 }) : null, props.children || (p ? p[2] : null));
  }
  Badge.kinds = Object.keys(BADGE);

  /* ---------- Alternative ---------- */
  function Alternative(props) {
    var res = props.result, done = !!res, sym = res === "correct" ? "check" : res === "wrong" ? "x" : null;
    return h("div", {
      role: "radio", "aria-checked": !!props.checked && !done, "aria-disabled": done || props.disabled || undefined, tabIndex: props.tabIndex != null ? props.tabIndex : 0,
      className: "cd-alt", "data-struck": props.struck && !done ? "" : undefined, "data-result": res || undefined,
      onClick: function () { if (!done && !props.disabled && props.onSelect) props.onSelect(props.letter); },
      onKeyDown: function (e) { if ((e.key === " " || e.key === "Enter") && !done && props.onSelect) { e.preventDefault(); props.onSelect(props.letter); } },
      onContextMenu: function (e) { if (!done && props.onStrike) { e.preventDefault(); props.onStrike(props.letter); } }
    },
      h("span", { className: "cd-alt__letter" }, sym ? h(Icon, { name: sym, size: 16, strokeWidth: 2.5 }) : h("span", null, props.letter)),
      h("span", { className: "cd-alt__text" }, props.children),
      h("span", { className: "cd-alt__side" },
        props.tag ? h("span", { className: "cd-alt__tag" }, props.tag) : null,
        !done && props.onStrike ? h("button", {
          type: "button", className: "cd-alt__strike", tabIndex: -1, "aria-label": (props.struck ? "Desfazer risco da alternativa " : "Riscar alternativa ") + props.letter, title: props.struck ? "Desfazer risco" : "Riscar alternativa",
          onClick: function (e) { e.stopPropagation(); props.onStrike(props.letter); }
        }, h(Icon, { name: props.struck ? "undo" : "strike", size: 18 })) : null));
  }

  /* ---------- VideoCorrection ---------- */
  function VideoCorrection(props) {
    var _a = useState(null), on = _a[0], setOn = _a[1];
    var at = function (s) { return props.url + (props.url.indexOf("?") < 0 ? "?" : "&") + "t=" + Math.round(s) + "s"; };
    var moments = (props.moments || []).slice().sort(function (a, b) { return a.t - b.t; });
    var span = Math.max(1, props.end - props.start);
    return h("section", { className: "cd-video", "aria-label": "Correção em vídeo" },
      h("a", { className: "cd-video__main cd-hoverable", href: at(props.start), target: "_blank", rel: "noopener noreferrer" },
        h("span", { className: "cd-video__play", "aria-hidden": true }, h(Icon, { name: "play", size: 20 })),
        h("span", null,
          h("span", { className: "cd-video__title", style: { display: "block" } }, props.title || "Correção em vídeo"),
          h("span", { className: "cd-video__sub" }, props.channel, " · começa em ", h("span", { className: "cd-num" }, hms(props.start)))),
        h("span", { className: "cd-video__go" }, "YouTube", h(Icon, { name: "external", size: 16 }))),
      props.warning ? h("div", { className: "cd-video__warn" }, h(Icon, { name: "video", size: 18 }), props.warning) : null,
      moments.length ? h(F, null,
        h("div", { "aria-hidden": true },
          h("div", { className: "cd-video__bar" }, moments.map(function (m, i) {
            return h("span", { key: i, className: "cd-video__tick", "data-on": on === i ? "" : undefined, style: { left: ((m.t - props.start) / span * 100) + "%" } });
          })),
          h("div", { className: "cd-video__ends" }, h("span", null, hms(props.start)), h("span", null, hms(props.end)))),
        h("ol", { className: "cd-video__list", "aria-label": "Momentos da correção" }, moments.map(function (m, i) {
          return h("li", { key: i }, h("a", {
            className: "cd-video__moment cd-hoverable", href: at(m.t), target: "_blank", rel: "noopener noreferrer",
            onMouseEnter: function () { setOn(i); }, onMouseLeave: function () { setOn(null); }, onFocus: function () { setOn(i); }, onBlur: function () { setOn(null); }
          }, h("span", { className: "cd-video__time" }, hms(m.t)), h("span", { className: "cd-video__text" }, m.text)));
        }))) : null);
  }

  /* ---------- QuestionCard ---------- */
  function QuestionCard(props) {
    var q = props.question, letters = Object.keys(q.alternatives);
    var _s = useState(props.initialChoice || null), choice = _s[0], setChoice = _s[1];
    var _d = useState(!!props.initialAnswered), answered = _d[0], setAnswered = _d[1];
    var _k = useState({}), struck = _k[0], setStruck = _k[1];
    var _f = useState(false), flagged = _f[0], setFlagged = _f[1];
    var _z = useState(1), scale = _z[0], setScale = _z[1];
    var _t = useState("serif"), face = _t[0], setFace = _t[1];
    var _p = useState(false), aa = _p[0], setAa = _p[1];
    var root = useRef(null), result = useRef(null);
    var voided = q.status === "anulada";
    var strike = function (L) { setStruck(function (s) { var n = Object.assign({}, s); n[L] = !n[L]; return n; }); if (choice === L) setChoice(null); };
    var answer = function () {
      if (!choice && !voided) return;
      setAnswered(true); props.onAnswer && props.onAnswer(choice, choice === q.answer);
      setTimeout(function () { result.current && result.current.focus({ preventScroll: true }); var r = result.current && result.current.getBoundingClientRect(); if (r && r.bottom > innerHeight) result.current.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "nearest" }); }, 80);
    };
    var reset = function () { setAnswered(false); setChoice(null); setStruck({}); root.current && root.current.focus(); };
    useEffect(function () {
      var onKey = function (e) {
        if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
        if (!root.current || !root.current.contains(document.activeElement) && document.activeElement !== document.body) return;
        var k = e.key.toUpperCase();
        if (!answered && letters.indexOf(k) >= 0) { e.preventDefault(); if (!struck[k]) setChoice(k); }
        else if (!answered && /^[1-5]$/.test(k) && letters[+k - 1]) { e.preventDefault(); setChoice(letters[+k - 1]); }
        else if (e.key === "Enter" && !answered && choice && !(document.activeElement && document.activeElement.tagName === "BUTTON")) { e.preventDefault(); answer(); }
      };
      window.addEventListener("keydown", onKey); return function () { window.removeEventListener("keydown", onKey); };
    });
    useEffect(function () {
      if (!aa) return;
      var close = function (e) { if (e.type === "keydown" ? e.key === "Escape" : !e.target.closest(".cd-popover, [aria-label='Tamanho e fonte do texto']")) setAa(false); };
      window.addEventListener("keydown", close); window.addEventListener("mousedown", close);
      return function () { window.removeEventListener("keydown", close); window.removeEventListener("mousedown", close); };
    }, [aa]);
    var arrows = function (e) {
      var d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
      if (!d || answered) return;
      e.preventDefault();
      var i = letters.indexOf(choice || letters[0]), n = (i + d + letters.length) % letters.length;
      setChoice(letters[n]);
      var els = e.currentTarget.querySelectorAll(".cd-alt"); els[n] && els[n].focus();
    };
    var right = choice === q.answer;
    var tone = voided ? "warning" : right ? "success" : "danger";
    var resTitle = voided ? "Questão anulada" : right ? "Você acertou." : choice ? "Você errou. Gabarito: " + q.answer + "." : "Gabarito: " + q.answer + ".";
    var resSub = q.answerNote || (voided ? "Ela não conta para a sua nota." : null);
    return h("article", { ref: root, className: "cd-q cd-root", tabIndex: -1, "aria-label": q.exam + ", questão " + q.number, "data-face": face, style: { "--reading-scale": scale } },
      h("header", { className: "cd-q__top" },
        h("div", { className: "cd-q__meta" },
          h("div", { className: "cd-q__exam" }, h("span", null, q.exam), h("span", { "aria-hidden": true, style: { color: "var(--ink-3)" } }, "·"), h("span", { className: "cd-q__no cd-num" }, "Questão " + q.number)),
          h("div", { className: "cd-q__path" }, q.path.join(" › "))),
        h("div", { className: "cd-q__tools" },
          h(Button, { variant: "plain", icon: "text-size", label: "Tamanho e fonte do texto", "aria-expanded": aa, onClick: function () { setAa(!aa); } }),
          h(Button, { variant: "plain", icon: "flag", label: flagged ? "Desmarcar revisão" : "Marcar para revisar", "aria-pressed": flagged, onClick: function () { setFlagged(!flagged); } }))),
      aa ? h("div", { className: "cd-popover", role: "dialog", "aria-label": "Texto da questão" },
        h("div", { className: "cd-popover__label" }, "Tamanho do texto"),
        h(SegmentedControl, { block: true, "aria-label": "Tamanho do texto", value: scale, onChange: setScale, options: [{ value: 0.9, label: h("span", { style: { fontSize: 13 } }, "A"), ariaLabel: "Menor" }, { value: 1, label: h("span", { style: { fontSize: 16 } }, "A"), ariaLabel: "Padrão" }, { value: 1.15, label: h("span", { style: { fontSize: 19 } }, "A"), ariaLabel: "Maior" }] }),
        h("div", { className: "cd-popover__label" }, "Fonte do enunciado"),
        h(SegmentedControl, { block: true, "aria-label": "Fonte do enunciado", value: face, onChange: setFace, options: [{ value: "serif", label: h("span", { style: { fontFamily: "var(--font-reading)" } }, "Literata") }, { value: "sans", label: "Hanken" }] })) : null,
      q.badges && q.badges.length ? h("div", { className: "cd-q__badges" }, q.badges.map(function (b) { return h(Badge, { key: b, kind: b }); })) : null,
      h("p", { className: "cd-q__stem" }, q.stem),
      q.image ? h("figure", { className: "cd-q__figure" }, h("img", { src: q.image, alt: q.imageAlt || "" })) : null,
      h("div", { className: "cd-alts", role: "radiogroup", "aria-label": "Alternativas", onKeyDown: arrows }, letters.map(function (L) {
        var res = !answered ? null : voided ? "void" : L === q.answer ? "correct" : L === choice ? "wrong" : "other";
        var tag = !answered || voided ? null : L === q.answer ? (L === choice ? "Sua resposta" : "Gabarito") : L === choice ? "Sua resposta" : null;
        return h(Alternative, { key: L, letter: L, checked: choice === L, struck: !!struck[L], result: res, tag: tag, tabIndex: answered ? -1 : (choice ? (choice === L ? 0 : -1) : (L === letters[0] ? 0 : -1)), onSelect: function (x) { if (struck[x]) strike(x); setChoice(x); }, onStrike: strike }, q.alternatives[L]);
      })),
      h("div", { className: "cd-reveal", "data-open": answered ? "" : undefined, "aria-hidden": !answered },
        h("div", null,
          h("div", { ref: result, tabIndex: -1, className: "cd-q__result", "data-tone": tone, role: "status" },
            answered ? h("span", { className: "cd-q__result-icon" }, h(Icon, { name: voided ? "void" : right ? "check" : "x", size: 16, strokeWidth: 2.5 })) : null,
            h("div", null, h("div", { className: "cd-q__result-title" }, resTitle), resSub ? h("div", { className: "cd-q__result-sub" }, resSub) : null)),
          q.explanation ? h("div", { className: "cd-q__why" }, h("h3", null, "Por que " + (voided ? "foi anulada" : q.answer)), h("p", null, q.explanation), q.explanationNote ? h("div", { className: "cd-q__note" }, q.explanationNote) : null) : null,
          q.video ? h(VideoCorrection, q.video) : null)),
      h("footer", { className: "cd-q__foot" },
        h("span", { className: "cd-q__hint" }, answered ? null : h(F, null, h(Kbd, null, letters[0]), "–", h(Kbd, null, letters[letters.length - 1]), " marcar · clique direito risca · ", h(Kbd, null, "↵"), " responder")),
        h("div", { className: "cd-q__swap" },
          h(Button, { variant: "filled", size: "lg", onClick: answer, disabled: !choice && !voided, style: answered ? { visibility: "hidden" } : null, "aria-hidden": answered || undefined }, "Responder"),
          answered ? h(Button, { variant: "filled", size: "lg", iconEnd: "chevron-right", onClick: props.onNext || reset }, props.nextLabel || "Próxima questão") : null)));
  }

  /* ---------- Flashcard ---------- */
  function Cloze(props) {
    var ref = useRef(null), q = useRef(null), a = useRef(null);
    useLayoutEffect(function () {
      var el = ref.current; if (!el) return;
      var w = (props.open ? a.current : q.current).offsetWidth + 16;
      el.style.width = w + "px";
    }, [props.open]);
    var hint = props.choices ? h(F, null, props.choices.map(function (c, i) { return h(F, { key: i }, i ? h("span", { className: "cd-cloze__or" }, "ou") : null, c); })) : "[…]";
    return h("span", { ref: ref, className: "cd-cloze", "data-open": props.open ? "" : undefined },
      h("span", { ref: q, className: "cd-cloze__q", "aria-hidden": props.open }, hint),
      h("span", { ref: a, className: "cd-cloze__a", "aria-hidden": !props.open }, props.answer),
      h("span", { className: "cd-sr" }, props.open ? "" : "lacuna"));
  }
  function CardFace(props) {
    var c = props.card, open = props.open;
    return h(F, null,
      h("div", { className: "cd-fc__crumb" }, c.deck),
      c.type === "qa"
        ? h("div", { className: "cd-fc__front" }, c.front)
        : h("div", { className: "cd-fc__front" }, c.before, h(Cloze, { open: open, answer: c.answer, choices: c.choices }), c.after),
      open ? h("div", { className: "cd-fc__back" },
        c.type === "qa" ? h(F, null, h("hr", { className: "cd-fc__hr" }), h("div", { className: "cd-fc__answer" }, c.answer)) : null,
        c.extra ? h("div", { className: "cd-fc__extra" }, c.extra) : null,
        c.ref ? h("div", { className: "cd-fc__ref" }, c.ref) : null) : null);
  }
  function Leaving(props) {
    var ref = useRef(null);
    useLayoutEffect(function () {
      var el = ref.current; el.getBoundingClientRect();
      var id = requestAnimationFrame(function () { el.style.transform = ""; el.setAttribute("data-leaving", props.dir === "up" ? "" : props.dir); });
      return function () { cancelAnimationFrame(id); };
    }, []);
    return h("div", { ref: ref, className: "cd-fc__card", "data-depth": "0", "aria-hidden": true, style: props.from ? { transform: props.from, transition: "none" } : null }, h(CardFace, { card: props.card, open: true }));
  }
  var RATES = [["again", "De novo", "1"], ["hard", "Difícil", "2"], ["good", "Bom", "3"], ["easy", "Fácil", "4"]];
  function Flashcard(props) {
    var cards = props.cards, iv = props.intervals || { again: "1 min", hard: "6 min", good: "10 min", easy: "4 dias" };
    var _i = useState(0), idx = _i[0], setIdx = _i[1];
    var _o = useState(false), open = _o[0], setOpen = _o[1];
    var _l = useState(null), leaving = _l[0], setLeaving = _l[1];
    var _h = useState([]), hist = _h[0], setHist = _h[1];
    var _t = useState(Date.now()), t0 = _t[0];
    var stack = useRef(null), front = useRef(null), drag = useRef(null), revealBtn = useRef(null), goodBtn = useRef(null), swiped = useRef(false);
    var done = idx >= cards.length;
    var reveal = function () { if (!open && !done) { setOpen(true); setTimeout(function () { goodBtn.current && document.activeElement === revealBtn.current && goodBtn.current.focus(); }, 0); } };
    var rate = function (r, dir, from) {
      if (!open || done) return;
      var card = idx, refocus = document.activeElement && document.activeElement.closest && document.activeElement.closest(".cd-fc__rates");
      setHist(function (x) { return x.concat([{ i: card, r: r }]); });
      setLeaving({ i: card, dir: dir || "up", from: from });
      if (refocus) setTimeout(function () { revealBtn.current && revealBtn.current.focus(); }, 0);
      setOpen(false); setIdx(card + 1);
      setTimeout(function () { setLeaving(function (l) { return l && l.i === card ? null : l; }); }, reduceMotion() ? 0 : 260);
    };
    var undo = function () {
      if (!hist.length) return;
      var last = hist[hist.length - 1];
      setHist(hist.slice(0, -1)); setLeaving(null); setIdx(last.i); setOpen(true);
    };
    useEffect(function () {
      var onKey = function (e) {
        if (typing(e)) return;
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        var focusedBtn = document.activeElement && document.activeElement.tagName === "BUTTON" && document.activeElement !== revealBtn.current;
        if ((e.key === " " || e.key === "Enter") && !open && !focusedBtn) { e.preventDefault(); reveal(); }
        else if (open && /^[1-4]$/.test(e.key)) { e.preventDefault(); rate(RATES[+e.key - 1][0]); }
        else if (e.key.toLowerCase() === "z" && !open && hist.length) undo();
      };
      window.addEventListener("keydown", onKey); return function () { window.removeEventListener("keydown", onKey); };
    });
    /* arrastar no toque: esquerda = De novo, direita = Bom (só com a resposta à mostra) */
    var down = function (e) {
      if (e.pointerType !== "touch" || !open) return;
      drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, lock: null };
    };
    var move = function (e) {
      var d = drag.current, el = front.current; if (!d || !el) return;
      var dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.lock) { if (Math.abs(dx) > 8 || Math.abs(dy) > 8) d.lock = Math.abs(dx) > Math.abs(dy) ? "x" : "y"; else return; }
      if (d.lock !== "x") return;
      d.dx = dx; el.setAttribute("data-dragging", "");
      el.style.transform = "translateX(" + dx + "px) rotate(" + (dx / 26) + "deg)";
      var L = el.querySelector(".cd-fc__swipe--left"), R = el.querySelector(".cd-fc__swipe--right");
      if (L) L.style.opacity = Math.min(1, Math.max(0, -dx - 20) / 80);
      if (R) R.style.opacity = Math.min(1, Math.max(0, dx - 20) / 80);
    };
    var up = function () {
      var d = drag.current, el = front.current; drag.current = null; if (!d || !el || d.lock !== "x") return;
      var v = d.dx / Math.max(1, performance.now() - d.t), w = (stack.current ? stack.current.offsetWidth : 320) * 0.32;
      el.removeAttribute("data-dragging");
      el.querySelectorAll(".cd-fc__swipe").forEach(function (s) { s.style.opacity = 0; });
      if (Math.abs(d.dx) > w || Math.abs(v) > 0.6) { swiped.current = true; var from = el.style.transform; el.style.transform = ""; rate(d.dx < 0 ? "again" : "good", d.dx < 0 ? "left" : "right", from); }
      else { el.setAttribute("data-settle", ""); el.style.transform = ""; setTimeout(function () { el.removeAttribute("data-settle"); }, 470); }
    };
    var tap = function () { if (swiped.current) { swiped.current = false; return; } if (!open) reveal(); };
    var last = hist[hist.length - 1];
    var label = function (r) { return RATES.filter(function (x) { return x[0] === r; })[0][1]; };
    if (done) {
      var easy = hist.filter(function (x) { return x.r === "good" || x.r === "easy"; }).length, mins = Math.max(1, Math.round((Date.now() - t0) / 60000));
      return h("div", { className: "cd-fc cd-root" },
        h("div", { className: "cd-fc__done", role: "status" },
          h("span", { className: "cd-done-mark" }, h("svg", { width: 30, height: 30, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, h("path", { d: "M5 12.5l4.5 4.5L19 7.5" }))),
          h("h3", null, "Revisão de hoje concluída"),
          h("p", null, "Os próximos cards voltam amanhã."),
          h("div", { className: "cd-fc__stats" },
            h("div", null, h("b", null, cards.length), h("span", null, "cards")),
            h("div", null, h("b", null, Math.round(easy / Math.max(1, hist.length) * 100) + "%"), h("span", null, "Bom ou Fácil")),
            h("div", null, h("b", null, mins + " min"), h("span", null, "de estudo"))),
          h("div", { className: "cd-row" }, h(Button, { variant: "gray", icon: "undo", onClick: undo }, "Desfazer a última"), h(Button, { variant: "filled", onClick: function () { setIdx(0); setHist([]); setOpen(false); } }, "Revisar de novo"))));
    }
    var visible = [];
    for (var k = idx; k < Math.min(cards.length, idx + 3); k++) visible.push(k);
    return h("div", { className: "cd-fc cd-root" },
      h("div", { className: "cd-fc__head" },
        h("span", { className: "cd-fc__deck" }, props.title || "Revisão de hoje"),
        h("span", { className: "cd-fc__count" }, (idx + 1) + " de " + cards.length),
        h(Button, { variant: "plain", size: "sm", icon: "undo", label: last ? "Desfazer avaliação: " + label(last.r) : "Nada para desfazer", disabled: !last, onClick: undo })),
      h("div", { className: "cd-fc__progress", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": cards.length, "aria-valuenow": idx, "aria-label": "Progresso da revisão" }, h("i", { style: { "--p": (idx / cards.length * 100) + "%" } })),
      h("div", { ref: stack, className: "cd-fc__stack", onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up },
        leaving && leaving.i < cards.length ? h(Leaving, { key: "leave-" + leaving.i + "-" + hist.length, card: cards[leaving.i], dir: leaving.dir, from: leaving.from }) : null,
        visible.slice().reverse().map(function (k) {
          var depth = k - idx, isFront = depth === 0;
          return h("div", {
            key: k, ref: isFront ? front : null, className: "cd-fc__card", "data-depth": String(depth), onClick: isFront ? tap : undefined,
            "aria-hidden": !isFront || undefined, "aria-live": isFront ? "polite" : undefined
          },
            isFront ? h("span", { className: "cd-fc__swipe cd-fc__swipe--left", "aria-hidden": true }, "De novo") : null,
            isFront ? h("span", { className: "cd-fc__swipe cd-fc__swipe--right", "aria-hidden": true }, "Bom") : null,
            h(CardFace, { card: cards[k], open: isFront && open }));
        })),
      h("div", { className: "cd-fc__bar" },
        h(Button, { ref: revealBtn, variant: "gray", block: true, className: "cd-fc__reveal", kbd: "Espaço", onClick: reveal, "data-hidden": open ? "" : undefined, tabIndex: open ? -1 : 0 }, "Mostrar resposta"),
        h("div", { className: "cd-fc__rates", role: "group", "aria-label": "Como foi lembrar?", "data-hidden": open ? undefined : "" },
          RATES.map(function (r, i) {
            return h("button", { key: r[0], ref: r[0] === "good" ? goodBtn : null, type: "button", tabIndex: open ? 0 : -1, className: cx("cd-rate", "cd-hoverable", "cd-rate--" + r[0]), onClick: function () { rate(r[0]); } },
              r[1], h("small", null, iv[r[0]], h(Kbd, null, r[2])));
          }))));
  }

  /* ---------- AnkiImport (fluxo: soltar → ler → conferir → importar) ---------- */
  function AnkiImport(props) {
    var deck = props.deck;
    var _s = useState(props.initialStep || "idle"), step = _s[0], setStep = _s[1];
    var _o = useState(false), over = _o[0], setOver = _o[1];
    var _e = useState(null), err = _e[0], setErr = _e[1];
    var _n = useState(0), n = _n[0], setN = _n[1];
    var _c = useState(function () { var m = {}; deck.areas.forEach(function (a) { m[a.name] = true; }); return m; }), sel = _c[0], setSel = _c[1];
    var input = useRef(null), dropEl = useRef(null), timer = useRef(null);
    var total = deck.areas.reduce(function (s, a) { return s + (sel[a.name] ? a.count : 0); }, 0);
    var run = function (target, next) {
      clearInterval(timer.current); setN(0);
      var t0 = performance.now(), dur = reduceMotion() ? 600 : 2600;
      timer.current = setInterval(function () {
        var p = Math.min(1, (performance.now() - t0) / dur);
        setN(Math.round(target * p));
        if (p >= 1) { clearInterval(timer.current); setStep(next); }
      }, 50);
    };
    useEffect(function () { return function () { clearInterval(timer.current); }; }, []);
    var accept = function (file) {
      if (file && !/\.apkg$/i.test(file.name)) { setErr("“" + file.name + "” não é um baralho do Anki. Exporte pelo Anki em Arquivo › Exportar, no formato .apkg."); var d = dropEl.current; d && (d.removeAttribute("data-error"), d.offsetWidth, d.setAttribute("data-error", "")); return; }
      setErr(null); setStep("reading"); run(deck.cards, "review");
    };
    var cancel = function () { clearInterval(timer.current); setStep("idle"); setN(0); };
    if (step === "idle") return h("div", { className: "cd-import cd-root" },
      h("div", {
        ref: dropEl, className: "cd-drop", "data-over": over ? "" : undefined,
        onDragOver: function (e) { e.preventDefault(); setOver(true); }, onDragLeave: function () { setOver(false); },
        onDrop: function (e) { e.preventDefault(); setOver(false); accept(e.dataTransfer.files[0]); }
      },
        h("span", { className: "cd-drop__icon" }, h(Icon, { name: "upload", size: 26 })),
        h("h3", null, "Importar do Anki"),
        h("p", null, "Arraste o arquivo .apkg para cá ou escolha no computador. Os baralhos, as imagens e a estrutura de pastas vêm junto."),
        h("div", { className: "cd-row", style: { justifyContent: "center", marginTop: 6 } },
          h(Button, { variant: "filled", icon: "file", onClick: function () { input.current.click(); } }, "Escolher arquivo"),
          props.demo ? h(Button, { variant: "plain", onClick: function () { accept(null); } }, "Usar " + deck.file.name) : null),
        h("input", { ref: input, id: "cd-apkg", type: "file", accept: ".apkg", hidden: true, onChange: function (e) { accept(e.target.files[0]); } }),
        err ? h("div", { className: "cd-callout", role: "alert", style: { marginTop: 8, textAlign: "left", background: "var(--danger-soft)", color: "var(--danger-ink)" } }, h(Icon, { name: "alert", size: 18, className: "" }), err) : null));
    var file = h("div", { className: "cd-file" },
      h("span", { className: "cd-file__glyph" }, h(Icon, { name: "cards", size: 22 })),
      h("div", null, h("div", { className: "cd-file__name" }, deck.file.name.replace(/\.apkg$/i, "")), h("div", { className: "cd-file__meta" }, deck.file.size + " · " + fmt(deck.cards) + " cards · " + fmt(deck.images) + " imagens")),
      null);
    if (step === "reading") return h("div", { className: "cd-import cd-root" },
      h("div", { className: "cd-import__panel", "aria-busy": true },
        file,
        h("div", { className: "cd-meter" },
          h("div", { className: "cd-meter__row" }, h("span", null, "Lendo cards"), h("span", null, h("b", null, fmt(n)), " de " + fmt(deck.cards))),
          h("div", { className: "cd-meter__track", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": deck.cards, "aria-valuenow": n, "aria-label": "Lendo cards" }, h("div", { className: "cd-meter__fill", style: { "--p": (n / deck.cards * 100) + "%" } }))),
        h("p", { className: "cd-import__p" }, "Você pode continuar usando o app enquanto isso."),
        h("div", { className: "cd-import__actions" }, h(Button, { variant: "gray", onClick: cancel }, "Cancelar"))));
    if (step === "review") return h("div", { className: "cd-import cd-root" },
      h("div", { className: "cd-import__panel" },
        file,
        h("div", null, h("h3", null, "Escolha o que entra"), h("p", { className: "cd-import__p", style: { marginTop: 4 } }, fmt(deck.subdecks) + " baralhos em " + deck.areas.length + " grupos. A estrutura de pastas é mantida.")),
        h("ul", { className: "cd-tree", "aria-label": "Baralhos" }, deck.areas.map(function (a) {
          var on = !!sel[a.name];
          return h("li", { key: a.name },
            h("button", { type: "button", role: "checkbox", "aria-checked": on, "aria-label": a.name, className: "cd-check", onClick: function () { var m = Object.assign({}, sel); m[a.name] = !on; setSel(m); } },
              h("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, h("path", { d: "M5 12.5l4.5 4.5L19 7.5" }))),
            h("div", null, h("div", { className: "cd-tree__name" }, a.name), h("div", { className: "cd-tree__sub" }, fmt(a.subdecks) + " baralhos")),
            h("span", { className: "cd-tree__n" }, fmt(a.count)));
        })),
        deck.note ? h("div", { className: "cd-callout" }, h(Icon, { name: "info", size: 18 }), deck.note) : null,
        h("div", { className: "cd-import__actions" },
          h(Button, { variant: "gray", onClick: cancel }, "Cancelar"),
          h(Button, { variant: "filled", disabled: !total, onClick: function () { setStep("importing"); run(total, "done"); } }, "Importar " + fmt(total) + " cards"))));
    if (step === "importing") return h("div", { className: "cd-import cd-root" },
      h("div", { className: "cd-import__panel", "aria-busy": true }, file,
        h("div", { className: "cd-meter" },
          h("div", { className: "cd-meter__row" }, h("span", null, "Importando"), h("span", null, h("b", null, fmt(n)), " de " + fmt(total) + " cards")),
          h("div", { className: "cd-meter__track", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": total, "aria-valuenow": n, "aria-label": "Importando cards" }, h("div", { className: "cd-meter__fill", style: { "--p": (n / Math.max(1, total) * 100) + "%" } }))),
        h("div", { className: "cd-import__actions" }, h(Button, { variant: "gray", onClick: cancel }, "Cancelar"))));
    return h("div", { className: "cd-import cd-root" },
      h("div", { className: "cd-import__panel", role: "status", style: { alignItems: "center", textAlign: "center", padding: "32px 24px" } },
        h("span", { className: "cd-done-mark" }, h("svg", { width: 30, height: 30, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" }, h("path", { d: "M5 12.5l4.5 4.5L19 7.5" }))),
        h("h3", null, fmt(total) + " cards importados"),
        h("p", { className: "cd-import__p" }, "Todos entram como novos. Na revisão de hoje aparecem os 20 primeiros; você muda esse limite em Ajustes."),
        h("div", { className: "cd-row", style: { justifyContent: "center" } },
          h(Button, { variant: "gray", icon: "undo", onClick: cancel }, "Desfazer importação"),
          h(Button, { variant: "filled", onClick: props.onDone }, "Começar a revisar"))));
  }

  /* ---------- Dialog (diálogo no desktop, folha no celular) ---------- */
  function Dialog(props) {
    var _c = useState(false), closing = _c[0], setClosing = _c[1], box = useRef(null), back = useRef(null);
    var close = function (after) { setClosing(true); setTimeout(function () { setClosing(false); (after || props.onClose)(); back.current && back.current.focus && back.current.focus(); }, reduceMotion() ? 0 : 200); };
    useEffect(function () {
      if (!props.open) return;
      back.current = document.activeElement;
      var f = box.current && box.current.querySelector("[data-autofocus]") || box.current && box.current.querySelector("button");
      f && f.focus();
      var key = function (e) {
        if (e.key === "Escape") { e.preventDefault(); close(); }
        if (e.key === "Tab" && box.current) {
          var els = box.current.querySelectorAll("button, a[href], input"); if (!els.length) return;
          var a = els[0], z = els[els.length - 1];
          if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
        }
      };
      window.addEventListener("keydown", key); return function () { window.removeEventListener("keydown", key); };
    }, [props.open]);
    if (!props.open) return null;
    return h("div", { className: "cd-scrim cd-root", "data-closing": closing ? "" : undefined, onMouseDown: function (e) { if (e.target === e.currentTarget) close(); } },
      h("div", { ref: box, className: "cd-dialog", role: "alertdialog", "aria-modal": true, "aria-labelledby": "cd-dlg-t", "aria-describedby": "cd-dlg-b" },
        h("span", { className: "cd-grabber", "aria-hidden": true }),
        h("h2", { id: "cd-dlg-t", className: "cd-dialog__title" }, props.title),
        props.children ? h("p", { id: "cd-dlg-b", className: "cd-dialog__body" }, props.children) : null,
        h("div", { className: "cd-dialog__actions" },
          h(Button, { variant: "gray", onClick: function () { close(); } }, props.cancelLabel || "Cancelar"),
          h(Button, { variant: props.destructive ? "destructive" : "filled", "data-autofocus": "", onClick: function () { close(props.onConfirm); } }, props.confirmLabel))));
  }

  /* ---------- ExamNavigator ---------- */
  function ExamNavigator(props) {
    var _r = useState(props.remaining), left = _r[0], setLeft = _r[1];
    var _c = useState(props.current), cur = _c[0], setCur = _c[1];
    var _m = useState(props.marked || []), marked = _m[0], setMarked = _m[1];
    var _d = useState(false), dlg = _d[0], setDlg = _d[1];
    var _f = useState(false), finished = _f[0], setFinished = _f[1];
    var answered = props.answered || [];
    useEffect(function () { if (finished) return; var t = setInterval(function () { setLeft(function (s) { return Math.max(0, s - 1); }); }, 1000); return function () { clearInterval(t); }; }, [finished]);
    var blank = props.total - answered.length;
    var tone = left < 300 ? "danger" : left < 1800 ? "warning" : null;
    var isA = function (n) { return answered.indexOf(n) >= 0; }, isM = function (n) { return marked.indexOf(n) >= 0; };
    var gridKey = function (e) {
      var d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 10, ArrowUp: -10 }[e.key]; if (!d) return;
      e.preventDefault(); var n = Math.min(props.total, Math.max(1, cur + d)); setCur(n);
      var b = e.currentTarget.querySelector('[data-n="' + n + '"]'); b && b.focus();
    };
    return h("section", { className: "cd-exam cd-root", "aria-label": "Mapa da prova" },
      h("header", { className: "cd-exam__head" },
        h("div", null, h("div", { className: "cd-exam__title" }, props.title), h("div", { className: "cd-exam__sub" }, fmt(answered.length) + " de " + props.total + " respondidas · " + marked.length + " para revisar")),
        h("div", { className: "cd-timer", "data-tone": tone || undefined, role: "timer", "aria-label": "Tempo restante " + hms(left) }, h(Icon, { name: "clock", size: 18 }), hms(left))),
      h("div", { className: "cd-col", style: { gap: 16 }, onKeyDown: gridKey }, props.areas.map(function (a) {
        var nums = []; for (var n = a.from; n <= a.to; n++) nums.push(n);
        var feitas = nums.filter(isA).length;
        return h("div", { key: a.name, className: "cd-grid-area" },
          h("div", { className: "cd-grid-area__name" }, h("span", null, AREA[a.name] ? h(Icon, { name: AREA[a.name], size: 16 }) : null, a.name), h("span", null, feitas + "/" + nums.length)),
          h("div", { className: "cd-grid" }, nums.map(function (n) {
            var st = isA(n) ? "answered" : "blank";
            return h("button", {
              key: n, type: "button", className: "cd-cell cd-hoverable", "data-n": n, "data-state": st, "data-marked": isM(n) ? "" : undefined, "aria-current": n === cur ? "true" : undefined, tabIndex: n === cur ? 0 : -1,
              "aria-label": "Questão " + n + (st === "answered" ? ", respondida" : ", em branco") + (isM(n) ? ", marcada para revisar" : ""),
              onClick: function () { setCur(n); props.onJump && props.onJump(n); }
            }, n);
          })));
      })),
      h("div", { className: "cd-legend", "aria-hidden": true },
        h("span", null, h("i", { "data-k": "answered" }), "Respondida"), h("span", null, h("i", null), "Em branco"),
        h("span", null, h("i", { "data-k": "marked" }), "Para revisar"), h("span", null, h("i", { "data-k": "current" }), "Atual")),
      h("footer", { className: "cd-exam__foot" },
        h(Button, { variant: "gray", icon: "flag", onClick: function () { setMarked(isM(cur) ? marked.filter(function (x) { return x !== cur; }) : marked.concat([cur])); } }, isM(cur) ? "Desmarcar a " + cur : "Marcar a " + cur + " para revisar"),
        finished ? h(Badge, { tone: "success", icon: "check" }, "Prova finalizada") : h(Button, { variant: "filled", onClick: function () { setDlg(true); } }, "Finalizar prova")),
      h(Dialog, {
        open: dlg, onClose: function () { setDlg(false); }, onConfirm: function () { setDlg(false); setFinished(true); },
        title: blank ? "Finalizar com " + blank + " questões em branco?" : "Finalizar a prova?", confirmLabel: "Finalizar", cancelLabel: "Continuar respondendo"
      }, (blank ? "Questões em branco contam como erro. " : "") + "Ainda restam " + hms(left) + " de prova. Depois de finalizar, não dá para mudar as respostas."));
  }

  /* ---------- Progress ---------- */
  function ProgressRing(props) {
    var size = props.size || 96, sw = props.stroke || Math.max(6, size / 10), r = (size - sw) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, props.value));
    return h("div", { className: "cd-ring", "data-tone": props.tone, role: "img", "aria-label": props.label || Math.round(v * 100) + "%", style: { width: size, height: size } },
      h("svg", { width: size, height: size, viewBox: "0 0 " + size + " " + size, "aria-hidden": true },
        h("circle", { className: "cd-ring__track", cx: size / 2, cy: size / 2, r: r, fill: "none", strokeWidth: sw }),
        h("circle", { className: "cd-ring__fill", cx: size / 2, cy: size / 2, r: r, fill: "none", strokeWidth: sw, strokeLinecap: "round", strokeDasharray: c, strokeDashoffset: c * (1 - v) })),
      props.children !== false ? h("div", { className: "cd-ring__label", "aria-hidden": true }, h("div", null,
        h("span", { className: "cd-ring__value", style: { "--fs": Math.round(size / 4.4) + "px" } }, props.text || Math.round(v * 100) + "%"),
        props.caption ? h("span", { className: "cd-ring__cap" }, props.caption) : null)) : null);
  }
  function Meter(props) {
    var p = Math.max(0, Math.min(1, props.value / props.max));
    return h("div", { className: "cd-meter" },
      h("div", { className: "cd-meter__row" }, h("span", null, props.label), h("span", null, props.valueLabel || h(F, null, h("b", null, fmt(props.value)), " de " + fmt(props.max)))),
      h("div", { className: "cd-meter__track", role: "meter", "aria-valuemin": 0, "aria-valuemax": props.max, "aria-valuenow": props.value, "aria-label": props.label }, h("div", { className: "cd-meter__fill", "data-tone": props.tone, style: { "--p": p * 100 + "%" } })));
  }
  function BarList(props) {
    var goal = props.goal;
    return h("figure", { className: "cd-bars", style: { margin: 0 } },
      props.summary ? h("figcaption", { className: "cd-bars__summary" }, props.summary) : null,
      props.rows.map(function (r) {
        return h("div", { key: r.name, className: "cd-bars__row" },
          h("span", { className: "cd-bars__name", title: r.name }, (r.icon || AREA[r.name]) ? h(Icon, { name: r.icon || AREA[r.name], size: 18 }) : null, h("span", { style: { overflow: "hidden", textOverflow: "ellipsis" } }, r.name)),
          h("span", { className: "cd-bars__track", role: "img", "aria-label": r.name + ": " + r.value + "%" + (r.n ? " em " + r.n + " questões" : "") },
            h("span", { className: "cd-bars__fill", style: { "--p": r.value + "%" } }),
            goal != null ? h("span", { className: "cd-bars__goal", style: { "--g": goal + "%" } }) : null),
          h("span", { className: "cd-bars__val" }, r.value + "%"));
      }),
      h("div", { className: "cd-bars__axis", "aria-hidden": true }, h("span", null), h("div", null, h("span", null, "0%"), h("span", null, "50%"), h("span", null, "100%")), h("span", null)));
  }

  /* ---------- StudyPlan (Cronograma) ---------- */
  function StudyPlan(props) {
    var _t = useState(props.tasks), tasks = _t[0], setTasks = _t[1];
    var _d = useState(props.week.filter(function (d) { return d.today; })[0].n), day = _d[0], setDay = _d[1];
    var done = tasks.filter(function (t) { return t.done; }).length;
    var toggle = function (id) { setTasks(tasks.map(function (t) { return t.id === id ? Object.assign({}, t, { done: !t.done }) : t; })); };
    var KIND = { questoes: ["questions", "Questões"], flashcards: ["cards", "Flashcards"], prova: ["exam", "Simulado"], erros: ["undo", "Revisar erros"] };
    return h("div", { className: "cd-plan cd-root" },
      h("section", { className: "cd-plan__hero", "aria-label": "Contagem regressiva" },
        h("div", null,
          h("div", { className: "cd-plan__eyebrow" }, props.exam),
          h("div", { className: "cd-plan__count" }, props.daysLeft, h("small", null, props.daysLeft === 1 ? "dia" : "dias")),
          h("div", { className: "cd-plan__date" }, props.dateLabel)),
        h(ProgressRing, { value: props.planDone, size: 104, caption: "do plano", label: Math.round(props.planDone * 100) + "% do plano concluído" })),
      h("div", { className: "cd-week", role: "group", "aria-label": "Semana" }, props.week.map(function (d) {
        var dots = []; for (var i = 0; i < Math.min(d.total || 0, 4); i++) dots.push(h("i", { key: i, "data-done": i < (d.today ? done : d.done || 0) ? "" : undefined }));
        return h("button", { key: d.n, type: "button", className: "cd-day cd-hoverable", "aria-pressed": day === d.n, "data-today": d.today ? "" : undefined, "data-exam": d.exam ? "" : undefined, onClick: function () { setDay(d.n); },
          "aria-label": d.label + (d.today ? ", hoje" : "") + (d.exam ? ", simulado" : "") },
          h("span", { className: "cd-day__wd" }, d.wd), h("span", { className: "cd-day__n" }, d.n), h("span", { className: "cd-day__dots" }, d.exam ? h("i") : dots));
      })),
      h("section", { className: "cd-tasks", "aria-label": "Tarefas de hoje" },
        h("div", { className: "cd-tasks__head" }, h("h3", null, "Hoje"), h("span", null, done + " de " + tasks.length + " feitas")),
        tasks.map(function (t) {
          var k = KIND[t.kind];
          return h("div", { key: t.id, className: "cd-task", "data-done": t.done ? "" : undefined },
            h("button", { type: "button", role: "checkbox", "aria-checked": !!t.done, "aria-label": t.title, className: "cd-task__check", onClick: function () { toggle(t.id); } },
              h("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, h("path", { d: "M5 12.5l4.5 4.5L19 7.5" }))),
            h("div", { style: { minWidth: 0 } },
              h("div", { className: "cd-task__title" }, t.title),
              h("div", { className: "cd-task__meta" }, h(Icon, { name: k[0], size: 15 }), h("span", null, k[1] + " · " + t.meta))),
            t.done ? null : h(Button, { variant: "tinted", size: "sm", onClick: props.onStart }, t.action || "Começar"));
        })));
  }

  /* ---------- Navegação ---------- */
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
      var g = G.current, lw = g.tw + g.ext * 2, sw = lw * lf * (1 + st);
      dock.current.style.setProperty("--lx", (s.x + lw / 2 - sw / 2).toFixed(1) + "px");
      dock.current.style.setProperty("--lw", sw.toFixed(1) + "px");
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
  function Sidebar(props) {
    var items = props.items || NAV;
    var groups = props.groups || [{ label: "Estudar", ids: ["hoje", "questoes", "provas", "flashcards"] }, { label: "Acompanhar", ids: ["desempenho"] }];
    var byId = {}; items.forEach(function (i) { byId[i.id] = i; });
    return h("nav", { className: "cd-side cd-root", "aria-label": "Principal" },
      h("div", { className: "cd-side__brand" }, h(Logo, { size: 26 })),
      groups.map(function (g) {
        return h("div", { key: g.label, className: "cd-side__group" }, h("div", { className: "cd-side__label" }, g.label), g.ids.map(function (id) {
          var it = byId[id], on = id === props.current;
          return h("button", { key: id, type: "button", className: "cd-side__item cd-hoverable", "aria-current": on ? "page" : undefined, onClick: function () { props.onChange && props.onChange(id); } },
            h(Icon, { name: it.icon, size: 20 }), it.label, it.count != null ? h("span", { className: "cd-side__count" }, fmt(it.count)) : null);
        }));
      }));
  }

  /* ---------- Pulse: traçado de ECG que corre como num monitor, para esperas ---------- */
  var ECG = "M0 20 H18 C20.5 20 21.5 15.5 24 15.5 C26.5 15.5 27.5 20 30 20 H35 L37 23 L41.5 4 L46 30 L48.5 20 H55 C58 20 60 13 64 13 C68 13 70 20 73 20 H96";
  function Pulse(props) {
    var size = props.size || 96;
    return h("span", { className: cx("cd-pulse", props.tone && "cd-pulse--" + props.tone), role: "status", "aria-label": props.label || "Carregando", style: { width: size, height: size * 0.36 } },
      h("svg", { viewBox: "0 0 96 34", width: size, height: size * 0.36, "aria-hidden": true, preserveAspectRatio: "none" },
        h("path", { className: "cd-pulse__base", d: ECG, pathLength: 1 }),
        h("path", { className: "cd-pulse__beat", d: ECG, pathLength: 1 })));
  }

  /* ---------- Vitals: painel de “sinais vitais” do estudo, no desenho de um monitor multiparamétrico ---------- */
  function trace(vals, w, hh, lo, hi) {
    var n = vals.length; if (n < 2) return "";
    var X = function (i) { return (i / (n - 1)) * w; }, Y = function (v) { return hh - 2 - ((v - lo) / Math.max(1e-6, hi - lo)) * (hh - 4); };
    var d = "M" + X(0).toFixed(1) + " " + Y(vals[0]).toFixed(1);
    for (var i = 1; i < n; i++) { var x0 = X(i - 1), x1 = X(i), y0 = Y(vals[i - 1]), y1 = Y(vals[i]), m = (x0 + x1) / 2; d += " C" + m.toFixed(1) + " " + y0.toFixed(1) + " " + m.toFixed(1) + " " + y1.toFixed(1) + " " + x1.toFixed(1) + " " + y1.toFixed(1); }
    return { d: d, x: X(n - 1), y: Y(vals[n - 1]), Y: Y };
  }
  function Vitals(props) {
    return h("section", { className: "cd-vitals cd-root", "aria-label": props.title || "Sinais vitais do estudo" },
      props.metrics.map(function (m) {
        var vals = m.trend || [], lo = Math.min.apply(null, vals.concat(m.goal != null ? [m.goal] : [])), hi = Math.max.apply(null, vals.concat(m.goal != null ? [m.goal] : []));
        var pad = (hi - lo) * 0.15 || 1, t = trace(vals, 160, 40, lo - pad, hi + pad);
        var below = m.goal != null && (m.higherIsBetter === false ? m.value > m.goal : m.value < m.goal);
        return h("article", { key: m.label, className: "cd-vital", "data-alarm": below ? "" : undefined },
          h("header", { className: "cd-vital__head" },
            h("span", { className: "cd-vital__ch" }, m.label),
            m.goal != null ? h("span", { className: "cd-vital__lim" }, "meta", h("b", null, m.goal)) : null),
          h("div", { className: "cd-vital__val" },
            h("span", { className: "cd-vital__n" }, m.display != null ? m.display : fmt(m.value)),
            m.unit ? h("span", { className: "cd-vital__u" }, m.unit) : null),
          t ? h("svg", { className: "cd-vital__trace", viewBox: "0 0 160 40", preserveAspectRatio: "none", role: "img", "aria-label": m.label + ": " + vals.join(", ") + (m.note ? " (" + m.note + ")" : "") },
            m.goal != null ? h("line", { className: "cd-vital__goal", x1: 0, x2: 160, y1: t.Y(m.goal), y2: t.Y(m.goal) }) : null,
            h("path", { className: "cd-vital__line", d: t.d }),
            h("circle", { className: "cd-vital__now", cx: t.x, cy: t.y, r: 3 })) : null,
          h("footer", { className: "cd-vital__foot" },
            below ? h("span", { className: "cd-vital__alarm" }, h(Icon, { name: "alert", size: 14, strokeWidth: 2 }), m.alarm || "abaixo da meta") : h("span", null, m.note || "")));
      }));
  }

  /* ---------- Toast ---------- */
  function Toast(props) {
    return h("div", { className: "cd-toast cd-root", role: "status", "aria-live": "polite", "data-closing": props.closing ? "" : undefined, style: props.style },
      props.icon ? h(Icon, { name: props.icon, size: 18 }) : null,
      h("span", null, props.children),
      props.action ? h("button", { type: "button", className: "cd-toast__action", onClick: props.onAction }, props.action, props.kbd ? h(Kbd, null, props.kbd) : null) : h("span", { style: { width: 10 } }));
  }

  var api = { Logo: Logo, Mark: Mark, Button: Button, SegmentedControl: SegmentedControl, Chip: Chip, Badge: Badge, Alternative: Alternative, QuestionCard: QuestionCard, VideoCorrection: VideoCorrection, Flashcard: Flashcard, AnkiImport: AnkiImport, ExamNavigator: ExamNavigator, Dialog: Dialog, StudyPlan: StudyPlan, ProgressRing: ProgressRing, Meter: Meter, BarList: BarList, TabBar: TabBar, Sidebar: Sidebar, Pulse: Pulse, Vitals: Vitals, Toast: Toast, AREA_ICON: AREA, Icon: Icon, Kbd: Kbd, nav: NAV, format: { hms: hms, number: fmt } };
  window.Conduta = Object.assign(window.Conduta || {}, api);
})();
