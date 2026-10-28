import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDate, localeOf, type MessageKey } from '../../i18n';
import {
  getHistory,
  listDocuments,
  listDosesRange,
  listMedications,
  listVaccinations,
  listWeights,
  saveHistory,
  type HistoryInput,
  type HistoryRow,
} from '../../lib/api';
import { buildTimeline, TIMELINE_KINDS, type TimelineEntry, type TimelineKind } from '../../lib/timeline';
import { zonedNow } from '../../lib/time';
import { useNow } from '../../lib/useNow';
import type { PetRow } from '../../lib/supabase';
import { Field } from '../../components/Field';
import { Loading } from '../../components/Loading';
import { PetSubpage, BackToRecord, Val } from '../../components/more/shared';
import { StatusLine, useStatus } from '../../components/record/shared';

const ORIGIN: [string, MessageKey][] = [
  ['breeder', 'hsOrigBreeder'],
  ['shelter', 'hsOrigShelter'],
  ['private', 'hsOrigPrivate'],
  ['found', 'hsOrigFound'],
  ['abroad', 'hsOrigAbroad'],
];
const YES_NO_UNKNOWN: [string, MessageKey][] = [
  ['yes', 'hsYes'],
  ['no', 'hsNo'],
  ['unknown', 'hsUnknown'],
];
const HOUSING: [string, MessageKey][] = [
  ['flat', 'hsHomeFlat'],
  ['outdoor_access', 'hsHomeOutdoor'],
  ['house_garden', 'hsHomeGarden'],
  ['outdoor_stable', 'hsHomeStable'],
];
const TEXT_FIELDS: [keyof HistoryInput, MessageKey][] = [
  ['past_illness', 'hsPastIll'],
  ['surgeries', 'hsSurg'],
  ['chronic', 'hsChronic'],
  ['allergies', 'hsAllergy'],
  ['past_medication', 'hsPastMed'],
  ['travel', 'hsTravel'],
  ['previous_practice', 'hsPrevPractice'],
  ['other', 'hsOther'],
];
const TEXT_MAX = 2000;
const KIND_LABEL: Record<TimelineKind, MessageKey> = {
  vaccination: 'hsKindVacc',
  document: 'hsKindDoc',
  medication: 'hsKindMed',
  weight: 'hsKindWeight',
};

/** Vorgeschichte (Halter:in) und Zeitleiste der Tierakte. Lesen für alle Tiermitglieder, Schreiben für Halter:in und Mithalter:in. */
export function History() {
  return <PetSubpage>{(pet, _role, editable) => <HistoryView key={pet.id} pet={pet} editable={editable} />}</PetSubpage>;
}

