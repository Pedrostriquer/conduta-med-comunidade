import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/admin.css"; // estilos "adm-": as telas de admin saíram do app, mas Análises com IA ainda usa
import "./styles/tokens.css";
import "./styles/ds.css";
import "./styles/app.css";
import "./styles/flashcards.css";
import "./styles/busca.css";
import "./styles/questoes.css";
import "./styles/cronograma.css";
import "./styles/auth.css";
import "./styles/perfil.css";
import "./styles/comunidade.css";
import "./styles/resumos.css";
import "./styles/plugin.css";
import "./styles/assuntos.css";
import "./styles/chat.css";
import { followSystemTheme } from "./lib/theme";
import { App } from "./app/App";
import { MotionGlobalConfig } from "motion/react";

// só em desenvolvimento: ?semanimacao pula todas as animações (para conferir telas com o navegador em segundo plano)
if (import.meta.env.DEV && new URLSearchParams(location.search).has("semanimacao")) {
  MotionGlobalConfig.skipAnimations = true;
  sessionStorage.setItem("semanimacao", "1");
}
if (import.meta.env.DEV && sessionStorage.getItem("semanimacao")) {
  MotionGlobalConfig.skipAnimations = true;
  document.documentElement.setAttribute("data-semanimacao", "");
  const st = document.createElement("style");
  st.textContent = "[data-semanimacao] *, [data-semanimacao] *::before, [data-semanimacao] *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }";
  document.head.appendChild(st);
}

followSystemTheme();
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
