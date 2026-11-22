import type * as React from 'react';

/** Marca: o símbolo da bifurcação, com ou sem a palavra. */
export interface LogoProps { size?: number; wordmark?: boolean; mono?: boolean }
export declare function Logo(props: LogoProps): React.ReactElement;
export interface MarkProps { size?: number; mono?: boolean; label?: string }
export declare function Mark(props: MarkProps): React.ReactElement;

export type IconName = 'check' | 'x' | 'chevron-right' | 'chevron-left' | 'chevron-down' | 'external' | 'clock' | 'calendar' | 'flag' | 'today' | 'questions' | 'exam' | 'cards' | 'chart' | 'search' | 'filter' | 'upload' | 'undo' | 'strike' | 'text-size' | 'video' | 'info' | 'alert' | 'void' | 'swap' | 'message' | 'tip' | 'plus' | 'file' | 'image' | 'hourglass' | 'pulse' | 'stethoscope' | 'scalpel' | 'pacifier' | 'uterus' | 'shield' | 'play' | 'more';
/** Ícone de 24px, traço 1,75, em currentColor. `label` quando estiver sozinho. */
export interface IconProps { name: IconName; size?: number; strokeWidth?: number; label?: string; filled?: boolean; className?: string }
export declare function Icon(props: IconProps): React.ReactElement;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'tinted' | 'gray' | 'plain' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName; iconEnd?: IconName; kbd?: string; loading?: boolean; block?: boolean;
  /** Vira um link que abre em nova aba. */
  href?: string;
  /** Rótulo acessível, obrigatório em botão só com ícone. */
  label?: string;
}
export declare const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>>;

export interface SegmentedOption { value: string | number; label: React.ReactNode; icon?: IconName; ariaLabel?: string }
export interface SegmentedControlProps { options: SegmentedOption[]; value: string | number; onChange(value: string | number): void; size?: 'sm' | 'md'; block?: boolean; 'aria-label': string }
export declare function SegmentedControl(props: SegmentedControlProps): React.ReactElement;

export interface ChipProps { pressed?: boolean; onChange?(pressed: boolean): void; count?: number; icon?: IconName; children: React.ReactNode }
export declare function Chip(props: ChipProps): React.ReactElement;

