import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  activityName, areaPath, cumulative, euro, fmt, growthPct, hoursText, linePath, niceMax, notifCategoryName, pct, sortedActivity, sortedRecords,
  speciesName, sumLast, toPoints,
  type ActivityData, type DashboardData, type PracticeDashboardData, type SeriesKey,
} from '../../lib/dashboard';
import { staffActivity, staffDashboard, staffDashboardPractice } from '../../lib/staff';

// Der Bereich ist für Admins (intern), deshalb bewusst nur Deutsch und ohne die Sprachdateien der App.
const REFRESH_MS = 60_000;

type MetricKey = SeriesKey | 'practice';
const METRICS: { key: MetricKey; label: string; hint: string; color: string }[] = [
  { key: 'interactions', label: 'Interaktionen', hint: 'neue oder abgehakte Einträge pro Tag', color: 'var(--brand)' },
  { key: 'signups', label: 'Registrierungen', hint: 'neue Konten pro Tag', color: 'var(--accent)' },
  { key: 'pets', label: 'Neue Tiere', hint: 'angelegte Tierprofile pro Tag', color: 'var(--ok)' },
  { key: 'practice', label: 'Praxis-Aktionen', hint: 'Befunde, Impfungen, Termine, Anfragen, Vorschläge, Rechnungen und Impferinnerungen pro Tag', color: 'var(--warn)' },
];
type Tab = 'overview' | 'practices' | 'owners' | 'notifications' | 'system';

/** Zahl zählt beim Laden hoch (außer bei „weniger Bewegung“). */
function useCountUp(target: number): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(target);
      from.current = target;
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 700);
      const eased = 1 - (1 - k) ** 3;
      setShown(start + (target - start) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

function Kpi({ label, value, sub, tone, spark, isNew, format = fmt }: {
  label: string; value: number; sub?: string; tone: 'brand' | 'accent' | 'ok' | 'warn'; spark?: number[]; isNew?: boolean; format?: (n: number) => string;
}) {
  const shown = useCountUp(value);
  const max = spark ? Math.max(...spark, 1) : 1;
  const pts = spark ? toPoints(spark, 100, 28, { l: 1, r: 1, t: 2, b: 2 }, max) : [];
  return (
    <div className={`dash-kpi tone-${tone}`}>
      <div className="dash-kpi-label">{label}{isNew && <span className="dash-new">neu</span>}</div>
      <div className="dash-kpi-value">{format(shown)}</div>
      {sub && <div className="dash-kpi-sub">{sub}</div>}
      {spark && spark.length > 1 && (
        <svg className="dash-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
          <path d={areaPath(pts, 26)} className="dash-spark-area" />
          <path d={linePath(pts)} className="dash-spark-line" />
        </svg>
      )}
    </div>
  );
}

function dayLabel(d: string): string {
  const [, m, day] = d.split('-');
  return `${day}.${m}.`;
}

function LineChart({ days, values, color, unit }: { days: string[]; values: number[]; color: string; unit: string }) {
  const W = 640;
  const H = 230;
  const pad = { l: 38, r: 14, t: 14, b: 28 };
  const max = niceMax(Math.max(0, ...values));
  const pts = toPoints(values, W, H, pad, max);
  const baseY = H - pad.b;
  const [hover, setHover] = useState<number | null>(null);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const every = Math.max(1, Math.ceil(days.length / 6));

  const indexFromX = (clientX: number, el: HTMLElement): number => {
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    const iw = W - pad.l - pad.r;
    const i = Math.round(((x - pad.l) / iw) * (values.length - 1));
    return Math.min(values.length - 1, Math.max(0, i));
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => setHover(indexFromX(e.clientX, e.currentTarget));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? values.length) - 1));
    else if (e.key === 'ArrowRight') setHover((h) => Math.min(values.length - 1, (h ?? -1) + 1));
    else if (e.key === 'Escape') setHover(null);
    else return;
    e.preventDefault();
  };
  const total = values.reduce((a, b) => a + b, 0);
  const hp = hover !== null ? pts[hover] : null;

  return (
    <div className="dash-chart-wrap">
      <svg className="dash-chart" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <defs>
          <linearGradient id="dash-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => {
          const y = pad.t + (H - pad.t - pad.b) * (1 - t);
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} className="dash-grid" />
              <text x={pad.l - 6} y={y + 4} textAnchor="end" className="dash-axis">{Math.round(max * t)}</text>
            </g>
          );
        })}
        {days.map((d, i) =>
          i % every === 0 || i === days.length - 1 ? (
            <text key={d} x={pts[i]?.x ?? 0} y={H - 8} textAnchor="middle" className="dash-axis">{dayLabel(d)}</text>
          ) : null,
        )}
        <path d={areaPath(pts, baseY)} fill="url(#dash-fill)" />
        <path d={linePath(pts)} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" className="dash-line" />
        {hp && hover !== null && (
          <g>
            <line x1={hp.x} x2={hp.x} y1={pad.t} y2={baseY} className="dash-cursor" />
            <circle cx={hp.x} cy={hp.y} r="5" fill="var(--surface)" stroke={color} strokeWidth="2.5" />
          </g>
        )}
      </svg>
      <div
        className="dash-chart-hit"
        role="slider"
        tabIndex={0}
        aria-label={`Verlauf der letzten ${values.length} Tage, insgesamt ${total} ${unit}`}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, values.length - 1)}
        aria-valuenow={hover ?? Math.max(0, values.length - 1)}
        aria-valuetext={`${dayLabel(days[hover ?? values.length - 1] ?? '')}: ${values[hover ?? values.length - 1] ?? 0} ${unit}`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
      />
      {hp && hover !== null && (
        <div className="dash-tip" style={{ left: `${(hp.x / W) * 100}%` }} role="status">
          <strong>{fmt(values[hover] ?? 0)}</strong> {unit}
          <span>{dayLabel(days[hover] ?? '')}</span>
        </div>
      )}
    </div>
  );
}

