import { useEffect, useState } from 'react';
import { listVaccinationsFor } from '../lib/api';
import { overallVaccStatus, type VaccStatus } from '../lib/record';
import { zonedNow } from '../lib/time';
import { useNow } from '../lib/useNow';

/** Gesamtstatus der Impfungen je Tier (Tier-ID → Status); fehlt ein Tier, gibt es keinen Chip. Fehler werden still ignoriert. */
export function useVaccStatus(petIds: readonly string[]): ReadonlyMap<string, VaccStatus> {
  const today = zonedNow(useNow()).date;
  const key = petIds.join(',');
  const [map, setMap] = useState<ReadonlyMap<string, VaccStatus>>(new Map());
  useEffect(() => {
    let alive = true;
    const ids = key ? key.split(',') : [];
    listVaccinationsFor(ids)
      .then((rows) => {
        if (!alive) return;
        const next = new Map<string, VaccStatus>();
        for (const id of ids) {
          const st = overallVaccStatus(rows.filter((r) => r.pet_id === id).map((r) => r.valid_until), today);
          if (st) next.set(id, st);
        }
        setMap(next);
      })
      .catch((e: unknown) => {
        console.error(e);
        if (alive) setMap(new Map());
      });
    return () => {
      alive = false;
    };
  }, [key, today]);
  return map;
}
