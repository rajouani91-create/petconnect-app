import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { vaccinationCertificate, type VaccinationCertificateData } from '../../lib/practiceRecord';
import { zonedNow } from '../../lib/time';
import { useNow } from '../../lib/useNow';
import type { PetRow } from '../../lib/supabase';
import { Loading } from '../../components/Loading';
import { BackToRecord, PetSubpage } from '../../components/more/shared';
import { VaccinationCertificate } from '../../components/record/VaccinationCertificate';

/** Digitaler Impfnachweis für Halter:innen: zum Vorzeigen oder Ausdrucken. */
export function VaccCertificate() {
  return <PetSubpage>{(pet) => <View key={pet.id} pet={pet} />}</PetSubpage>;
}

function View({ pet }: { pet: PetRow }) {
  const { t } = useI18n();
  const today = zonedNow(useNow()).date;
  const [data, setData] = useState<VaccinationCertificateData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    vaccinationCertificate(pet.id)
      .then((d) => { if (alive) setData(d); })
      .catch((e: unknown) => { console.error(e); if (alive) setError(true); });
    return () => { alive = false; };
  }, [pet.id]);

  return (
    <div className="page stack-lg">
      <BackToRecord />
      <header className="page-head no-print">
        <h1>{t('cfTitle')}</h1>
        <p className="muted">{t('cfSub', { n: pet.name })}</p>
      </header>
      {error && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
      {!data && !error && <Loading />}
      {data && <VaccinationCertificate data={data} today={today} />}
    </div>
  );
}
