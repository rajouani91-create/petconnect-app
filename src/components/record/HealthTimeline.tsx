import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDateShort, localeOf, type MessageKey } from '../../i18n';
import { listAllVitals, listDocuments, listLabValues, listMedications, listVaccinations, listWeights } from '../../lib/api';
import { formatKg } from '../../lib/record';
import { localDate } from '../../lib/schedule';
import { KIND_LABEL, isVitalKind } from '../../lib/vital';
import {
  TIMELINE_FILTERS, filterEntries, groupByMonth, labDays, sortEntries,
  type TimelineEntry, type TimelineFilter,
} from '../../lib/healthTimeline';
import { IconChevron, IconChart, IconList, IconPlus, IconShield, IconBell } from '../Icons';
import { Loading } from '../Loading';
import type { PetRow } from '../../lib/supabase';

const FILTER_LABEL: Record<TimelineFilter, MessageKey> = { all: 'tlAll', vacc: 'recVacc', values: 'tlValues', meds: 'aiU_medication', docs: 'recDocs' };
const TARGET_HASH: Record<TimelineEntry['target'], string> = { weight: '#gewicht', vitals: '#vitalwerte', vacc: '#impfungen', docs: '#dokumente', lab: '#labor', meds: '#medikation' };
const KIND_ICON: Record<TimelineEntry['kind'], ReactNode> = {
  vaccination: <IconShield size={20} />,
  weight: <IconChart size={20} />,
  vital: <IconChart size={20} />,
  lab: <IconList size={20} />,
  document: <IconList size={20} />,
  medication: <IconPlus size={20} />,
};
const PAGE = 12;

/** Verlauf: alle eigenen Einträge dieses Tieres nach Monaten, mit Filter. Tippen springt zum passenden Reiter der Tierakte. */
export function HealthTimeline({ pet }: { pet: PetRow }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const uid = useId();
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let alive = true;
    setEntries(null);
    setError(false);
    setShown(PAGE);
    Promise.all([listVaccinations(pet.id), listWeights(pet.id), listAllVitals(pet.id), listLabValues(pet.id), listDocuments(pet.id), listMedications([pet.id])])
      .then(([vacc, weights, vitals, labs, docs, meds]) => {
        if (!alive) return;
        const out: TimelineEntry[] = [];
        for (const v of vacc) {
          if (!v.given_on) continue;
          out.push({ id: `v-${v.id}`, kind: 'vaccination', date: v.given_on, at: v.created_at, title: v.name, detail: v.valid_until ? t('vcValidUntilV', { d: formatIsoDateShort(v.valid_until, lang) }) : '', target: 'vacc' });
        }
        for (const w of weights) out.push({ id: `w-${w.id}`, kind: 'weight', date: w.measured_on, at: w.created_at, title: t('recWeight'), detail: t('wkKgValue', { kg: formatKg(Number(w.kg), locale) }), target: 'weight' });
        for (const x of vitals) {
          if (!isVitalKind(x.kind)) continue;
          const val = formatKg(Number(x.value), locale);
          out.push({ id: `t-${x.id}`, kind: 'vital', date: localDate(new Date(x.measured_at)), at: x.measured_at, title: t(KIND_LABEL[x.kind]), detail: x.kind === 'temperature' ? t('vtValTemp', { v: val }) : t('vtValRate', { v: val }), target: 'vitals' });
        }
        for (const d of labDays(labs)) out.push({ id: `l-${d.date}`, kind: 'lab', date: d.date, at: d.at, title: t('recLab'), detail: t('tlLabN', { n: d.count }), target: 'lab' });
        for (const d of docs) out.push({ id: `d-${d.id}`, kind: 'document', date: d.doc_date ?? localDate(new Date(d.created_at)), at: d.created_at, title: d.title, detail: '', target: 'docs' });
        for (const m of meds) out.push({ id: `m-${m.id}`, kind: 'medication', date: m.starts_on, at: m.created_at, title: m.name, detail: t('tlMedStart'), target: 'meds' });
        setEntries(sortEntries(out));
      })
      .catch((e) => {
        console.error(e);
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [pet.id, t, lang, locale]);

  if (error) return <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>;
  if (!entries) return <Loading />;

  const list = filterEntries(entries, filter);
  const visible = list.slice(0, shown);
  const groups = groupByMonth(visible);
  const monthName = (m: string) => {
    const [y, mo] = m.split('-').map(Number) as [number, number];
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(y, mo - 1, 1));
  };

  return (
    <section className="stack timeline" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('tlTitle')}</h2>
      <div className="range-chips" role="group" aria-label={t('tlFilterL')}>
        {TIMELINE_FILTERS.map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => { setFilter(f); setShown(PAGE); }}>
            {t(FILTER_LABEL[f])}
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="muted">{t('tlEmpty')}</p>}
      {groups.map((g) => (
        <section key={g.month} className="menu-group" aria-label={monthName(g.month)}>
          <h3 className="menu-title">{monthName(g.month)}</h3>
          <ul className="card menu-list">
            {g.entries.map((e) => (
              <li key={e.id}>
                <Link to={{ hash: TARGET_HASH[e.target] }} className="menu-row tl-row">
                  <span className="menu-ic">{e.kind === 'medication' ? <IconBell size={20} /> : KIND_ICON[e.kind]}</span>
                  <span className="menu-label">
                    <span className="tl-title">{e.title}</span>
                    <span className="muted small">{[formatIsoDateShort(e.date, lang), e.detail].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="pill tl-src">{t('vtSource')}</span>
                  <IconChevron size={18} className="menu-chev" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {list.length > shown && (
        <button type="button" className="btn btn-secondary" onClick={() => setShown((n) => n + PAGE)}>{t('tlMore')}</button>
      )}
    </section>
  );
}