function BarRows({ rows, tone }: { rows: { key: string; label: string; n: number }[]; tone: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  const total = rows.reduce((a, r) => a + r.n, 0);
  return (
    <ul className="dash-bars">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="dash-bar-label">{r.label}</span>
          <span className="dash-bar-track" aria-hidden="true">
            <span className={`dash-bar-fill ${tone}`} style={{ width: `${(r.n / max) * 100}%` }} />
          </span>
          <span className="dash-bar-n">{fmt(r.n)}{total > 0 && <small> · {pct(r.n, total)} %</small>}</span>
        </li>
      ))}
    </ul>
  );
}

function Meter({ label, part, whole, note }: { label: string; part: number; whole: number; note: string }) {
  const p = pct(part, whole);
  return (
    <div className="dash-meter">
      <div className="dash-meter-head">
        <span>{label}</span>
        <strong>{p} %</strong>
      </div>
      <div className="dash-meter-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={label}>
        <div className="dash-meter-fill" style={{ width: `${p}%` }} />
      </div>
      <small className="muted">{note}</small>
    </div>
  );
}

const GROWTH: { key: 'accounts' | 'pets'; label: string; unit: string; color: string }[] = [
  { key: 'accounts', label: 'Konten', unit: 'Konten gesamt', color: 'var(--brand)' },
  { key: 'pets', label: 'Tiere', unit: 'Tiere gesamt', color: 'var(--accent)' },
];

function signed(n: number | null): string {
  if (n === null) return '–';
  return `${n > 0 ? '+' : ''}${fmt(n)} %`;
}

