import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { loadBank, useBank, useBankError } from "../data/bank";
import { Button } from "../ds/basics";
import { ToastProvider, useToast } from "../ds/overlay";
import { Mark } from "../ds/Logo";
import { Pulse } from "../ds/medical";
import { VideoProvider } from "../features/video/VideoDock";
import { Shell } from "./Shell";
import { HojePage } from "../features/hoje/HojePage";
import { QuestoesPage } from "../features/questoes/QuestoesPage";
import { SimuladosPage } from "../features/simulados/SimuladosPage";
import { CronogramaPage } from "../features/cronograma/CronogramaPage";
import { PlanWizard } from "../features/cronograma/PlanWizard";
import { PerfilPage } from "../features/perfil/PerfilPage";
import { AjustesPage } from "../features/perfil/AjustesPage";
import { SessionPage } from "../features/sessao/SessionPage";
import { ResultPage } from "../features/sessao/ResultPage";
import { CorrecaoPage } from "../features/sessao/CorrecaoPage";
import { QuestaoPage } from "../features/sessao/QuestaoPage";
import { Welcome } from "../features/onboarding/Welcome";
import { FlashcardsPage } from "../features/flashcards/FlashcardsPage";
import { ReviewPage } from "../features/flashcards/ReviewPage";
import { DeckPage } from "../features/flashcards/DeckPage";
import { DeckOptionsPage } from "../features/flashcards/DeckOptionsPage";
import { BrowserPage } from "../features/flashcards/BrowserPage";
import { StatsPage } from "../features/flashcards/StatsPage";
import { AddCardPage } from "../features/flashcards/AddCardPage";
import { SearchPage } from "../features/busca/SearchPage";
import { SavedPage } from "../features/questoes/SavedPage";
import { ResultadosPage } from "../features/simulados/ResultadosPage";
import { MetasPage } from "../features/cronograma/MetasPage";
import { SharedPage } from "../features/flashcards/SharedPage";
import { AiPage } from "../features/flashcards/AiPage";
import { DesempenhoPage } from "../features/perfil/DesempenhoPage";
import { LoginPage } from "../features/auth/LoginPage";
import { SignupPage } from "../features/auth/SignupPage";
import { TermosPage } from "../features/auth/TermosPage";
import { useAuth } from "../state/auth";
import { clearNotice, useSyncNotices } from "../sync/engine";
import { useAuthGate } from "../features/auth/gate";
import { PluginPage, PluginActivityPage } from "../features/plugin/PluginPage";
import { ConectarPage } from "../features/plugin/ConectarPage";
import { PassoIaPage } from "../features/plugin/PassoIaPage";
import { PessoasPage, SeguindoPage, SolicitacoesPage } from "../features/pessoas/PessoasPage";
import { ProfilePage } from "../features/pessoas/ProfilePage";
import { EditarPerfilPage } from "../features/perfil/EditarPerfilPage";
import { SuportePage } from "../features/suporte/SuportePage";
import { AnalisesPage } from "../features/analises/AnalisesPage";
import { AnaliseView } from "../features/analises/AnaliseView";
import { ChatPage } from "../features/chat/ChatPage";
import { useTelemetry } from "../lib/telemetry";
import { AssuntosPage } from "../features/assuntos/AssuntosPage";
import { AssuntoPage } from "../features/assuntos/AssuntoPage";

// o editor de resumos é pesado: só carrega quando a pessoa abre
const ResumosPage = lazy(() => import("../features/resumos/ResumosPage").then((m) => ({ default: m.ResumosPage })));
const LixeiraPage = lazy(() => import("../features/resumos/ResumosPage").then((m) => ({ default: m.LixeiraPage })));
// treino de digitar: o 3D e o ECG só carregam na própria tela
const TreinoPage = lazy(() => import("../features/treino/TreinoPage").then((m) => ({ default: m.TreinoPage })));
const TreinoJogo = lazy(() => import("../features/treino/JogoPage").then((m) => ({ default: m.JogoPage })));
const TreinoExplorar = lazy(() => import("../features/treino/ExplorarPage").then((m) => ({ default: m.ExplorarPage })));
const SharedDocPage = lazy(() => import("../features/resumos/SharedDocPage").then((m) => ({ default: m.SharedDocPage })));

function Splash({ label = "Carregando" }: { label?: string }) {
  return (
    <div className="splash cd-root">
      <Mark size={48} />
      <Pulse size={88} label={label} />
    </div>
  );
}

/** as rotas que usam o banco de questões esperam por ele aqui, sem quebrar */
function NeedBank() {
  const bank = useBank(), err = useBankError();
  if (bank) return <Outlet />;
  if (!err) return <Splash label="Carregando as questões" />;
  return (
    <div className="splash cd-root">
      <Mark size={48} />
      <p className="splash__err">{err}</p>
      <Button variant="gray" onClick={() => loadBank()}>Tentar de novo</Button>
    </div>
  );
}

/** o banco é baixado só depois de entrar: em produção ele pede login */
function BankLoader() {
  const signedIn = useAuth((s) => !!s.user);
  useEffect(() => { if (signedIn) void loadBank(); }, [signedIn]);
  return null;
}

