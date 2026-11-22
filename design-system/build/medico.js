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
