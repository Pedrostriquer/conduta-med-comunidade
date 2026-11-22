/* A marca: a bifurcação de uma conduta, com o caminho escolhido em destaque. */
export function Mark({ size = 32, mono, label = "Conduta Med" }: { size?: number; mono?: boolean; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={label} className="cd-mark">
      <rect width={64} height={64} rx={16} fill={mono ? "currentColor" : "var(--accent)"} />
      <g fill="none" stroke={mono ? "var(--surface)" : "var(--on-accent)"} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 25c0 6.5-11 7.5-11 13.5" opacity={0.4} />
        <path d="M32 12.5V25c0 6.5 11 7.5 11 13.5" />
      </g>
      <circle cx={43} cy={49.5} r={5.5} fill={mono ? "var(--surface)" : "var(--on-accent)"} />
    </svg>
  );
}
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="cd-logo" style={{ "--s": size + "px" } as React.CSSProperties}>
      <Mark size={size} label="" />
      <span className="cd-logo__word">conduta <span className="cd-logo__med">med</span></span>
    </span>
  );
}
