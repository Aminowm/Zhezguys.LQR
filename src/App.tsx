import type { ReactElement } from "react";
import { useEffect, lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "./state/app";
import { useLang } from "./i18n";
import Nav from "./components/Nav";
import Landing from "./pages/Landing";
import { LoginPage, RegisterPage } from "./pages/Auth";

const TablePage = lazy(() => import("./pages/TablePage"));
const CodePage = lazy(() => import("./pages/CodePage"));
const RobotPage = lazy(() => import("./pages/RobotPage"));
const ComparePage = lazy(() => import("./pages/ComparePage"));
const TeamPage = lazy(() => import("./pages/TeamPage"));

function Private({ children }: { children: ReactElement }) {
  const session = useApp((s) => s.session);
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { ready, session, toast, init } = useApp();
  const lang = useLang((s) => s.lang);
  const loc = useLocation();
  useEffect(() => {
    init();
  }, [init]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  if (!ready) return <div className="auth-wrap muted">…</div>;
  return (
    <div className="app">
      <Nav />
      <Suspense fallback={<div className="page muted">…</div>}>
        <Routes location={loc}>
          <Route path="/" element={session ? <Navigate to="/table" replace /> : <Landing />} />
          <Route path="/about" element={<Landing />} />
          <Route path="/login" element={session ? <Navigate to="/table" replace /> : <LoginPage />} />
          <Route path="/register" element={session ? <Navigate to="/table" replace /> : <RegisterPage />} />
          <Route path="/setup" element={<Private><RobotPage setup /></Private>} />
          <Route path="/table" element={<Private><TablePage /></Private>} />
          <Route path="/code" element={<Private><CodePage /></Private>} />
          <Route path="/robot" element={<Private><RobotPage /></Private>} />
          <Route path="/team" element={<Private><TeamPage /></Private>} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <AnimatePresence>
        {toast && (
          <motion.div className="toast" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