/** "Sua IA criou o baralho X": aviso discreto, com link */
function SyncNotices() {
  const items = useSyncNotices((s) => s.items);
  const toast = useToast(), nav = useNavigate();
  useEffect(() => {
    for (const n of items) {
      clearNotice(n.id);
      toast({ icon: "sparkle", text: n.text, duration: 9000, ...(n.to ? { action: "Abrir", onAction: () => nav(n.to!) } : {}) });
    }
  }, [items, toast, nav]);
  return null;
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { scrollTo(0, 0); }, [pathname]);
  return null;
}

function Routed() {
  const loc = useLocation();
  useTelemetry(loc.pathname);
  const gate = useAuthGate(loc.pathname, loc.search);
  if (gate.wait) return <Splash />;
  if (gate.to) return <Navigate to={gate.to} replace />;
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route element={<NeedBank />}>
          <Route index element={<HojePage />} />
          <Route path="questoes" element={<QuestoesPage />} />
          <Route path="simulados" element={<SimuladosPage />} />
          <Route path="cronograma" element={<CronogramaPage />} />
          <Route path="perfil" element={<PerfilPage />} />
          <Route path="perfil/ajustes" element={<AjustesPage />} />
          <Route path="perfil/desempenho" element={<DesempenhoPage />} />
          <Route path="simulados/resultados" element={<ResultadosPage />} />
          <Route path="resultado/:id" element={<ResultPage />} />
          <Route path="cronograma/metas" element={<MetasPage />} />
          <Route path="flashcards/compartilhados" element={<SharedPage />} />
          <Route path="flashcards/ia" element={<AiPage />} />
          <Route path="questoes/salvas" element={<SavedPage />} />
          <Route path="busca" element={<SearchPage />} />
          <Route path="flashcards" element={<FlashcardsPage />} />
          <Route path="flashcards/baralho/:deck" element={<DeckPage />} />
          <Route path="flashcards/opcoes/:deck" element={<DeckOptionsPage />} />
          <Route path="flashcards/navegar" element={<BrowserPage />} />
          <Route path="flashcards/estatisticas" element={<StatsPage />} />
          <Route path="flashcards/novo" element={<AddCardPage />} />
          <Route path="resumos" element={<Suspense fallback={null}><ResumosPage /></Suspense>} />
          <Route path="resumos/lixeira" element={<Suspense fallback={null}><LixeiraPage /></Suspense>} />
          <Route path="resumos/:id" element={<Suspense fallback={null}><ResumosPage /></Suspense>} />
          <Route path="pessoas" element={<PessoasPage />} />
          <Route path="pessoas/seguindo" element={<SeguindoPage />} />
          <Route path="pessoas/solicitacoes" element={<SolicitacoesPage />} />
          <Route path="u/:handle" element={<ProfilePage />} />
          <Route path="u/:handle/resumos/:id" element={<Suspense fallback={null}><SharedDocPage /></Suspense>} />
          <Route path="perfil/editar" element={<EditarPerfilPage />} />
          <Route path="suporte" element={<SuportePage />} />
          <Route path="assuntos" element={<AssuntosPage />} />
          <Route path="assuntos/:slug" element={<AssuntoPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="chat/:id" element={<ChatPage />} />
          <Route path="analises" element={<AnalisesPage />} />
          <Route path="analises/:id" element={<AnaliseView />} />
        </Route>
        <Route path="plugin" element={<PluginPage />} />
        <Route path="plugin/codigo" element={<PluginPage />} />
        <Route path="plugin/atividade" element={<PluginActivityPage />} />
        <Route path="treino" element={<Suspense fallback={null}><TreinoPage /></Suspense>} />
      </Route>
      <Route path="criar-conta" element={<SignupPage />} />
      <Route path="conectar" element={<ConectarPage />} />
      <Route path="comecar/ia" element={<PassoIaPage />} />
      <Route path="entrar" element={<LoginPage />} />
      <Route path="termos" element={<TermosPage />} />
      <Route path="treino/explorar" element={<Suspense fallback={<Splash />}><TreinoExplorar /></Suspense>} />
      <Route path="treino/:id" element={<Suspense fallback={<Splash />}><TreinoJogo /></Suspense>} />
      <Route element={<NeedBank />}>
        <Route path="boas-vindas" element={<Welcome />} />
        <Route path="cronograma/novo" element={<PlanWizard />} />
        <Route path="sessao/:id" element={<SessionPage />} />
        <Route path="correcao/:id" element={<CorrecaoPage />} />
        <Route path="questao/:id" element={<QuestaoPage />} />
        <Route path="flashcards/revisar/:deck" element={<ReviewPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  useEffect(() => { void useAuth.getState().boot(); }, []);
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <VideoProvider>
            <ScrollTop />
            <BankLoader />
            <SyncNotices />
            <Routed />
          </VideoProvider>
        </BrowserRouter>
      </ToastProvider>
    </MotionConfig>
  );
}
