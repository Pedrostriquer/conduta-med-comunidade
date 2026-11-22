"""Paleta do Conduta: define as cores em OKLCH, converte para hex e confere o contraste (WCAG 2) de cada par de uso.

Uso: python3 -I scripts/cores.py  -> imprime a tabela de contraste e grava build/cores.json
"""
import json, math, os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))


def oklch_hex(L, C, h):
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    rgb = (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
           -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
           -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    out = []
    for c in rgb:
        c = min(max(c, 0), 1)
        c = 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
        out.append(round(c * 255))
    return "#%02x%02x%02x" % tuple(out)


def lum(hx):
    hx = hx[:7]
    r, g, b = (int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5))
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contraste(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


# (nome, claro, escuro, uso). Matiz neutro 255 = cinza puxado para o azul do acento.
H = 255
P = [
    ("bg", (0.972, 0.004, H), (0.155, 0.008, H), "Fundo da página e das listas agrupadas."),
    ("surface", (1.0, 0.0, H), (0.205, 0.010, H), "Cartões, a questão, o flashcard, folhas (sheets)."),
    ("surface-2", (0.952, 0.006, H), (0.255, 0.011, H), "Preenchimento embutido: trilho do controle segmentado, chip inativo, célula vazia do mapa da prova."),
    ("surface-3", (0.925, 0.008, H), (0.300, 0.012, H), "Estado pressionado de linhas e de botões cinza."),
    ("line", (0.905, 0.008, H), (0.300, 0.012, H), "Divisórias finas (1px) entre linhas e seções. Decorativa: não carrega significado."),
    ("line-strong", (0.640, 0.014, H), (0.540, 0.014, H), "Borda de controle que carrega significado (alternativa, campo, checkbox): 3:1 sobre surface."),
    ("ink", (0.215, 0.016, H), (0.945, 0.005, H), "Texto principal, sobre bg, surface e surface-2."),
    ("ink-2", (0.455, 0.016, H), (0.760, 0.012, H), "Texto secundário: metadados, legendas, rótulos de eixo. Sobre bg, surface e surface-2."),
    ("ink-3", (0.540, 0.014, H), (0.660, 0.012, H), "Texto terciário: placeholder, contadores apagados. Sobre surface (4.5:1); evite sobre surface-2."),
    ("accent", (0.535, 0.185, 258), (0.560, 0.180, 258), "Azul Conduta. Preenchimento do botão principal, alternativa marcada, célula respondida, foco. Texto branco por cima (on-accent)."),
    ("accent-hover", (0.490, 0.180, 258), (0.515, 0.180, 258), "Hover e pressionado do preenchimento accent (mais escuro nos dois temas, para o rótulo branco continuar legível)."),
    ("accent-ink", (0.515, 0.185, 258), (0.760, 0.125, 255), "Azul como texto ou ícone (links, botão simples, número da questão) sobre surface, bg e accent-soft."),
    ("accent-soft", (0.955, 0.028, 255), (0.290, 0.060, 258), "Fundo tingido: alternativa selecionada, chip ativo, dia de hoje no cronograma."),
    ("on-accent", (1.0, 0.0, H), (1.0, 0.0, H), "Texto e ícone sobre accent (o rótulo do botão principal)."),
    ("success", (0.560, 0.105, 180), (0.620, 0.105, 180), "Acerto: preenchimento do selo e do ícone de certo. Puxado para o verde-azulado, longe do eixo vermelho–verde."),
    ("success-ink", (0.480, 0.090, 180), (0.810, 0.105, 180), "Texto de acerto (\"Você acertou\", alternativa correta) sobre surface e success-soft."),
    ("success-soft", (0.955, 0.028, 180), (0.275, 0.042, 180), "Fundo da alternativa correta e do resultado de acerto."),
    ("danger", (0.580, 0.190, 33), (0.650, 0.185, 33), "Erro: ícone de errado, De novo, ação destrutiva. Laranja-avermelhado, separado do verde-azulado por matiz e luminosidade."),
    ("danger-ink", (0.520, 0.180, 33), (0.780, 0.120, 33), "Texto de erro (\"Você errou\", alternativa marcada errada) sobre surface e danger-soft."),
    ("danger-soft", (0.955, 0.025, 33), (0.280, 0.055, 33), "Fundo da alternativa marcada errada."),
    ("warning", (0.780, 0.150, 75), (0.800, 0.140, 78), "Atenção: bandeira de revisão, aviso de tempo. Só como preenchimento ou ícone, nunca como texto sobre branco."),
    ("warning-ink", (0.500, 0.105, 65), (0.840, 0.120, 80), "Texto de atenção (Anulada, Gabarito alterado, Vídeo diverge) sobre surface e warning-soft."),
    ("warning-soft", (0.965, 0.040, 85), (0.290, 0.045, 75), "Fundo dos selos de atenção."),
    ("focus", (0.535, 0.185, 258), (0.760, 0.125, 255), "Anel de foco do teclado: 2px sólido com 2px de folga na cor do fundo. 3:1 ou mais sobre bg, surface e accent-soft."),
    ("scrim", (0.215, 0.016, H), (0.0, 0.0, H), "Véu atrás de folhas e diálogos (usar com 40% de opacidade no claro, 60% no escuro)."),
]

cores = {}
for nome, c, e, uso in P:
    cores[nome] = {"light": oklch_hex(*c), "dark": oklch_hex(*e), "usage": uso}

# cores derivadas, com transparência (hex de 8 dígitos)
X = lambda n, t: cores[n][t]
EXTRA = [
    ("thumb", "#ffffff", oklch_hex(0.370, 0.012, H), "Polegar do controle segmentado e do interruptor, sobre surface-2."),
    ("hover", X("ink", "light") + "0d", "#ffffff12", "Camada de hover sobre qualquer preenchimento (aplicar como background-image)."),
    ("pressed", X("ink", "light") + "1a", "#ffffff1f", "Camada de pressionado sobre qualquer preenchimento."),
    ("material", "#ffffffc7", X("surface", "dark") + "c7", "Vidro da navegação (dock e barra superior): 78% de opacidade, com backdrop-filter blur(16px) saturate(190%). Só na camada de navegação, nunca no conteúdo."),
    ("inverse", X("ink", "light"), X("ink", "dark"), "Fundo invertido: aviso (toast) e dica de teclado em destaque."),
    ("on-inverse", "#ffffff", X("ink", "light"), "Texto sobre inverse."),
    ("accent-inverse", X("accent-ink", "dark"), X("accent-ink", "light"), "Ação (Desfazer) sobre inverse."),
]
for nome, cl, es, uso in EXTRA:
    cores[nome] = {"light": cl, "dark": es, "usage": uso}

PARES = [  # (texto, fundo, minimo)
    ("ink", "bg", 7), ("ink", "surface", 7), ("ink", "surface-2", 7),
    ("ink-2", "bg", 4.5), ("ink-2", "surface", 4.5), ("ink-2", "surface-2", 4.5),
    ("ink-3", "surface", 4.5),
    ("on-accent", "accent", 4.5), ("on-accent", "accent-hover", 4.5),
    ("accent-ink", "surface", 4.5), ("accent-ink", "bg", 4.5), ("accent-ink", "accent-soft", 4.5),
    ("success-ink", "surface", 4.5), ("success-ink", "success-soft", 4.5),
    ("danger-ink", "surface", 4.5), ("danger-ink", "danger-soft", 4.5),
    ("warning-ink", "surface", 4.5), ("warning-ink", "warning-soft", 4.5),
    ("line-strong", "surface", 3), ("accent", "surface", 3), ("accent", "bg", 3),
    ("success", "surface", 3), ("danger", "surface", 3), ("focus", "surface", 3), ("focus", "bg", 3), ("focus", "accent-soft", 3), ("on-inverse", "inverse", 7), ("accent-inverse", "inverse", 4.5), ("ink", "thumb", 7), ("warning", "surface", 1.8),
]
falhas = 0
for tema in ("light", "dark"):
    print(f"\n{tema}")
    for t, f, minimo in PARES:
        r = contraste(cores[t][tema], cores[f][tema])
        ok = r >= minimo
        falhas += not ok
        print(f"  {t:12} sobre {f:13} {r:5.2f}  {'ok' if ok else 'FALHA (min %.1f)' % minimo}")
# acerto e erro tem que se distinguir por luminosidade tambem (alem do icone e da palavra)
for tema in ("light", "dark"):
    print(tema, "success vs danger:", round(contraste(cores["success"][tema], cores["danger"][tema]), 2))
os.makedirs(os.path.join(AQUI, "..", "build"), exist_ok=True)
json.dump(cores, open(os.path.join(AQUI, "..", "build", "cores.json"), "w"), ensure_ascii=False, indent=1)
print("\nfalhas:", falhas)
for n, v in cores.items():
    print(f"{n:13} {v['light']}  {v['dark']}")