export type BadgeKind = 'anulada' | 'alterada' | 'diverge' | 'polemica' | 'preliminar' | 'desatualizada' | 'recurso' | 'revisao';
export interface BadgeProps { kind?: BadgeKind; tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warning'; icon?: IconName; title?: string; children?: React.ReactNode }
export declare function Badge(props: BadgeProps): React.ReactElement;

export interface AlternativeProps {
  letter: 'A' | 'B' | 'C' | 'D' | 'E'; children: React.ReactNode;
  checked?: boolean; struck?: boolean;
  /** Depois de responder. */
  result?: 'correct' | 'wrong' | 'other' | 'void'; tag?: string;
  onSelect?(letter: string): void; onStrike?(letter: string): void; disabled?: boolean; tabIndex?: number;
}
export declare function Alternative(props: AlternativeProps): React.ReactElement;

export interface VideoMoment { /** segundos desde o início do vídeo */ t: number; text: string }
export interface VideoCorrectionProps { url: string; start: number; end: number; channel: string; title?: string; moments?: VideoMoment[]; warning?: string }
export declare function VideoCorrection(props: VideoCorrectionProps): React.ReactElement;

export interface Question {
  exam: string; number: number; path: string[]; badges?: BadgeKind[];
  stem: string; image?: string; imageAlt?: string;
  alternatives: Record<string, string>; answer: string; answerNote?: string; status?: 'anulada';
  explanation?: string; explanationNote?: string; video?: VideoCorrectionProps;
}
export interface QuestionCardProps { question: Question; onAnswer?(letter: string | null, correct: boolean): void; onNext?(): void; nextLabel?: string; initialChoice?: string; initialAnswered?: boolean }
export declare function QuestionCard(props: QuestionCardProps): React.ReactElement;

export interface FlashcardData {
  type: 'cloze' | 'qa'; deck: string;
  /** cloze: texto antes e depois da lacuna; `choices` vira lacuna de escolha. */
  before?: string; after?: string; choices?: string[];
  /** qa: a pergunta. */
  front?: string;
  answer: string; extra?: string; ref?: string;
}
export interface FlashcardProps { cards: FlashcardData[]; intervals?: { again: string; hard: string; good: string; easy: string }; title?: string }
export declare function Flashcard(props: FlashcardProps): React.ReactElement;

export interface AnkiDeckSummary { file: { name: string; size: string }; cards: number; images: number; subdecks: number; areas: { name: string; count: number; subdecks: number }[]; note?: string }
export interface AnkiImportProps { deck: AnkiDeckSummary; onDone?(): void; initialStep?: 'idle' | 'review'; demo?: boolean }
export declare function AnkiImport(props: AnkiImportProps): React.ReactElement;

export interface ExamNavigatorProps { title: string; total: number; areas: { name: string; from: number; to: number }[]; answered: number[]; marked?: number[]; current: number; remaining: number; onJump?(n: number): void }
export declare function ExamNavigator(props: ExamNavigatorProps): React.ReactElement;

export interface DialogProps { open: boolean; title: string; children?: React.ReactNode; confirmLabel: string; cancelLabel?: string; destructive?: boolean; onConfirm(): void; onClose(): void }
export declare function Dialog(props: DialogProps): React.ReactElement | null;

export interface StudyDay { wd: string; n: number; label: string; today?: boolean; exam?: boolean; done?: number; total?: number }
export interface StudyTask { id: string | number; kind: 'questoes' | 'flashcards' | 'prova' | 'erros'; title: string; meta: string; done?: boolean; action?: string }
export interface StudyPlanProps { exam: string; daysLeft: number; dateLabel: string; planDone: number; week: StudyDay[]; tasks: StudyTask[]; onStart?(): void }
export declare function StudyPlan(props: StudyPlanProps): React.ReactElement;

export interface ProgressRingProps { value: number; size?: number; stroke?: number; text?: string; caption?: string; tone?: 'success'; label?: string; children?: false }
export declare function ProgressRing(props: ProgressRingProps): React.ReactElement;
export interface MeterProps { label: string; value: number; max: number; valueLabel?: string; tone?: 'success' | 'warning' }
export declare function Meter(props: MeterProps): React.ReactElement;
export interface BarListProps { summary?: string; rows: { name: string; value: number; n?: number; icon?: IconName }[]; goal?: number }
export declare function BarList(props: BarListProps): React.ReactElement;

export interface NavItem { id: string; label: string; icon: IconName; count?: number; /** "dot" (novidade), texto curto ("NOVO") ou número (pede ação) */ badge?: 'dot' | string | number }
/** Dock de vidro líquido: a lente leva a seleção; toque ou arraste. */
export interface TabBarProps { items?: NavItem[]; current: string; onChange?(id: string): void; /** dock compacta (só ícones) ao rolar para baixo */ minimized?: boolean; static?: boolean }
export declare function TabBar(props: TabBarProps): React.ReactElement;
export interface SidebarProps { items?: NavItem[]; groups?: { label: string; ids: string[] }[]; current: string; onChange?(id: string): void }
export declare function Sidebar(props: SidebarProps): React.ReactElement;

/** Traçado de ECG correndo, para esperas sem fim conhecido. */
export interface PulseProps { size?: number; tone?: 'success'; label?: string }
export declare function Pulse(props: PulseProps): React.ReactElement;
export interface VitalMetric { label: string; value: number; unit?: string; goal?: number; trend: number[]; note?: string; alarm?: string; display?: string; higherIsBetter?: boolean }
/** Painel de desempenho no desenho de um monitor multiparamétrico. */
export interface VitalsProps { metrics: VitalMetric[]; title?: string }
export declare function Vitals(props: VitalsProps): React.ReactElement;

export interface ToastProps { children: React.ReactNode; icon?: IconName; action?: string; onAction?(): void; kbd?: string; closing?: boolean; style?: React.CSSProperties }
export declare function Toast(props: ToastProps): React.ReactElement;

export declare function Kbd(props: { children: React.ReactNode }): React.ReactElement;

declare global {
  interface Window {
    Conduta: {
      Logo: typeof Logo; Mark: typeof Mark; Icon: typeof Icon; Button: typeof Button; SegmentedControl: typeof SegmentedControl; Chip: typeof Chip; Badge: typeof Badge;
      Alternative: typeof Alternative; QuestionCard: typeof QuestionCard; VideoCorrection: typeof VideoCorrection; Flashcard: typeof Flashcard; AnkiImport: typeof AnkiImport;
      ExamNavigator: typeof ExamNavigator; Dialog: typeof Dialog; StudyPlan: typeof StudyPlan; ProgressRing: typeof ProgressRing; Meter: typeof Meter; BarList: typeof BarList;
      TabBar: typeof TabBar; Sidebar: typeof Sidebar; Pulse: typeof Pulse; Vitals: typeof Vitals; Toast: typeof Toast; Kbd: typeof Kbd;
      AREA_ICON: Record<string, IconName>;
      nav: NavItem[]; format: { hms(seconds: number): string; number(n: number): string };
    }
  }
}
