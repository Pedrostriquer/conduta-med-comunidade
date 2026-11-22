/* O corpo 3D da tela de escolha: a pessoa gira e clica na zona do esqueleto que quer treinar.
   A lista de regiões ao lado faz o mesmo, para quem não quer (ou não pode) usar o 3D. */
import { useEffect, useRef, useState } from "react";
import { ZONA_GRUPO } from "./atlas";
import type { Modo } from "./catalogo";
import type { Corpo } from "./corpo3d";

const claro = () => document.documentElement.dataset.theme !== "dark";

export function CorpoEscolha({ modo, grupo, titulos, onGrupo }: { modo: Exclude<Modo, "ecg">; grupo: string | null; titulos: Record<string, string>; onGrupo: (g: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), corpo = useRef<Corpo | null>(null);
  const [estado, setEstado] = useState<"carregando" | "pronto" | "erro">("carregando");
  const [pairando, setPairando] = useState<string | null>(null);
  // o que o 3D lê na hora do clique, sem recriar a cena
  const agora = useRef({ modo, grupo, onGrupo }); agora.current = { modo, grupo, onGrupo };
  const zonasDe = (g: string | null) => (g ? Object.entries(ZONA_GRUPO[agora.current.modo]).filter(([, x]) => x === g).map(([z]) => "corpo/" + z) : []);

  useEffect(() => {
    let vivo = true;
    const zona = (id: string | null) => (id ? ZONA_GRUPO[agora.current.modo][id.split("/")[1]] ?? null : null);
    import("./corpo3d").then(async (m) => {
      if (!vivo) return;
      const c = m.criarCorpo(canvas.current!, {
        aoPairar: (id) => { const g = zona(id); setPairando(g); c.realcar([...zonasDe(agora.current.grupo), ...zonasDe(g)]); },
        aoClicar: (id) => { const g = zona(id); if (g) agora.current.onGrupo(g); },
      });
      corpo.current = c; c.tema(claro());
      await c.carregar("corpo");
      if (!vivo) return;
      c.realcar(zonasDe(agora.current.grupo)); setEstado("pronto");
    }).catch(() => { if (vivo) setEstado("erro"); });
    const mo = new MutationObserver(() => corpo.current?.tema(claro()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { vivo = false; mo.disconnect(); corpo.current?.destruir(); corpo.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { corpo.current?.realcar(zonasDe(grupo)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [grupo, modo]);

  const rotulo = pairando ?? grupo;
  return (
    <div className="tr-corpo" data-pronto={estado === "pronto" ? "" : undefined}>
      <canvas ref={canvas} className="tr-corpo__c" aria-label="Corpo em 3D. Arraste para girar e clique numa região. A lista ao lado tem as mesmas regiões." />
      <span className="tr-corpo__rot" data-on={rotulo ? "" : undefined}>{rotulo ? titulos[rotulo] : "Gire e clique numa região"}</span>
      {estado !== "pronto" ? <p className="tr-corpo__aviso">{estado === "erro" ? "Não deu para carregar o corpo 3D. Use a lista." : "Carregando…"}</p> : null}
    </div>
  );
}
