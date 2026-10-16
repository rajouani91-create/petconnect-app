import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthProvider';
import { Loading } from '../components/Loading';
import { inviteLink, readPendingInvite, savePendingInvite, tokenFromPath } from '../lib/sharing';

/** Pfad zur gemerkten Einladung (vor der Anmeldung geöffnet), sonst null. */
function pendingInvitePath(): string | null {
  const token = readPendingInvite();
  return token ? inviteLink('', token) : null;
}

/** Ohne Sitzung geht es zur Anmeldung; nach dem Login zurück zur ursprünglichen Seite. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, session, lastEvent } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  // Nach bewusstem Abmelden keine Rücksprung-Seite merken: Das nächste Konto (z. B. Partnerin am selben Gerät)
  // soll nicht auf der zuletzt besuchten Seite des vorherigen Kontos landen.
  if (!session) {
    // Einladungslink ohne Anmeldung: Code merken, damit er auch Registrierung und E-Mail-Bestätigung übersteht.
    const token = tokenFromPath(location.pathname);
    if (token) {
      savePendingInvite(token);
      return <Navigate to="/login" replace />;
    }
    return <Navigate to="/login" replace state={lastEvent === 'SIGNED_OUT' ? null : { from: location.pathname }} />;
  }
  // Angemeldet und eine Einladung wartet: dorthin (die Einladungsseite löscht den Eintrag).
  const invite = pendingInvitePath();
  if (invite && location.pathname !== invite) return <Navigate to={invite} replace />;
  return <>{children}</>;
}

/** Für Anmelde-Seiten: Mit Sitzung direkt in die App. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { ready, session } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (session) {
    const invite = pendingInvitePath();
    if (invite) return <Navigate to={invite} replace />;
    const from = (location.state as { from?: unknown } | null)?.from;
    return <Navigate to={typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/'} replace />;
  }
  return <>{children}</>;
}
