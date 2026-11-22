/* Teclado desenhado na tela: mostra a próxima tecla (rodada 1), pisca a que foi apertada e também aceita toque. */
import { forwardRef, useImperativeHandle, useRef } from "react";

const LINHAS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

export type TecladoRef = { pisca: (c: string, erro?: boolean) => void };

export const Teclado = forwardRef<TecladoRef, { proxima?: string; numeros?: boolean; onTecla: (c: string) => void; onApagar: () => void; onEnter: () => void }>(
  function Teclado({ proxima, numeros, onTecla, onApagar, onEnter }, ref) {
    const el = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => ({
      pisca(c, erro) {
        const k = el.current?.querySelector<HTMLElement>(`[data-k="${c === " " ? "espaco" : c === '"' ? "" : c}"]`);
        if (!k) return;
        const attr = erro ? "data-erro" : "data-press";
        k.setAttribute(attr, "");
        setTimeout(() => k.removeAttribute(attr), erro ? 240 : 110);
      },
    }), []);
    const tecla = (k: string, label: string, onClick: () => void, extra = "") => (
      <button key={k} type="button" tabIndex={-1} className={"tr-kb__k" + extra} data-k={k} data-next={proxima === k || (k === "espaco" && proxima === " ") ? "" : undefined}
        onPointerDown={(e) => { e.preventDefault(); onClick(); }}>{label}</button>
    );
    return (
      <div className="tr-kb" ref={el} aria-hidden>
        {numeros ? <div className="tr-kb__row">{[..."1234567890"].map((c) => tecla(c, c, () => onTecla(c)))}</div> : null}
        <div className="tr-kb__row">{[...LINHAS[0]].map((c) => tecla(c, c, () => onTecla(c)))}{tecla("apagar", "⌫", onApagar, " tr-kb__k--w")}</div>
        <div className="tr-kb__row">{[...LINHAS[1]].map((c) => tecla(c, c, () => onTecla(c)))}{tecla("enter", "enter", onEnter, " tr-kb__k--w2")}</div>
        <div className="tr-kb__row">{[...LINHAS[2]].map((c) => tecla(c, c, () => onTecla(c)))}{tecla("-", "-", () => onTecla("-"))}</div>
        <div className="tr-kb__row">{tecla("espaco", "", () => onTecla(" "), " tr-kb__k--space")}</div>
      </div>
    );
  },
);
