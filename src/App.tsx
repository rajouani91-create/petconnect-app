import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { APP_BASE } from './lib/appUrl';
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
import { Pets } from './pages/Pets';
import { Pet } from './pages/Pet';
import { PetNew } from './pages/PetNew';
import { More } from './pages/More';
import { Appointments } from './pages/Appointments';
import { BookAppointment } from './pages/BookAppointment';
import { Emergency } from './pages/Emergency';
import { Invite } from './pages/Invite';
import { Reminders } from './pages/Reminders';
import { EmergencyCard } from './pages/more/EmergencyCard';
import { Insurance } from './pages/more/Insurance';
import { Sitting } from './pages/more/Sitting';
import { HealthRecord } from './pages/more/HealthRecord';
import { History } from './pages/more/History';
import { VaccCertificate } from './pages/more/VaccCertificate';
import { SitterPublic } from './pages/SitterPublic';
import { Practices } from './pages/Practices';
import { Notifications } from './pages/more/Notifications';
import { MonthlyReport } from './pages/more/MonthlyReport';
import { Assistant } from './pages/more/Assistant';
import { Family } from './pages/more/Family';
import { Inquiries } from './pages/more/Inquiries';
import { Account } from './pages/more/Account';
import { Imprint, Privacy } from './pages/Legal';
import DeleteAccount from './pages/DeleteAccount';
import { UpdateBanner } from './components/UpdateBanner';
import { Admin } from './pages/admin/Admin';
import { Agents } from './pages/admin/Agents';
import { PetPractices } from './pages/more/PetPractices';
import { PracticePatients } from './practice/PracticePatients';
import { PracticePatient } from './practice/PracticePatient';
import { PracticeCertificate } from './practice/PracticeCertificate';
import { PracticeIntake } from './practice/PracticeIntake';
import { PracticeSchedule } from './practice/PracticeSchedule';
import { PracticeAppointments } from './practice/PracticeAppointments';
import { PracticeRecall } from './practice/PracticeRecall';
import { PracticeInquiries } from './practice/PracticeInquiries';
import { PatientInvite } from './pages/PatientInvite';
import { PracticeAccess } from './practice/PracticeAccess';
import { OwnerOnly, PracticeOnly, PracticeProvider } from './practice/PracticeProvider';
import { PracticeShell } from './practice/PracticeShell';
import { PracticeProfile } from './practice/PracticeProfile';
import { PracticeHome } from './practice/PracticeToday';
import { PracticeCalendar } from './practice/PracticeCalendar';
import { PracticeTeam } from './practice/PracticeTeam';
import { PracticeSetup } from './practice/PracticeSetup';
import { PracticeInvite } from './practice/PracticeInvite';

export function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <PracticeProvider>
        <BrowserRouter basename={APP_BASE}>
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
            {/* Praxissicht (Etappe P1): Einladung annehmen (eigene Sitzungsprüfung), Einrichtung, Profil und Team */}
            <Route path="/praxis/einladung" element={<PracticeInvite />} />
            <Route path="/praxis/einrichten" element={<RequireAuth><PracticeSetup /></RequireAuth>} />
            <Route path="/praxis" element={<RequireAuth><PracticeOnly><PracticeShell /></PracticeOnly></RequireAuth>}>
              <Route index element={<PracticeHome />} />
              <Route path="/praxis/profil" element={<PracticeProfile />} />
              <Route path="/praxis/kalender" element={<PracticeCalendar />} />
              <Route path="/praxis/team" element={<PracticeTeam />} />
              <Route path="/praxis/termine" element={<PracticeAppointments />} />
              <Route path="/praxis/termine/einstellungen" element={<PracticeSchedule />} />
              <Route path="/praxis/benachrichtigungen" element={<Notifications practice />} />
              <Route path="/praxis/erinnerungen" element={<PracticeRecall />} />
              <Route path="/praxis/anfragen" element={<PracticeInquiries />} />
              <Route path="/praxis/patienten" element={<PracticePatients />} />
              <Route path="/praxis/patienten/zugriff" element={<PracticeAccess />} />
              <Route path="/praxis/patienten/aufnehmen" element={<PracticeIntake />} />
              <Route path="/praxis/patienten/:petId" element={<PracticePatient />} />
              <Route path="/praxis/patienten/:petId/impfnachweis" element={<PracticeCertificate />} />
            </Route>
            <Route
              element={
                <RequireAuth>
                  <OwnerOnly>
                  <PetsProvider>
                    <DosesProvider>
                      <AppShell />
                    </DosesProvider>
                  </PetsProvider>
                  </OwnerOnly>
                </RequireAuth>
              }
            >
              <Route index element={<Today />} />
              <Route path="termine" element={<Appointments />} />
              <Route path="termine/buchen" element={<BookAppointment />} />
              <Route path="tiere" element={<Pets />} />
              <Route path="tier" element={<Pet />} />
              <Route path="tier/neu" element={<PetNew />} />
              <Route path="tier/:petId/notfallkarte" element={<EmergencyCard />} />
              <Route path="tier/:petId/versicherung" element={<Insurance />} />
              <Route path="tier/:petId/betreuung" element={<Sitting />} />
              <Route path="tier/:petId/gesundheitsakte" element={<HealthRecord />} />
              <Route path="tier/:petId/vorgeschichte" element={<History />} />
              <Route path="tier/:petId/impfnachweis" element={<VaccCertificate />} />
              <Route path="tier/:petId/praxen" element={<PetPractices />} />
              <Route path="praxen" element={<Practices />} />
              <Route path="praxiseinladung" element={<PatientInvite />} />
              <Route path="erinnerungen" element={<Reminders />} />
              <Route path="alltag" element={<Routine />} />
              <Route path="mehr" element={<More />} />
              <Route path="mehr/benachrichtigungen" element={<Notifications />} />
              <Route path="mehr/monatsuebersicht" element={<MonthlyReport />} />
              <Route path="mehr/assistent" element={<Assistant />} />
              <Route path="mehr/familie" element={<Family />} />
              <Route path="mehr/anfragen" element={<Inquiries />} />
              <Route path="mehr/konto" element={<Account />} />
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
        </PracticeProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
