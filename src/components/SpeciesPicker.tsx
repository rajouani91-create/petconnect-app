import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n';
import { SPECIES, type Species } from '../lib/domain';
import { SpeciesIcon } from './Icons';

export const SPECIES_LABEL: Record<Species, MessageKey> = {
  dog: 'dog',
  cat: 'cat',
  rabbit: 'rabbit',
  guinea: 'guinea',
  bird: 'bird',
  reptile: 'reptile',
  horse: 'horse',
  other: 'otherAnimal',
};

interface Props {
  value: Species;
  onChange: (s: Species) => void;
  labelId: string;
}

/** 8 Kacheln als Umschalt-Buttons (aria-pressed). */
export function SpeciesPicker({ value, onChange, labelId }: Props) {
  const { t } = useI18n();
  return (
    <div className="species-grid" role="group" aria-labelledby={labelId}>
      {SPECIES.map((s) => (
        <button key={s} type="button" className="species-tile" aria-pressed={value === s} onClick={() => onChange(s)}>
          <SpeciesIcon species={s} size={30} />
          <span>{t(SPECIES_LABEL[s])}</span>
        </button>
      ))}
    </div>
  );
}
