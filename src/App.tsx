import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { I18nProvider } from './i18n/I18nProvider';
import { AuthProvider } from './auth/AuthProvider';
import { RedirectIfAuthed, RequireAuth } from './auth/RequireAuth';
import { PetsProvider } from './pets/PetsProvider';
import { AppShell } from './components/AppShell';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ResetPassword } from './pages/ResetPassword';
import { Today } from './pages/Today';
import { Routine } from './pages/Routine';
import { Pet } from './pages/Pet';
import { PetNew } from './pages/PetNew';
import { More } from './pages/More';
import { Appointments } from './pages/Appointments';
import { Emergency } from './pages/Emergency';
import { Invite } from './pages/Invite';

export function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
            <Route path="/registrieren" element={<RedirectIfAuthed><Register /></RedirectIfAuthed>} />
            <Route path="/passwort-neu" element={<ResetPassword />} />
            <Route
              element={
                <RequireAuth>
                  <PetsProvider>
                    <AppShell />
                  </PetsProvider>
                </RequireAuth>
              }
            >
              <Route index element={<Today />} />
              <Route path="termine" element={<Appointments />} />
              <Route path="tier" element={<Pet />} />
              <Route path="tier/neu" element={<PetNew />} />
              <Route path="alltag" element={<Routine />} />
              <Route path="mehr" element={<More />} />
              <Route path="notfall" element={<Emergency />} />
              <Route path="einladung/:token" element={<Invite />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}
