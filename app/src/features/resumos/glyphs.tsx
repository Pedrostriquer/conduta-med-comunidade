/* Ícones do editor, no mesmo traço do ds/Icon (grade de 24px, 1,75, pontas arredondadas). */
import { cx } from "../../lib/cx";

const P: Record<string, string[]> = {
  bold: ["M7.5 5h5.25a3.5 3.5 0 0 1 0 7H7.5z", "M7.5 12h6.25a3.5 3.5 0 0 1 0 7H7.5z"],
  italic: ["M10.5 5h7", "M6.5 19h7", "M14.25 5l-4 14"],
  underline: ["M7 4.5V11a5 5 0 0 0 10 0V4.5", "M5.5 20h13"],
  code: ["M8.5 8L4.5 12l4 4", "M15.5 8l4 4-4 4", "M13.25 6l-2.5 12"],
  "code-block": ["M5 4.5h14A1.5 1.5 0 0 1 20.5 6v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5z", "M9.5 9.5L7 12l2.5 2.5", "M14.5 9.5L17 12l-2.5 2.5"],
  list: ["M9.5 6.5h10.5", "M9.5 12h10.5", "M9.5 17.5h10.5", "M4.75 6.5h.01", "M4.75 12h.01", "M4.75 17.5h.01"],
  "list-ordered": ["M10.5 6.5H20", "M10.5 12H20", "M10.5 17.5H20", "M4.5 5l1.25-.75V9", "M4.25 14.25c.35-.8 2.75-.9 2.5.7-.15.95-2.5 1.75-2.5 3.05h2.75"],
  "list-task": ["M4 6.75l1.5 1.5 3-3", "M4 16.25l1.5 1.5 3-3", "M12 7h8.5", "M12 16.5h8.5"],
  quote: ["M5 5.5v13", "M9.5 8h10.5", "M9.5 12h10.5", "M9.5 16h6.5"],
  divider: ["M4 12h16", "M8.5 6.5h7", "M8.5 17.5h7"],
  "align-left": ["M4 6h16", "M4 10.5h10", "M4 15h16", "M4 19.5h10"],
  "align-center": ["M4 6h16", "M7 10.5h10", "M4 15h16", "M7 19.5h10"],
  "align-right": ["M4 6h16", "M10 10.5h10", "M4 15h16", "M10 19.5h10"],
  "align-justify": ["M4 6h16", "M4 10.5h16", "M4 15h16", "M4 19.5h16"],
  table: ["M5 4.5h14A1.5 1.5 0 0 1 20.5 6v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5z", "M3.5 9.5h17", "M3.5 14.5h17", "M9.5 9.5v10"],
  details: ["M4.5 6.5l3 3 3-3", "M13.5 8h7", "M8 14h12.5", "M8 18.5h12.5"],
  color: ["M7 15.5l5-11 5 11", "M8.8 12h6.4", "M5 20h14"],
  highlight: ["M14.5 4.5l5 5-8.5 8.5H6.5v-4.5z", "M4 20.5h16"],
  bulb: ["M9.5 17.5h5", "M10.25 20.5h3.5", "M12 3.5a6 6 0 0 0-3.5 10.9c.6.45 1 1.15 1 1.9v1.2h5v-1.2c0-.75.4-1.45 1-1.9A6 6 0 0 0 12 3.5z"],
  callout: ["M5 4.5h14A1.5 1.5 0 0 1 20.5 6v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5z", "M7.5 9h.01", "M11 9h6", "M7.5 14h9"],
  text: ["M5 6.5h14", "M12 6.5v12", "M9.5 18.5h5"],
  download: ["M12 4.5V15", "M7.5 10.5L12 15l4.5-4.5", "M5 19.5h14"],
  print: ["M7 8.5v-4h10v4", "M7 16.5H5.5A1.5 1.5 0 0 1 4 15v-5a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 10v5a1.5 1.5 0 0 1-1.5 1.5H17", "M7 14h10v6H7z"],
  smile: ["M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z", "M8.5 14c.8 1.2 2 1.8 3.5 1.8s2.7-.6 3.5-1.8", "M9 9.75h.01", "M15 9.75h.01"],
  "doc-plus": ["M7 3.5h7l4.5 4.5V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z", "M14 3.5V8h4.5", "M12 11v6", "M9 14h6"],
  "folder-plus": ["M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z", "M12 10.5v6", "M9 13.5h6"],
  move: ["M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z", "M8 13.5h7.5", "M13 11l2.5 2.5L13 16"],
  rows: ["M3.5 8h17", "M3.5 16h17", "M5 3.5h14A1.5 1.5 0 0 1 20.5 5v14a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z"],
};

export function Glyph({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg className={cx("cd-icon", className)} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {(P[name] || P.text).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
