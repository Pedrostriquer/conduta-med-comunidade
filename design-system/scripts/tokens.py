"""Gera project/tokens.json a partir de build/cores.json (rode scripts/cores.py antes)."""
import json, os

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
cores = json.load(open(os.path.join(RAIZ, "build", "cores.json")))

ORDEM = ["bg", "surface", "surface-2", "surface-3", "thumb", "material", "line", "line-strong",
         "ink", "ink-2", "ink-3", "inverse", "on-inverse",
         "accent", "accent-hover", "accent-ink", "accent-soft", "on-accent", "accent-inverse", "focus",
         "success", "success-ink", "success-soft", "danger", "danger-ink", "danger-soft",
         "warning", "warning-ink", "warning-soft", "hover", "pressed", "scrim"]
assert set(ORDEM) == set(cores), set(cores) ^ set(ORDEM)

UI = "\"Hanken Grotesk\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", system-ui, sans-serif"
LEITURA = "Literata, \"Iowan Old Style\", \"New York\", Georgia, serif"
MONO = "ui-monospace, \"SF Mono\", Menlo, Consolas, monospace"


def estilo(nome, tam, alt, peso, uso, amostra, track=None, fam=None, opsz=None):
    s = {"name": nome, "fontSize": f"{tam}px", "lineHeight": f"{alt}px", "fontWeight": peso, "usage": uso, "sample": amostra}
    if track:
        s["letterSpacing"] = track
    if fam:
        s["family"] = fam
    if opsz:
        s["opticalSize"] = opsz
    return s


