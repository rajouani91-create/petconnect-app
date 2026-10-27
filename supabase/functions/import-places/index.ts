/* Edge Function „import-places“: lädt die GeoNames-Postleitzahlen eines Landes (AT, CH, FR, NL, MA) und schreibt sie in public.place_index.
   Gedacht für den monatlichen oder einmaligen Aufruf durch den Betreiber (Datenbank per pg_net), nicht für Nutzer:innen.
   Zugriff: Header x-import-key wird gegen einen Hash in private.import_keys geprüft (RPC import_key_ok, nur service_role). Ohne Eintrag dort ist die Funktion gesperrt. verify_jwt ist aus.
   Quelle: GeoNames (geonames.org), Lizenz CC BY 4.0. */
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { strFromU8, unzipSync } from 'npm:fflate@0.8.2';
import { chunk, isCountry, parseGeonames } from './parse.ts';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: allowed } = await sb.rpc('import_key_ok', { p_key: req.headers.get('x-import-key') ?? '' });
  if (allowed !== true) return json(401, { error: 'unauthorized' });

  const body = (await req.json().catch(() => ({}))) as { country?: unknown };
  if (!isCountry(body.country)) return json(400, { error: 'country' });
  const country = body.country;

  const res = await fetch(`https://download.geonames.org/export/zip/${country}.zip`);
  if (!res.ok) return json(502, { error: 'download', status: res.status });
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const data = files[`${country}.txt`];
  if (!data) return json(502, { error: 'file_missing' });
  const rows = parseGeonames(strFromU8(data), country);
  // Eine fast leere Datei darf die vorhandenen Orte nicht ersetzen
  if (rows.length < 100) return json(502, { error: 'too_few_rows', rows: rows.length });

  const startedAt = new Date().toISOString();
  for (const part of chunk(rows, 1000)) {
    const { error } = await sb.from('place_index').upsert(
      part.map((r) => ({ ...r, updated_at: startedAt })),
      { onConflict: 'country,postcode,place' },
    );
    if (error) return json(500, { error: 'upsert', message: error.message });
  }
  // Orte, die in der neuen Datei nicht mehr vorkommen, entfernen
  const { error: delError, count } = await sb.from('place_index').delete({ count: 'exact' }).eq('country', country).lt('updated_at', startedAt);
  if (delError) return json(500, { error: 'cleanup', message: delError.message });
  return json(200, { country, rows: rows.length, removed: count ?? 0 });
});
