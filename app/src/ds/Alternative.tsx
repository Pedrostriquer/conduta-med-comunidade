import type { ReactNode } from "react";
import { Icon } from "./Icon";

export type AltResult = "correct" | "wrong" | "other" | "void" | null;

/** Alternativa da questão (design system): marcar, riscar (clique direito ou botão), resultado com ✓/✕ */
export function Alternative({ letter, checked, struck, result, tag, tabIndex = 0, disabled, onSelect, onStrike, children }: {
  letter: string; checked?: boolean; struck?: boolean; result?: AltResult; tag?: string | null; tabIndex?: number; disabled?: boolean;
  onSelect?: (l: string) => void; onStrike?: (l: string) => void; children: ReactNode;
}) {
  const done = !!result, sym = result === "correct" ? "check" : result === "wrong" ? "x" : null;
  return (
    <div role="radio" aria-checked={!!checked && !done} aria-disabled={done || disabled || undefined} tabIndex={tabIndex}
      className="cd-alt" data-struck={struck && !done ? "" : undefined} data-result={result || undefined}
      onClick={() => { if (!done && !disabled) onSelect?.(letter); }}
      onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !done && onSelect) { e.preventDefault(); onSelect(letter); } }}
      onContextMenu={(e) => { if (!done && onStrike) { e.preventDefault(); onStrike(letter); } }}>
      <span className="cd-alt__letter">{sym ? <Icon name={sym} size={16} strokeWidth={2.5} /> : <span>{letter}</span>}</span>
      <span className="cd-alt__text">{children}</span>
      <span className="cd-alt__side">
        {tag ? <span className="cd-alt__tag">{tag}</span> : null}
        {!done && onStrike ? (
          <button type="button" className="cd-alt__strike" tabIndex={-1} aria-label={(struck ? "Desfazer risco da alternativa " : "Riscar alternativa ") + letter}
            title={struck ? "Desfazer risco" : "Riscar alternativa"} onClick={(e) => { e.stopPropagation(); onStrike(letter); }}>
            <Icon name={struck ? "undo" : "strike"} size={18} />
          </button>
        ) : null}
      </span>
    </div>
  );
}