tokens = {
    "name": "Conduta",
    "version": 1,
    "color": {
        "themes": [{"id": "light", "name": "Claro"}, {"id": "dark", "name": "Escuro"}],
        "tokens": [{"name": n, "value": {"light": cores[n]["light"], "dark": cores[n]["dark"]}, "usage": cores[n]["usage"]} for n in ORDEM],
    },
    "type": {
        "fonts": [
            {"family": "Hanken Grotesk", "file": "fonts/HankenGrotesk-Roman-latin.woff2", "weight": "100 900", "style": "normal"},
            {"family": "Hanken Grotesk", "file": "fonts/HankenGrotesk-Italic-latin.woff2", "weight": "100 900", "style": "italic"},
            {"family": "Literata", "file": "fonts/Literata-Roman-latin.woff2", "weight": "200 900", "style": "normal"},
            {"family": "Literata", "file": "fonts/Literata-Italic-latin.woff2", "weight": "200 900", "style": "italic"},
        ],
        "families": {"sans": UI, "reading": LEITURA, "mono": MONO},
        "groups": [
            {"name": "Interface", "family": "sans", "styles": [
                estilo("display", 44, 48, 700, "Um número por tela: contagem regressiva do cronograma, nota final do simulado. Sempre com tabular-nums.", "13 dias", "-0.025em"),
                estilo("title-1", 30, 36, 700, "Título da tela (Hoje, Questões, Flashcards).", "Hoje", "-0.02em"),
                estilo("title-2", 23, 29, 650, "Título de seção e de folha (sheet).", "Prova de amanhã", "-0.015em"),
                estilo("title-3", 19, 25, 600, "Título de cartão e de grupo.", "Correção em vídeo", "-0.01em"),
                estilo("headline", 16, 22, 600, "Rótulo forte em linhas de lista e botões.", "40 questões de Cardiologia"),
                estilo("body", 16, 24, 400, "Texto corrido da interface.", "Seu cronograma termina em 8 de novembro."),
                estilo("callout", 15, 21, 400, "Texto de apoio em avisos, descrições curtas.", "Questões em branco contam como erro."),
                estilo("subhead", 14, 20, 500, "Rótulos de controles pequenos, chips, segmentos.", "Últimos 30 dias"),
                estilo("footnote", 13, 18, 400, "Metadados: banca, ano, caminho do tema.", "Clínica Médica › Cardiologia"),
                estilo("caption", 12, 16, 500, "Legendas, rótulo da barra de abas, selos. Mínimo absoluto de 11px.", "Gabarito preliminar", "0.01em"),
            ]},
            {"name": "Leitura", "family": "reading", "styles": [
                estilo("question", 18, 29, 400, "Enunciado da questão. Medida máxima de 68 caracteres; o tamanho escala com o controle Aa.", "Homem de 71 anos, tabagista, hipertenso, dá entrada com dor retroesternal em queimação.", None, None, 18),
                estilo("option", 17, 26, 400, "Texto das alternativas A–E.", "Solicitar eletrocardiograma e marcadores de necrose miocárdica.", None, None, 17),
                estilo("card", 22, 32, 400, "Frente do flashcard (os cards de um baralho grande têm, em mediana, 81 caracteres).", "O sulfato de magnésio na pré-eclâmpsia previne a […]", "-0.005em", None, 22),
                estilo("explanation", 16, 26, 400, "Explicação da resposta e verso do flashcard.", "Dor em queimação em idoso de risco é equivalente isquêmico até prova em contrário.", None, None, 16),
            ]},
        ],
    },
    "spacing": {"tokens": [
        {"name": "space-1", "value": "4px", "usage": "Entre ícone e rótulo pequeno; folga interna de selos."},
        {"name": "space-2", "value": "8px", "usage": "Entre alternativas; entre ícone e rótulo de botão."},
        {"name": "space-3", "value": "12px", "usage": "Padding vertical de linhas de lista e de alternativas."},
        {"name": "space-4", "value": "16px", "usage": "Margem lateral mínima no celular; padding de controles médios."},
        {"name": "space-5", "value": "20px", "usage": "Padding do cartão no celular."},
        {"name": "space-6", "value": "24px", "usage": "Padding do cartão no desktop; entre blocos dentro de um cartão."},
        {"name": "space-8", "value": "32px", "usage": "Entre seções da tela; padding do flashcard."},
        {"name": "space-12", "value": "48px", "usage": "Entre grupos grandes da página."},
        {"name": "space-16", "value": "64px", "usage": "Respiro do topo da tela no desktop."},
    ]},
    "radius": {"tokens": [
        {"name": "radius-xs", "value": "6px", "usage": "Selos, teclas (kbd), lacuna do flashcard."},
        {"name": "radius-sm", "value": "9px", "usage": "Botão pequeno, polegar do controle segmentado (11 − 2 de folga), itens da barra lateral."},
        {"name": "radius-md", "value": "12px", "usage": "Botão médio, campos, células do mapa da prova."},
        {"name": "radius-lg", "value": "16px", "usage": "Alternativas e blocos dentro de um cartão (22 − 6 de folga)."},
        {"name": "radius-xl", "value": "22px", "usage": "Cartão da questão, diálogos no desktop, zona de importação."},
        {"name": "radius-2xl", "value": "28px", "usage": "Flashcard e folhas que sobem da borda do celular."},
        {"name": "radius-full", "value": "999px", "usage": "Chips, interruptores, anéis e o aviso (toast)."},
    ]},
    "shadow": {"note": "Sombras curtas e frias. No escuro a elevação vem da superfície mais clara, então a sombra quase some.", "tokens": [
        {"name": "shadow-1", "value": {"light": "0 1px 2px #151a210f, 0 0 0 1px #151a210a", "dark": "0 0 0 1px #ffffff0f"}, "usage": "Cartões sobre bg (questão, tarefas)."},
        {"name": "shadow-2", "value": {"light": "0 2px 6px #151a2114, 0 1px 1px #151a210d", "dark": "0 2px 6px #00000066, 0 0 0 1px #ffffff12"}, "usage": "Polegar do segmentado, flashcard da frente."},
        {"name": "shadow-3", "value": {"light": "0 16px 40px -8px #151a2133, 0 4px 12px #151a2114", "dark": "0 16px 40px -8px #000000b3, 0 0 0 1px #ffffff14"}, "usage": "Diálogos, folhas, aviso (toast), menu."},
    ]},
    "duration": {"note": "Quanto mais frequente a interação, mais curta a animação. A saída usa cerca de 70% do tempo da entrada.", "tokens": [
        {"name": "duration-instant", "value": "90ms", "usage": "Pressionar (escala 0,97) e trocar cor no toque."},
        {"name": "duration-quick", "value": "160ms", "usage": "Hover, chip, marcar alternativa, saída do flashcard avaliado."},
        {"name": "duration-base", "value": "240ms", "usage": "Revelar resposta, abrir a explicação, entrada do aviso."},
        {"name": "duration-gentle", "value": "360ms", "usage": "Diálogo e folha entrando; troca de tela."},
        {"name": "duration-slow", "value": "520ms", "usage": "Momentos únicos: anel do cronograma ao concluir o dia, resultado do simulado."},
    ]},
    "easing": {"note": "Molas calculadas como no SwiftUI (duração percebida e quique); use a duração de assentamento indicada em cada uso.", "tokens": [
        {"name": "ease-out", "value": "cubic-bezier(0.22, 1, 0.36, 1)", "usage": "Padrão para entrar e responder ao toque: arranca rápido e assenta devagar."},
        {"name": "ease-in-out", "value": "cubic-bezier(0.65, 0, 0.35, 1)", "usage": "Algo que já está na tela e muda de lugar (indicador de progresso)."},
        {"name": "ease-exit", "value": "cubic-bezier(0.4, 0, 1, 1)", "usage": "Saídas: some acelerando, sem pedir atenção."},
        {"name": "spring-smooth", "value": "linear(0, 0.039, 0.127, 0.235, 0.348, 0.454, 0.55, 0.633, 0.704, 0.763, 0.811, 0.851, 0.883, 0.908, 0.928, 0.944, 0.957, 0.966, 0.974, 0.98, 0.985, 0.988, 0.991, 0.993, 0.995, 0.996, 0.997, 0.998, 1)", "usage": "Mola sem quique (duração percebida 450ms, assenta em 616ms): folhas, explicação abrindo, lacuna do flashcard."},
        {"name": "spring-snappy", "value": "linear(0, 0.037, 0.124, 0.236, 0.356, 0.472, 0.578, 0.671, 0.75, 0.814, 0.866, 0.906, 0.937, 0.96, 0.977, 0.988, 0.996, 1.001, 1.004, 1.006, 1.006, 1.006, 1.006, 1.005, 1.004, 1.004, 1.003, 1.002, 1)", "usage": "Mola curta com 15% de quique (350ms, assenta em 459ms): polegar do segmentado, próximo flashcard, soltar o botão."},
        {"name": "spring-bouncy", "value": "linear(0, 0.047, 0.159, 0.303, 0.454, 0.597, 0.721, 0.824, 0.904, 0.963, 1.003, 1.028, 1.041, 1.046, 1.045, 1.04, 1.034, 1.027, 1.02, 1.014, 1.009, 1.005, 1.002, 1, 0.999, 0.998, 0.998, 0.998, 1)", "usage": "Mola com 30% de quique (500ms, assenta em 738ms). Só para um acerto ou um dia concluído; nunca em interações repetidas."},
    ]},
    "layout": {"note": "Larguras de referência.", "tokens": [
        {"name": "measure", "value": "68ch", "usage": "Largura máxima do enunciado e da explicação."},
        {"name": "content-max", "value": "760px", "usage": "Coluna da questão e do flashcard."},
        {"name": "sidebar-width", "value": "248px", "usage": "Barra lateral a partir de 1000px de largura."},
        {"name": "breakpoint-compact", "value": "700px", "usage": "Abaixo disso: barra de abas embaixo, folhas sobem da borda, padding de 16px."},
        {"name": "breakpoint-regular", "value": "1000px", "usage": "A partir disso: barra lateral no lugar da barra de abas."},
        {"name": "target-touch", "value": "44px", "usage": "Área mínima de toque de qualquer controle."},
    ]},
}
json.dump(tokens, open(os.path.join(RAIZ, "project", "tokens.json"), "w"), ensure_ascii=False, indent=1)
print("tokens.json:", len(tokens["color"]["tokens"]), "cores")
