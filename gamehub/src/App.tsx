import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AppShell } from '@/components/layout/AppShell';
import { Toaster } from '@/components/ui/Toaster';
import { CookieConsent } from '@/components/common/CookieConsent';
import { PageLoader } from '@/components/common/PageLoader';
import { useApp } from '@/store/AppContext';

// Route-level code splitting (bundle-splitting / lazy-loading rules).
const Login = lazy(() => import('@/pages/Login'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Profile = lazy(() => import('@/pages/Profile'));
const Chat = lazy(() => import('@/pages/Chat'));
const Clips = lazy(() => import('@/pages/Clips'));
const Friends = lazy(() => import('@/pages/Friends'));
const Events = lazy(() => import('@/pages/Events'));
const Tournaments = lazy(() => import('@/pages/Tournaments'));
const Settings = lazy(() => import('@/pages/Settings'));
const Legal = lazy(() => import('@/pages/Legal'));
const NotFound = lazy(() => import('@/pages/NotFound'));

function RequireAuth({ children }: { children: JSX.Element }) {
  const { currentUser } = useApp();
  const location = useLocation();
  if (!currentUser) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

export default function App() {
  const location = useLocation();
  const { currentUser } = useApp();

  return (
    <>
      <Suspense fallback={<PageLoader />}>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route
              path="/login"
              element={currentUser ? <Navigate to="/" replace /> : <Login />}
            />
            <Route path="/legal/:doc" element={<Legal />} />
            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/:userId" element={<Profile />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/chat/:channelId" element={<Chat />} />
              <Route path="/clips" element={<Clips />} />
              <Route path="/friends" element={<Friends />} />
              <Route path="/events" element={<Events />} />
              <Route path="/tournaments" element={<Tournaments />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AnimatePresence>
      </Suspense>
      <Toaster />
      <CookieConsent />
    </>
  );
}
