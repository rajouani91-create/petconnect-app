import type { MessageKey, Vars } from '../i18n';
import { isKind, type Kind, type Repeat } from './domain';

export const KIND_LABEL: Record<Kind, MessageKey> = {
  walk: 'gpK_walk',
  feed: 'gpK_feed',
  med: 'gpK_med',
  litter: 'gpK_litter',
  cage: 'gpK_cage',
  terra: 'gpK_terra',
  muck: 'gpK_muck',
  own: 'gpK_own',
};

export const REPEAT_LABEL: Record<Repeat, MessageKey> = {
  daily: 'gpRdaily',
  weekdays: 'gpRwd',
  weekends: 'gpRwe',
};

type T = (key: MessageKey, vars?: Vars) => string;

/** Anzeigename eines Eintrags: eigene Bezeichnung bei „Eigenes“, sonst die Art. */
export function routineTitle(item: { kind: string; label: string | null }, t: T): string {
  if (item.kind === 'own' && item.label) return item.label;
  return isKind(item.kind) ? t(KIND_LABEL[item.kind]) : item.kind;
}

export function repeatLabel(repeat: string, t: T): string {
  return repeat === 'daily' || repeat === 'weekdays' || repeat === 'weekends' ? t(REPEAT_LABEL[repeat]) : repeat;
}
