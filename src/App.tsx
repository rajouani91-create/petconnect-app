import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { I18nProvider } from './i18n/I18nProvider';
import { AuthProvider } from './auth/AuthProvider';
import { RedirectIfAuthed, RequireAuth } from './auth/RequireAuth';
import { PetsProvider } from './pets/PetsProvider';
import { DosesProvider } from './components/schedule/DosesProvider';
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
import { Reminders } from './pages/Reminders';
import { EmergencyCard } from './pages/more/EmergencyCard';
import { Insurance } from './pages/more/Insurance';
import { Sitting } from './pages/more/Sitting';
import { HealthRecord } from './pages/more/HealthRecord';
import { History } from './pages/more/History';
import { SitterPublic } from './pages/SitterPublic';
import { Practices } from './pages/Practices';
import { Notifications } from './pages/more/Notifications';
import { MonthlyReport } from './pages/more/MonthlyReport';
import { Assistant } from './pages/more/Assistant';
import { Imprint, Privacy } from './pages/Legal';
import DeleteAccount from './pages/DeleteAccount';
import { UpdateBanner } from './components/UpdateBanner';
import { Admin } from './pages/admin/Admin';
import { Agents } from './pages/admin/Agents';

export function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
            <Route path="/registrieren" element={<RedirectIfAuthed><Register /></RedirectIfAuthed>} />
            <Route path="/passwort-neu" element={<ResetPassword />} />
            {/* Öffentlich, ohne Anmeldung: Betreuungsinfos über einen Sitter-Link */}
            <Route path="/betreuung/:token" element={<SitterPublic />} />
            {/* Öffentlich: Pflichtangaben (Play Store) */}
            <Route path="/datenschutz" element={<Privacy />} />
            <Route path="/impressum" element={<Imprint />} />
            <Route path="/konto-loeschen" element={<DeleteAccount />} />
            <Route
              element={
                <RequireAuth>
                  <PetsProvider>
                    <DosesProvider>
                      <AppShell />
                    </DosesProvider>
                  </PetsProvider>
                </RequireAuth>
              }
            >
              <Route index element={<Today />} />
              <Route path="termine" element={<Appointments />} />
              <Route path="tier" element={<Pet />} />
              <Route path="tier/neu" element={<PetNew />} />
              <Route path="tier/:petId/notfallkarte" element={<EmergencyCard />} />
              <Route path="tier/:petId/versicherung" element={<Insurance />} />
              <Route path="tier/:petId/betreuung" element={<Sitting />} />
              <Route path="tier/:petId/gesundheitsakte" element={<HealthRecord />} />
              <Route path="tier/:petId/vorgeschichte" element={<History />} />
              <Route path="praxen" element={<Practices />} />
              <Route path="erinnerungen" element={<Reminders />} />
              <Route path="alltag" element={<Routine />} />
              <Route path="mehr" element={<More />} />
              <Route path="mehr/benachrichtigungen" element={<Notifications />} />
              <Route path="mehr/monatsuebersicht" element={<MonthlyReport />} />
              <Route path="mehr/assistent" element={<Assistant />} />
              <Route path="admin" element={<Admin />} />
              <Route path="admin/agenten" element={<Agents />} />
              <Route path="admin/agenten/:agentId" element={<Agents />} />
              <Route path="notfall" element={<Emergency />} />
              <Route path="einladung/:token" element={<Invite />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <UpdateBanner />
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}
