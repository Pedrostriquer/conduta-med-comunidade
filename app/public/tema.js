// tema antes do primeiro quadro, para não piscar claro no escuro
try { document.documentElement.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch (e) {}
