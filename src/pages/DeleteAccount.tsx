import React, { useState } from 'react';
import { IconTrash, IconCheck } from '../components/Icons';

const DeleteAccount: React.FC = () => {
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent('Kontolöschung / Account Deletion Request – PetConnect');
    const body = encodeURIComponent(
      `Hallo PetConnect-Team,\n\nIch bitte um die Löschung meines Kontos und aller damit verbundenen Daten.\n\nE-Mail-Adresse: ${email}\n\nBitte bestätigen Sie die Löschung.\n\nMit freundlichen Grüßen`
    );
    window.location.href = `mailto:support@petconnect24.com?subject=${subject}&body=${body}`;
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#121a17] text-white">
      <div className="bg-[#1a2520] border-b border-[#2a3830] px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <img src="/icons/icon-192.png" alt="PetConnect" className="w-8 h-8 rounded-lg" />
          <span className="text-xl font-bold text-[#4CAF82]">PetConnect</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-900/30 rounded-full mb-4">
            <IconTrash className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Konto löschen</h1>
          <p className="text-gray-400">Delete Account / Supprimer le compte</p>
        </div>

        {!submitted ? (
          <>
            <div className="bg-[#1a2520] border border-yellow-600/30 rounded-xl p-5 mb-8">
              <div className="flex gap-3">
                ⚠️ 
                <div>
                  <p className="font-semibold text-yellow-300 mb-2">Was wird gelöscht?</p>
                  <ul className="text-sm text-gray-300 space-y-1">
                    <li>✓ Ihr Benutzerkonto und Login-Daten</li>
                    <li>✓ Alle Tierprofile und Gesundheitsdaten</li>
                    <li>✓ Alle Medikamenten- und Impfeinträge</li>
                    <li>✓ Alle Termine und Erinnerungen</li>
                    <li>✓ Alle persönlichen Daten</li>
                  </ul>
                  <p className="text-sm text-gray-400 mt-3">
                    Die Löschung erfolgt innerhalb von <strong className="text-white">30 Tagen</strong> nach Ihrer Anfrage.
                    Aus gesetzlichen Gründen können einige Daten bis zu 90 Tage in Backups verbleiben.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-[#1a2520] rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                ✉️ 
                Löschanfrage senden
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    E-Mail-Adresse Ihres Kontos *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ihre@email.de"
                    className="w-full bg-[#121a17] border border-[#2a3830] rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-[#4CAF82]"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-red-700 hover:bg-red-600 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <IconTrash className="w-4 h-4" />
                  Konto unwiderruflich löschen
                </button>
                <p className="text-xs text-gray-500 text-center">
                  Sie werden zu Ihrer E-Mail-App weitergeleitet, um die Anfrage abzusenden.
                </p>
              </form>
            </div>

            <div className="mt-6 text-center text-sm text-gray-500">
              <p>Alternativ können Sie uns direkt schreiben:</p>
              <a href="mailto:support@petconnect24.com" className="text-[#4CAF82] hover:underline">
                support@petconnect24.com
              </a>
            </div>
          </>
        ) : (
          <div className="text-center bg-[#1a2520] rounded-xl p-10">
            <IconCheck className="w-16 h-16 text-[#4CAF82] mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Anfrage gesendet</h2>
            <p className="text-gray-400 mb-4">
              Ihre Löschanfrage wurde vorbereitet. Bitte senden Sie die E-Mail ab.
            </p>
            <p className="text-sm text-gray-500">
              Wir bearbeiten Ihre Anfrage innerhalb von 30 Tagen.
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-[#2a3830] mt-16 py-6 text-center text-sm text-gray-600">
        <p>PetConnect · Ahmed Rajouani · <a href="/legal" className="hover:text-gray-400">Datenschutz & Impressum</a></p>
      </div>
    </div>
  );
};

export default DeleteAccount;