function HistoryView({ pet, editable }: { pet: PetRow; editable: boolean }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const [hist, setHist] = useState<HistoryRow | null | undefined>(undefined);
  const [draft, setDraft] = useState<HistoryInput>({});
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [filter, setFilter] = useState<TimelineKind | 'all'>('all');
  const [status, setStatus] = useStatus();
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const now = useNow();
  const todayIso = zonedNow(now).date;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [h, vacc, docs, doses, meds, weights] = await Promise.all([
          getHistory(pet.id),
          listVaccinations(pet.id),
          listDocuments(pet.id),
          listDosesRange(pet.id, '1900-01-01', '2999-12-31'),
          listMedications([pet.id]),
          listWeights(pet.id),
        ]);
        if (!alive) return;
        const names = new Map(meds.map((m) => [m.id, m.name]));
        setHist(h);
        setDraft(h ?? {});
        setTimeline(
          buildTimeline({
            vaccinations: vacc.map((v) => ({ id: v.id, name: v.name, given_on: v.given_on })),
            documents: docs.map((d) => ({ id: d.id, title: d.title, category: d.category, doc_date: d.doc_date })),
            doses: doses.map((d) => ({ id: d.id, medication_name: names.get(d.medication_id) ?? '', scheduled_on: d.scheduled_on })),
            weights: weights.map((w) => ({ id: w.id, kg: w.kg, measured_on: w.measured_on })),
          }, undefined, localeOf(lang)),
        );
      } catch {
        if (alive) setLoadFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [pet.id, lang]);

  function set<K extends keyof HistoryInput>(key: K, value: HistoryInput[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editable || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const saved = await saveHistory(pet.id, draft);
      setHist(saved);
      setStatus(t('hsSaved'), true);
    } catch {
      setStatus(t('hsSaveFail'), false);
    } finally {
      setBusy(false);
    }
  }

  if (loadFailed) return <p role="alert" className="muted">{t('hsSaveFail')}</p>;
  if (hist === undefined || timeline === null) return <Loading />;

  const shown = timeline.filter((e) => filter === 'all' || e.kind === filter);
  const label = (list: [string, MessageKey][], value: string | null | undefined) => {
    const hit = list.find(([v]) => v === value);
    return hit ? t(hit[1]) : null;
  };
  const sel = (id: string, text: string, value: string | null | undefined, list: [string, MessageKey][], set2: (v: string | null) => void): ReactNode => (
    <Field id={`${uid}-${id}`} label={text} optional>
      {(a) => (
        <select {...a} value={value ?? ''} disabled={!editable} onChange={(e) => set2(e.target.value || null)}>
          <option value="">{t('nothingSet')}</option>
          {list.map(([v, k]) => (
            <option key={v} value={v}>{t(k)}</option>
          ))}
        </select>
      )}
    </Field>
  );

  return (
    <div className="page stack-lg">
      <BackToRecord />
      <header className="page-head">
        <h1>{t('hsTitle')}</h1>
        <p className="muted">{t('hsSub')}</p>
        {hist ? (
          <p className="muted">{t('hsFilledOn', { date: formatIsoDate(hist.updated_at.slice(0, 10), lang) })}</p>
        ) : (
          <p className="muted">{t('hsEmpty')}</p>
        )}
        {!hist && editable && <p className="card">{t('hsFirstVisit')}</p>}
      </header>

      <section className="card stack" aria-labelledby={`${uid}-form`}>
        <h2 id={`${uid}-form`}>{t('hsOwnerPart')}</h2>
        {editable ? (
          <form className="stack" onSubmit={onSubmit} aria-label={t('hsTitle')}>
            {sel('origin', t('hsOrigin'), draft.origin, ORIGIN, (v) => set('origin', v))}
            <Field id={`${uid}-since`} label={t('hsWithSince')} optional>
              {(a) => <input {...a} type="date" max={todayIso} value={draft.with_since ?? ''} onChange={(e) => set('with_since', e.target.value || null)} />}
            </Field>
            {sel('neutered', t('hsNeutered'), draft.neutered, YES_NO_UNKNOWN, (v) => set('neutered', v))}
            {sel('housing', t('hsHousing'), draft.housing, HOUSING, (v) => set('housing', v))}
            {TEXT_FIELDS.map(([key, k]) => (
              <Field key={key} id={`${uid}-${key}`} label={t(k)} optional>
                {(a) => (
                  <textarea
                    {...a}
                    rows={3}
                    maxLength={TEXT_MAX}
                    value={(draft[key] as string | null | undefined) ?? ''}
                    onChange={(e) => set(key, e.target.value || null)}
                  />
                )}
              </Field>
            ))}
            <button type="submit" className="btn btn-primary" disabled={busy}>{t('hsSave')}</button>
            <StatusLine status={status} />
          </form>
        ) : (
          <dl className="stack">
            <dt>{t('hsOrigin')}</dt><dd>{<Val v={label(ORIGIN, hist?.origin)} />}</dd>
            <dt>{t('hsWithSince')}</dt><dd><Val v={hist?.with_since ? formatIsoDate(hist.with_since, lang) : null} /></dd>
            <dt>{t('hsNeutered')}</dt><dd><Val v={label(YES_NO_UNKNOWN, hist?.neutered)} /></dd>
            <dt>{t('hsHousing')}</dt><dd><Val v={label(HOUSING, hist?.housing)} /></dd>
            {TEXT_FIELDS.map(([key, k]) => (
              <div key={key}>
                <dt>{t(k)}</dt>
                <dd><Val v={(hist?.[key as keyof HistoryRow] as string | null | undefined) ?? null} pre /></dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="card stack" aria-labelledby={`${uid}-tl`}>
        <h2 id={`${uid}-tl`}>{t('hsTimeline')}</h2>
        <Field id={`${uid}-filter`} label={t('hsFilter')}>
          {(a) => (
            <select {...a} value={filter} onChange={(e) => setFilter(e.target.value as TimelineKind | 'all')}>
              <option value="all">{t('hsAll')}</option>
              {TIMELINE_KINDS.map((k) => (
                <option key={k} value={k}>{t(KIND_LABEL[k])}</option>
              ))}
            </select>
          )}
        </Field>
        {shown.length === 0 ? (
          <p className="muted">{t('hsTlEmpty')}</p>
        ) : (
          <ol className="stack">
            {shown.map((e) => (
              <li key={e.id}>
                <time dateTime={e.date}>{formatIsoDate(e.date, lang)}</time> · {t(KIND_LABEL[e.kind])} · {e.title}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
