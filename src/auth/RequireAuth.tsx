import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Loading } from '../components/Loading';

/** Ohne Sitzung geht es zur Anmeldung; nach dem Login zurück zur ursprünglichen Seite. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, session } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Für Anmelde-Seiten: Mit Sitzung direkt in die App. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { ready, session } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (session) {
    const from = (location.state as { from?: unknown } | null)?.from;
    return <Navigate to={typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/'} replace />;
  }
  return <>{children}</>;
}
