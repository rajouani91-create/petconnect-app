import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  areaPath, cumulative, fmt, growthPct, linePath, niceMax, pct, sortedRecords, speciesName, sumLast, toPoints,
  type DashboardData, type SeriesKey,
} from '../../lib/dashboard';
import { staffDashboard } from '../../lib/staff';

// Der Bereich ist für Admins (intern), deshalb bewusst nur Deutsch und ohne die Sprachdateien der App.
const REFRESH_MS = 60_000;

const METRICS: { key: SeriesKey; label: string; hint: string; color: string }[] = [
  { key: 'interactions', label: 'Interaktionen', hint: 'neue oder abgehakte Einträge pro Tag', color: 'var(--brand)' },
  { key: 'signups', label: 'Registrierungen', hint: 'neue Konten pro Tag', color: 'var(--accent)' },
  { key: 'pets', label: 'Neue Tiere', hint: 'angelegte Tierprofile pro Tag', color: 'var(--ok)' },
];

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

function Kpi({ label, value, sub, tone, spark }: { label: string; value: number; sub?: string; tone: 'brand' | 'accent' | 'ok' | 'warn'; spark?: number[] }) {
  const shown = useCountUp(value);
  const max = spark ? Math.max(...spark, 1) : 1;
  const pts = spark ? toPoints(spark, 100, 28, { l: 1, r: 1, t: 2, b: 2 }, max) : [];
  return (
    <div className={`dash-kpi tone-${tone}`}>
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{fmt(shown)}</div>
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

/** Zahlen-Übersicht für Admins: Konten, Tiere, Interaktionen, KI-Nutzung. Aktualisiert sich selbst. */
export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<7 | 30>(30);
  const [metric, setMetric] = useState<SeriesKey>('interactions');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await staffDashboard());
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
  const m = METRICS.find((x) => x.key === metric) ?? METRICS[0]!;
  const interactions7 = sumLast(data.series, 'interactions', 7);
  const speciesRows = Object.entries(data.pets.by_species).map(([k, n]) => ({ key: k, label: speciesName(k), n })).sort((a, b) => b.n - a.n);
  const aiMax = niceMax(Math.max(0, ...data.ai.hourly.map((h) => h.n)), 4);
  const updated = new Date(data.generated_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

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

      {failed && <p className="notice notice-warn" role="status">Aktualisierung fehlgeschlagen, die Zahlen unten sind vom letzten Mal.</p>}

      <div className="dash-kpis">
        <Kpi tone="brand" label="Konten" value={data.users.total} sub={`+${fmt(data.users.new_7d)} in 7 Tagen`} spark={data.series.map((p) => p.signups)} />
        <Kpi tone="ok" label="Aktiv (7 Tage)" value={data.users.active_7d} sub={`${pct(data.users.active_7d, data.users.total)} % aller Konten`} />
        <Kpi tone="accent" label="Tiere" value={data.pets.total} sub={`+${fmt(data.pets.new_7d)} in 7 Tagen`} spark={data.series.map((p) => p.pets)} />
        <Kpi tone="brand" label="Interaktionen (7 Tage)" value={interactions7} sub="neue oder abgehakte Einträge" spark={data.series.map((p) => p.interactions)} />
        <Kpi tone="accent" label="KI-Anfragen (24 Std.)" value={data.ai.requests_24h} sub={`von ${fmt(data.ai.users_24h)} Personen`} spark={data.ai.hourly.map((h) => h.n)} />
        <Kpi tone="ok" label="Geteilte Tiere" value={data.pets.shared} sub={`${fmt(data.sharing.invites_accepted)} von ${fmt(data.sharing.invites)} Einladungen angenommen`} />
        <Kpi tone="brand" label="Push-Geräte" value={data.push.subscriptions} sub={`${fmt(data.push.sent_7d)} Nachrichten in 7 Tagen`} />
        <Kpi tone={data.tickets.open > 0 ? 'warn' : 'ok'} label="Offene Tickets" value={data.tickets.open} sub={`${fmt(data.tickets.in_progress)} in Arbeit · ${fmt(data.tickets.closed)} erledigt`} />
      </div>

      <div className="dash-grid-2">
        <Growth data={data} range={range} />

        <article className="card dash-card dash-wide">
          <div className="card-head">
            <h3>Verlauf pro Tag</h3>
            <div className="dash-seg" role="group" aria-label="Kennzahl">
              {METRICS.map((x) => (
                <button key={x.key} type="button" aria-pressed={metric === x.key} className={metric === x.key ? 'on' : ''} onClick={() => setMetric(x.key)}>{x.label}</button>
              ))}
            </div>
          </div>
          <p className="muted dash-hint">{m.label}: {m.hint} · zuletzt {fmt(sumLast(series, m.key, range))} in {range} Tagen</p>
          <LineChart days={series.map((p) => p.d)} values={series.map((p) => p[m.key])} color={m.color} unit={m.label.toLowerCase()} />
        </article>

        <article className="card dash-card">
          <h3>KI-Anfragen pro Stunde</h3>
          <p className="muted dash-hint">letzte 24 Stunden, Maximum {fmt(aiMax)}</p>
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

        <article className="card dash-card">
          <h3>Tiere nach Art</h3>
          <p className="muted dash-hint">{fmt(data.pets.total)} Tiere insgesamt</p>
          {speciesRows.length > 0 ? <BarRows rows={speciesRows} tone="tone-accent" /> : <p className="muted">Noch keine Tiere.</p>}
        </article>

        <article className="card dash-card">
          <h3>Aktivierung</h3>
          <p className="muted dash-hint">Wie weit kommen Konten in der App?</p>
          <div className="stack">
            <Meter label="Konto mit Tier" part={data.users.with_pets} whole={data.users.total} note={`${fmt(data.users.with_pets)} von ${fmt(data.users.total)} Konten haben mindestens ein Tier`} />
            <Meter label="Aktiv in 30 Tagen" part={data.users.active_30d} whole={data.users.total} note={`${fmt(data.users.active_30d)} Konten haben sich angemeldet`} />
            <Meter label="Tier geteilt" part={data.pets.shared} whole={data.pets.total} note={`${fmt(data.pets.shared)} ${data.pets.shared === 1 ? 'Tier hat' : 'Tiere haben'} mehrere Mitglieder`} />
          </div>
        </article>

        <article className="card dash-card">
          <h3>Erfasste Inhalte</h3>
          <p className="muted dash-hint">Alles, was Nutzer:innen bisher in der App angelegt haben</p>
          <BarRows rows={sortedRecords(data.records)} tone="tone-brand" />
        </article>
      </div>

      <p className="muted dash-note">
        Seitenaufrufe und Klicks werden nicht erfasst, weil die App bewusst kein Tracking nutzt (so steht es in der Datenschutzerklärung).
        „Interaktionen“ zählt, was in der Datenbank neu entsteht, zum Beispiel erledigte Routinen, Gewichte, Termine oder Medikamenten-Gaben. „Aktiv“ bedeutet: letzte Anmeldung im Zeitraum. Es werden nur Zahlen angezeigt, keine Namen und keine Tierdaten.
      </p>
    </section>
  );
}
