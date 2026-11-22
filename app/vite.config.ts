import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// o mesmo que o Caddy manda em produção: `npm run preview` confere a versão compilada com estas regras
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://www.youtube.com https://s.ytimg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://i.ytimg.com; font-src 'self'; media-src 'self' blob:; frame-src https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'self'; worker-src 'self' blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const proxy = Object.fromEntries(["/api", "/mcp", "/oauth", "/.well-known", "/uploads", "/ia.md", "/llms.txt"].map((p) => [p, { target: "http://127.0.0.1:8300", changeOrigin: false }]));

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    // a API e o plugin rodam em outro processo no desenvolvimento; em produção é tudo o mesmo domínio
    proxy,
  },
  preview: { host: "127.0.0.1", headers: { "Content-Security-Policy": CSP }, proxy },
  build: { target: "es2022", chunkSizeWarningLimit: 900 },
});
