"""Compila project/tokens.json em build/tokens.css, no mesmo layout que a página do design system gera (só para testar localmente)."""
import json, os
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
t = json.load(open(os.path.join(RAIZ, "project", "tokens.json")))
temas = [x["id"] for x in t["color"]["themes"]]
def val(v, tema):
    return v if isinstance(v, str) else v.get(tema, v[temas[0]])
out = ["/* Conduta — generated from tokens.json */"]
for f in t["type"]["fonts"]:
    out.append(f"@font-face{{font-family:'{f['family']}';src:url('../project/{f['file']}') format('woff2');font-weight:{f['weight']};font-style:{f.get('style','normal')};font-display:swap}}")
for i, tema in enumerate(temas):
    sel = f':root, [data-theme="{tema}"]' if i == 0 else f'[data-theme="{tema}"]'
    linhas = [f"--{c['name']}:{val(c['value'], tema)}" for c in t["color"]["tokens"]]
    linhas += [f"--{c['name']}:{val(c['value'], tema)}" for c in t.get("shadow", {}).get("tokens", [])]
    out.append(sel + "{" + ";".join(linhas) + (";color-scheme:dark" if tema == "dark" else "") + "}")
outros = []
for fam, d in t.items():
    if fam in ("name", "version", "color", "type", "shadow"):
        continue
    outros += [f"--{c['name']}:{c['value']}" for c in d["tokens"]]
outros += [f"--font-{k}:{v}" for k, v in t["type"]["families"].items()]
out.append(":root{" + ";".join(outros) + "}")
for g in t["type"]["groups"]:
    for s in g["styles"]:
        fam = s.get("family", g["family"])
        r = f"font-family:var(--font-{fam});font-size:{s['fontSize']};line-height:{s['lineHeight']};font-weight:{s['fontWeight']}"
        if "letterSpacing" in s: r += f";letter-spacing:{s['letterSpacing']}"
        if "opticalSize" in s: r += f";font-variation-settings:'opsz' {s['opticalSize']}"
        out.append(f".{s['name']}{{{r}}}")
open(os.path.join(RAIZ, "build", "tokens.css"), "w").write("\n".join(out) + "\n")
print("build/tokens.css ok")