/** Wachstumslinie: laufende Gesamtzahl und Wachstumsquote im gewählten Zeitraum. */
function Growth({ data, range }: { data: DashboardData; range: 7 | 30 }) {
  const [which, setWhich] = useState<'accounts' | 'pets'>('accounts');
  const g = GROWTH.find((x) => x.key === which) ?? GROWTH[0]!;
  const key: SeriesKey = which === 'accounts' ? 'signups' : 'pets';
  const daily = data.series.map((p) => p[key]);
  const total = which === 'accounts' ? data.users.total : data.pets.total;
  // Stand vor dem ersten angezeigten Tag = heutiger Stand minus alles, was seitdem dazukam
  const cum = cumulative(daily, Math.max(0, total - daily.reduce((a, b) => a + b, 0)));
  const now = cum[cum.length - 1] ?? 0;
  const at = (daysAgo: number): number => cum[Math.max(0, cum.length - 1 - daysAgo)] ?? 0;
  const added = now - at(range);
  const days = data.series.slice(-range).map((p) => p.d);
  const values = cum.slice(1).slice(-range);
  const rate = growthPct(now, at(range));
  const rate7 = growthPct(now, at(7));
  return (
    <article className="card dash-card dash-wide">
      <div className="card-head">
        <h3>Wachstum</h3>
        <div className="dash-seg" role="group" aria-label="Wachstum von">
          {GROWTH.map((x) => (
            <button key={x.key} type="button" aria-pressed={which === x.key} className={which === x.key ? 'on' : ''} onClick={() => setWhich(x.key)}>{x.label}</button>
          ))}
        </div>
      </div>
      <p className="muted dash-hint">Laufende Gesamtzahl der {g.label} und prozentuales Wachstum im Zeitraum</p>
      <div className="dash-chips">
        <div className="dash-chip"><span>Wachstumsquote ({range} Tage)</span><strong className={rate !== null && rate < 0 ? 'neg' : 'pos'}>{signed(rate)}</strong></div>
        <div className="dash-chip"><span>Wachstumsquote (7 Tage)</span><strong className={rate7 !== null && rate7 < 0 ? 'neg' : 'pos'}>{signed(rate7)}</strong></div>
        <div className="dash-chip"><span>Neu im Zeitraum</span><strong>{added > 0 ? '+' : ''}{fmt(added)}</strong></div>
        <div className="dash-chip"><span>Ø pro Tag</span><strong>{new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(added / range)}</strong></div>
      </div>
      <LineChart days={days} values={values} color={g.color} unit={g.unit} />
      <p className="muted dash-hint">Bei wenigen Konten oder Tieren schwanken Prozentwerte stark: Von 1 auf 19 sind es +1.800 %, von 19 auf 29 nur +53 %.</p>
      {rate === null && <p className="muted dash-hint">Eine Quote gibt es erst, wenn zu Beginn des Zeitraums schon {g.label} vorhanden waren.</p>}
    </article>
  );
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/** „Letzte 24 Stunden“: was in der App passiert ist – nur Arten und Zeiten, keine Namen oder Inhalte. */
function Activity({ a }: { a: ActivityData }) {
  const rows = sortedActivity(a.by_kind).filter((r) => r.key !== 'push');
  const total = rows.reduce((s, r) => s + r.n, 0);
  const push = a.by_kind.push ?? 0;
  const max = niceMax(Math.max(0, ...a.hourly.map((h) => h.n)), 4);
  return (
    <article className="card dash-card dash-wide">
      <h3>Letzte 24 Stunden</h3>
      <p className="muted dash-hint">Was seit gestern um diese Zeit in der App passiert ist</p>
      <div className="dash-chips">
        <div className="dash-chip"><span>Einträge &amp; Aktionen</span><strong>{fmt(total)}</strong></div>
        <div className="dash-chip"><span>Anmeldungen</span><strong>{fmt(a.logins)}</strong></div>
        <div className="dash-chip"><span>KI-Anfragen</span><strong>{fmt(a.ai)}</strong></div>
        <div className="dash-chip"><span>Push-Nachrichten</span><strong>{fmt(push)}</strong></div>
      </div>
      <div className="dash-hours" role="img" aria-label={`Aktionen pro Stunde, insgesamt ${total} in 24 Stunden`}>
        {a.hourly.map((h) => (
          <span key={h.h} className="dash-hour" title={`${timeOf(h.h)} Uhr: ${h.n} Aktionen · ${h.push} Push · ${h.ai} KI`}>
            <span className="dash-hour-bar" style={{ height: `${Math.max(h.n > 0 ? 6 : 2, (h.n / max) * 100)}%` }} />
          </span>
        ))}
      </div>
      <div className="dash-hours-axis" aria-hidden="true"><span>vor 24 Std.</span><span>jetzt</span></div>
      {rows.length > 0 ? <BarRows rows={rows} tone="tone-brand" /> : <p className="muted">Keine Aktionen in den letzten 24 Stunden.</p>}
      {a.recent.length > 0 && (
        <>
          <h4>Zuletzt</h4>
          <ul className="stack">
            {a.recent.slice(0, 15).map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <strong>{timeOf(e.at)} Uhr</strong> · {activityName(e.kind)}
                <small className="muted"> · {new Date(e.at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}

/** Anteile als ein Balken mit Legende */
function StackBar({ parts, label, format = fmt }: { parts: { label: string; n: number; color: string }[]; label: string; format?: (n: number) => string }) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  return (
    <div className="stack-sm">
      <div className="dash-stack" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.n}`).join(', ')}`}>
        {total > 0 ? parts.filter((p) => p.n > 0).map((p) => <span key={p.label} style={{ width: `${(p.n / total) * 100}%`, background: p.color }} />) : <span className="dash-stack-empty" />}
      </div>
      <div className="dash-legend" aria-hidden="true">
        {parts.map((p) => <span key={p.label}><i style={{ background: p.color }} />{p.label} {format(p.n)}{total > 0 && ` · ${pct(p.n, total)} %`}</span>)}
      </div>
    </div>
  );
}

/** Kennzahlen als Liste: Bezeichnung links, Wert rechts */
function Facts({ rows }: { rows: { label: string; value: string; strong?: boolean }[] }) {
  return (
    <dl className="dash-facts">
      {rows.map((r) => (
        <div key={r.label}><dt>{r.label}</dt><dd>{r.strong ? <strong>{r.value}</strong> : r.value}</dd></div>
      ))}
    </dl>
  );
}

function Chips({ items }: { items: { label: string; value: string }[] }) {
  return <div className="dash-chips">{items.map((x) => <div key={x.label} className="dash-chip"><span>{x.label}</span><strong>{x.value}</strong></div>)}</div>;
}

/** Weg einer Anfrage: gestellt → Vorschlag → gebucht */
function InquiryFunnel({ p }: { p: PracticeDashboardData }) {
  const q = p.inquiries;
  const steps = [
    { label: 'Anfragen', n: q.total, tone: 'tone-brand' },
    { label: 'mit Terminvorschlag', n: q.offered, tone: 'tone-brand' },
    { label: 'Termin gebucht', n: q.booked, tone: 'tone-ok' },
    { label: 'abgelehnt oder andere Zeit', n: q.declined + q.wished, tone: 'tone-warn' },
  ];
  return (
    <article className="card dash-card">
      <h3>Weg einer Anfrage</h3>
      <p className="muted dash-hint">Halter:in fragt → Praxis schlägt Termine vor → Termin gebucht</p>
      <ul className="dash-funnel">
        {steps.map((st) => (
          <li key={st.label}>
            <span className="dash-funnel-head">
              <span>{st.label}</span>
              <span className="dash-bar-n">{fmt(st.n)}{q.total > 0 && <small> · {pct(st.n, q.total)} %</small>}</span>
            </span>
            <span className="dash-bar-track" aria-hidden="true"><span className={`dash-bar-fill ${st.tone}`} style={{ width: `${q.total ? Math.max(st.n ? 4 : 0, (st.n / q.total) * 100) : 0}%` }} /></span>
          </li>
        ))}
      </ul>
      <p className="muted dash-hint">Mittlere Zeit bis zur ersten Antwort oder zum Vorschlag: {hoursText(q.replied_h)}</p>
    </article>
  );
}

function PracticesTab({ p }: { p: PracticeDashboardData }) {
  const a = p.appointments;
  const e = p.entries;
  const inv = p.invoices;
  const entryRows = [
    { key: 'finding', label: 'Befunde', n: e.finding }, { key: 'vital', label: 'Gewicht & Vitalwerte', n: e.vital },
    { key: 'medication', label: 'Medikamente', n: e.medication }, { key: 'vaccination', label: 'Impfungen', n: e.vaccination },
  ].sort((x, y) => y.n - x.n);
  return (
    <div className="dash-grid-3">
      <article className="card dash-card">
        <h3>Praxis-Konten</h3>
        <Chips items={[{ label: 'aktiv', value: fmt(p.accounts.active) }, { label: 'in Prüfung', value: fmt(p.accounts.pending) }, { label: 'Team gesamt', value: fmt(p.accounts.staff) }]} />
        <Facts rows={[
          { label: 'Freigegebene Patienten', value: fmt(p.patients.total), strong: true },
          { label: '· per Code der Halter:in', value: fmt(p.patients.code) },
          { label: '· per Anfrage der Praxis', value: fmt(p.patients.request) },
          { label: 'Gesperrte Praxen', value: fmt(p.accounts.suspended) },
        ]} />
      </article>
      <article className="card dash-card">
        <h3>Termine der Praxen</h3>
        <StackBar label="Termine nach Weg" parts={[{ label: 'online gebucht', n: a.online, color: 'var(--brand)' }, { label: 'Telefon/Praxis', n: a.phone, color: 'var(--accent)' }]} />
        <Facts rows={[
          { label: 'kommend', value: fmt(a.upcoming), strong: true },
          { label: 'neu (noch zu bestätigen)', value: fmt(a.new) },
          { label: 'bestätigt · erschienen', value: `${fmt(a.confirmed)} · ${fmt(a.attended)}` },
          { label: 'nicht erschienen', value: fmt(a.no_show) },
          { label: 'von Halter:in verschoben · abgesagt', value: `${fmt(a.moved_by_owner)} · ${fmt(a.cancelled_owner)}` },
          { label: 'von der Praxis abgesagt', value: fmt(a.cancelled_practice) },
          { label: 'Warteliste · Impferinnerungen', value: `${fmt(a.waitlist)} · ${fmt(a.recalls)}` },
        ]} />
      </article>
      <article className="card dash-card">
        <h3>Patientenakte</h3>
        <p className="muted dash-hint">Einträge der Praxen{e.voided > 0 ? `, ohne ${fmt(e.voided)} stornierte` : ''}</p>
        <BarRows rows={entryRows} tone="tone-accent" />
      </article>
      <article className="card dash-card dash-span2">
        <h3>Abrechnung</h3>
        <p className="muted dash-hint">Summe über alle Praxen, brutto, ohne Entwürfe und stornierte Rechnungen</p>
        <Chips items={[
          { label: 'Rechnungen', value: fmt(inv.count) }, { label: 'Summe', value: euro(inv.gross) }, { label: 'bezahlt', value: euro(inv.paid) },
          { label: 'offen', value: euro(inv.open) }, { label: 'Entwürfe', value: fmt(inv.drafts) }, { label: 'Stornos', value: fmt(inv.cancellations) },
        ]} />
        <StackBar label="Rechnungsbetrag" format={(v) => euro(v)} parts={[{ label: 'bezahlt', n: Number(inv.paid) || 0, color: 'var(--ok)' }, { label: 'offen', n: Number(inv.open) || 0, color: 'var(--warn)' }]} />
      </article>
      <article className="card dash-card">
        <h3>Anfragen &amp; Nachrichten</h3>
        <Facts rows={[
          { label: 'Anfragen von Halter:innen', value: fmt(p.inquiries.total), strong: true },
          { label: '· davon offen', value: fmt(p.inquiries.open) },
          { label: 'Nachrichten der Praxen', value: fmt(p.inquiries.messages) },
          { label: 'Vorschlag angenommen', value: fmt(p.inquiries.booked) },
          { label: 'abgelehnt · andere Zeit gewünscht', value: `${fmt(p.inquiries.declined)} · ${fmt(p.inquiries.wished)}` },
          { label: 'Mittlere Antwortzeit', value: hoursText(p.inquiries.replied_h) },
        ]} />
      </article>
    </div>
  );
}

function NotificationsTab({ p }: { p: PracticeDashboardData }) {
  const n = p.notifications;
  const rows = Object.entries(n.by_category).map(([k, v]) => ({ key: k, label: notifCategoryName(k), n: v })).sort((a, b) => b.n - a.n);
  const series = p.series;
  return (
    <div className="dash-grid-3">
      <article className="card dash-card dash-span2">
        <h3>Benachrichtigungen nach Kategorie</h3>
        <p className="muted dash-hint">alle gespeicherten Mitteilungen · {fmt(n.total)} gesamt</p>
        {rows.length > 0 ? <BarRows rows={rows} tone="tone-brand" /> : <p className="muted">Noch keine Benachrichtigungen.</p>}
      </article>
      <article className="card dash-card">
        <h3>Wirkung</h3>
        <Chips items={[{ label: 'Push-Geräte', value: fmt(n.devices) }, { label: 'gelesen', value: `${pct(n.read, n.total)} %` }, { label: 'Quick Actions', value: fmt(n.quick_actions) }]} />
        <p className="muted dash-hint">„Quick Actions“: direkt in der Android-Mitteilung „Gegeben“, „Erledigt“, „Gefüttert“ oder „Später erinnern“ getippt.</p>
      </article>
      <article className="card dash-card dash-span3">
        <h3>Benachrichtigungen pro Tag</h3>
        <p className="muted dash-hint">{fmt(n.last_7d)} in den letzten 7 Tagen</p>
        <LineChart days={series.map((x) => x.d)} values={series.map((x) => x.notifications)} color="var(--brand)" unit="Benachrichtigungen" />
      </article>
    </div>
  );
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Überblick' }, { key: 'practices', label: 'Praxen' }, { key: 'owners', label: 'Halter:innen' },
  { key: 'notifications', label: 'Benachrichtigungen' }, { key: 'system', label: 'System' },
];

/** Zahlen-Übersicht für Admins: Überblick, Praxen, Halter:innen, Benachrichtigungen, System. Aktualisiert sich selbst. */
export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [practice, setPractice] = useState<PracticeDashboardData | null>(null);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<7 | 30>(30);
  const [metric, setMetric] = useState<MetricKey>('interactions');
  const [tab, setTab] = useState<Tab>('overview');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await staffDashboard());
      // Zusätzliche Teile: fehlen sie (z. B. Funktion noch nicht eingespielt), bleibt der Rest sichtbar
      const [act, prac] = await Promise.all([staffActivity().catch(() => null), staffDashboardPractice().catch(() => null)]);
      setActivity(act);
      setPractice(prac);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  if (!data) {
    return (
      <section className="dash" aria-busy={!failed} aria-label="Dashboard">
        {failed ? (
          <div className="notice notice-crit" role="alert">
            <p>Die Zahlen konnten nicht geladen werden.</p>
            <button type="button" className="btn btn-secondary" onClick={() => void load()}>Erneut versuchen</button>
          </div>
        ) : (
          <div className="dash-kpis" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="dash-kpi dash-skeleton" />)}
          </div>
        )}
      </section>
    );
  }

  const series = data.series.slice(-range);
  const pseries = (practice?.series ?? []).slice(-range);
  const m = METRICS.find((x) => x.key === metric) ?? METRICS[0]!;
  const chart = m.key === 'practice'
    ? { days: pseries.map((x) => x.d), values: pseries.map((x) => x.practice) }
    : { days: series.map((p) => p.d), values: series.map((p) => p[m.key as SeriesKey]) };
  const chartTotal = chart.values.reduce((a, b) => a + b, 0);
  const interactions7 = sumLast(data.series, 'interactions', 7);
  const speciesRows = Object.entries(data.pets.by_species).map(([k, n]) => ({ key: k, label: speciesName(k), n })).sort((a, b) => b.n - a.n);
  const aiMax = niceMax(Math.max(0, ...data.ai.hourly.map((h) => h.n)), 4);
  const updated = new Date(data.generated_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const missing = !practice && <p className="notice notice-info">Die Praxis-Zahlen sind noch nicht verfügbar (Datenbankfunktion fehlt oder konnte nicht geladen werden).</p>;
  const p = practice;
  const metrics = METRICS.filter((x) => x.key !== 'practice' || p);

  return (
    <section className="dash" aria-labelledby="dash-title">
      <header className="dash-head">
        <div>
          <h2 id="dash-title">Dashboard</h2>
          <p className="muted">Stand {updated} Uhr · aktualisiert sich jede Minute</p>
        </div>
        <div className="dash-tools">
          <div className="dash-seg" role="group" aria-label="Zeitraum">
            {([7, 30] as const).map((r) => (
              <button key={r} type="button" aria-pressed={range === r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r} Tage</button>
            ))}
          </div>
          <button type="button" className="btn btn-secondary dash-refresh" onClick={() => void load()} disabled={busy}>
            {busy ? 'Lädt …' : 'Aktualisieren'}
          </button>
        </div>
      </header>

      <nav className="dash-tabs" aria-label="Bereiche des Dashboards">
        {TABS.map((x) => (
          <button key={x.key} type="button" aria-pressed={tab === x.key} className={tab === x.key ? 'on' : ''} onClick={() => setTab(x.key)}>
            {x.label}
            {x.key === 'system' && data.tickets.open > 0 && <span className="dash-tab-badge" aria-label={`${data.tickets.open} offene Tickets`}>{data.tickets.open}</span>}
          </button>
        ))}
      </nav>

      {failed && <p className="notice notice-warn" role="status">Aktualisierung fehlgeschlagen, die Zahlen unten sind vom letzten Mal.</p>}

      {tab === 'overview' && (
        <>
          <div className="dash-kpis dash-kpis-4">
            <Kpi tone="brand" label="Konten" value={data.users.total} sub={`+${fmt(data.users.new_7d)} in 7 Tagen · ${fmt(data.users.active_7d)} aktiv`} spark={data.series.map((x) => x.signups)} />
            <Kpi tone="accent" label="Tiere" value={data.pets.total} sub={`+${fmt(data.pets.new_7d)} in 7 Tagen${p ? ` · ${fmt(p.patients.pets)} bei Praxen` : ''}`} spark={data.series.map((x) => x.pets)} />
            {p && <Kpi isNew tone="ok" label="Praxen aktiv" value={p.accounts.active} sub={`${fmt(p.accounts.staff)} im Team · ${fmt(p.accounts.pending)} in Prüfung`} />}
            {p && <Kpi isNew tone="brand" label="Praxistermine" value={p.appointments.total} sub={`${fmt(p.appointments.upcoming)} kommend · ${fmt(p.appointments.online)} online gebucht`} />}
            {p && <Kpi isNew tone="accent" label="Anfragen" value={p.inquiries.total} sub={`${fmt(p.inquiries.offered)} mit Vorschlag · ${fmt(p.inquiries.booked)} gebucht`} />}
            {p && <Kpi isNew tone="ok" label="Abgerechnet" value={Number(p.invoices.gross) || 0} format={(v) => euro(v)} sub={`${fmt(p.invoices.count)} Rechnungen · ${euro(p.invoices.paid)} bezahlt`} />}
            {p && <Kpi isNew tone="brand" label="Benachrichtigungen (7 Tage)" value={p.notifications.last_7d} sub={`${pct(p.notifications.read, p.notifications.total)} % gelesen · ${fmt(p.notifications.quick_actions)} Quick Actions`} spark={p.series.map((x) => x.notifications)} />}
            {!p && <Kpi tone="brand" label="Interaktionen (7 Tage)" value={interactions7} sub="neue oder abgehakte Einträge" spark={data.series.map((x) => x.interactions)} />}
            <Kpi tone={data.tickets.open > 0 ? 'warn' : 'ok'} label="Offene Tickets" value={data.tickets.open} sub={`${fmt(data.tickets.in_progress)} in Arbeit · ${fmt(data.tickets.closed)} erledigt`} />
          </div>
          {missing}
          <div className="dash-grid-3">
            <article className="card dash-card dash-span2">
              <div className="card-head">
                <h3>Verlauf pro Tag</h3>
                <div className="dash-seg" role="group" aria-label="Kennzahl">
                  {metrics.map((x) => (
                    <button key={x.key} type="button" aria-pressed={metric === x.key} className={metric === x.key ? 'on' : ''} onClick={() => setMetric(x.key)}>{x.label}</button>
                  ))}
                </div>
              </div>
              <p className="muted dash-hint">{m.label}: {m.hint} · zuletzt {fmt(chartTotal)} in {range} Tagen</p>
              <LineChart days={chart.days} values={chart.values} color={m.color} unit={m.label.toLowerCase()} />
            </article>
            {p ? <InquiryFunnel p={p} /> : (
              <article className="card dash-card">
                <h3>Aktivierung</h3>
                <Meter label="Konto mit Tier" part={data.users.with_pets} whole={data.users.total} note={`${fmt(data.users.with_pets)} von ${fmt(data.users.total)} Konten`} />
              </article>
            )}
          </div>
        </>
      )}

      {tab === 'practices' && (p ? <PracticesTab p={p} /> : missing)}

      {tab === 'owners' && (
        <>
          <div className="dash-kpis dash-kpis-4">
            <Kpi tone="brand" label="Konten" value={data.users.total} sub={`+${fmt(data.users.new_7d)} in 7 Tagen`} spark={data.series.map((x) => x.signups)} />
            <Kpi tone="ok" label="Aktiv (7 Tage)" value={data.users.active_7d} sub={`${pct(data.users.active_7d, data.users.total)} % aller Konten`} />
            <Kpi tone="accent" label="Tiere" value={data.pets.total} sub={`+${fmt(data.pets.new_7d)} in 7 Tagen`} spark={data.series.map((x) => x.pets)} />
            <Kpi tone="brand" label="Interaktionen (7 Tage)" value={interactions7} sub="neue oder abgehakte Einträge" spark={data.series.map((x) => x.interactions)} />
          </div>
          <div className="dash-grid-2">
            <Growth data={data} range={range} />
            <article className="card dash-card">
              <h3>Aktivierung</h3>
              <p className="muted dash-hint">Wie weit kommen Konten in der App?</p>
              <div className="stack">
                <Meter label="Konto mit Tier" part={data.users.with_pets} whole={data.users.total} note={`${fmt(data.users.with_pets)} von ${fmt(data.users.total)} Konten haben mindestens ein Tier`} />
                <Meter label="Aktiv in 30 Tagen" part={data.users.active_30d} whole={data.users.total} note={`${fmt(data.users.active_30d)} Konten haben sich angemeldet`} />
                <Meter label="Tier geteilt" part={data.pets.shared} whole={data.pets.total} note={`${fmt(data.pets.shared)} ${data.pets.shared === 1 ? 'Tier hat' : 'Tiere haben'} mehrere Mitglieder`} />
                {p && <Meter label="Tier bei einer Praxis" part={p.patients.pets} whole={data.pets.total} note={`${fmt(p.patients.pets)} Tiere sind für eine Praxis freigegeben`} />}
              </div>
            </article>
            <article className="card dash-card">
              <h3>Tiere nach Art</h3>
              <p className="muted dash-hint">{fmt(data.pets.total)} Tiere insgesamt</p>
              {speciesRows.length > 0 ? <BarRows rows={speciesRows} tone="tone-accent" /> : <p className="muted">Noch keine Tiere.</p>}
            </article>
            <article className="card dash-card">
              <h3>Erfasste Inhalte</h3>
              <p className="muted dash-hint">Alles, was Nutzer:innen bisher in der App angelegt haben</p>
              <BarRows rows={sortedRecords(data.records)} tone="tone-brand" />
            </article>
            <article className="card dash-card">
              <h3>Teilen</h3>
              <Facts rows={[
                { label: 'Geteilte Tiere', value: fmt(data.pets.shared), strong: true },
                { label: 'Einladungen angenommen', value: `${fmt(data.sharing.invites_accepted)} von ${fmt(data.sharing.invites)}` },
                { label: 'Mitglieder', value: fmt(data.sharing.members) },
                { label: 'Links für Tiersitter', value: fmt(data.sharing.sitter_links) },
              ]} />
            </article>
          </div>
        </>
      )}

      {tab === 'notifications' && (p ? <NotificationsTab p={p} /> : missing)}

      {tab === 'system' && (
        <div className="dash-grid-2">
          {activity && <Activity a={activity} />}
          <article className="card dash-card">
            <h3>Tickets</h3>
            <Chips items={[{ label: 'offen', value: fmt(data.tickets.open) }, { label: 'in Arbeit', value: fmt(data.tickets.in_progress) }, { label: 'erledigt', value: fmt(data.tickets.closed) }]} />
            <Facts rows={[
              { label: 'Push-Geräte', value: fmt(data.push.subscriptions) },
              { label: 'Push-Nachrichten (7 Tage)', value: fmt(data.push.sent_7d) },
              { label: 'Gesperrte Konten', value: fmt(data.users.locked) },
            ]} />
          </article>
          <article className="card dash-card">
            <h3>KI-Anfragen pro Stunde</h3>
            <p className="muted dash-hint">{fmt(data.ai.requests_24h)} in 24 Stunden von {fmt(data.ai.users_24h)} Personen</p>
            <div className="dash-hours" role="img" aria-label={`KI-Anfragen pro Stunde, insgesamt ${data.ai.requests_24h} in 24 Stunden`}>
              {data.ai.hourly.map((h) => {
                const hour = new Date(h.h).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                return (
                  <span key={h.h} className="dash-hour" title={`${hour} Uhr: ${h.n}`}>
                    <span className="dash-hour-bar" style={{ height: `${Math.max(h.n > 0 ? 6 : 2, (h.n / aiMax) * 100)}%` }} />
                  </span>
                );
              })}
            </div>
            <div className="dash-hours-axis" aria-hidden="true"><span>vor 24 Std.</span><span>jetzt</span></div>
          </article>
        </div>
      )}

      <p className="muted dash-note">
        Seitenaufrufe und Klicks werden nicht erfasst, weil die App bewusst kein Tracking nutzt (so steht es in der Datenschutzerklärung).
        „Interaktionen“ zählt, was in der Datenbank neu entsteht, zum Beispiel erledigte Routinen, Gewichte, Termine oder Medikamenten-Gaben. „Aktiv“ bedeutet: letzte Anmeldung im Zeitraum.
        Es werden nur Zahlen und Summen angezeigt, keine Namen, keine Tier- und keine Behandlungsdaten.
      </p>
    </section>
  );
}
