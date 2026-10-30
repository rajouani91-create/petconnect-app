// Inline-SVG-Icons (24 × 24, Strich in currentColor). Dekorativ: aria-hidden.
import type { ReactNode, SVGProps } from 'react';
import type { Kind, Species } from '../lib/domain';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 24, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const LogoMark = ({ size = 30 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
    <rect width="32" height="32" rx="9" fill="currentColor" />
    <g fill="var(--surface)">
      <ellipse cx="16" cy="20" rx="5.2" ry="4.4" />
      <circle cx="9.6" cy="14" r="2.3" />
      <circle cx="13.5" cy="9.6" r="2.3" />
      <circle cx="18.5" cy="9.6" r="2.3" />
      <circle cx="22.4" cy="14" r="2.3" />
    </g>
  </svg>
);

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);
export const IconAssistant = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 4H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3v3.5l4.5-3.5H20a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1z" />
    <path d="M12 6.8l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z" />
  </Svg>
);
export const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);
export const IconPaw = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 13.5c-2.6 0-5 2.6-5 4.6 0 1.6 1.3 2.4 2.7 2.4 1 0 1.5-.5 2.3-.5s1.3.5 2.3.5c1.4 0 2.7-.8 2.7-2.4 0-2-2.4-4.6-5-4.6Z" />
    <ellipse cx="5.5" cy="10.5" rx="1.8" ry="2.2" />
    <ellipse cx="9.3" cy="6.3" rx="1.8" ry="2.3" />
    <ellipse cx="14.7" cy="6.3" rx="1.8" ry="2.3" />
    <ellipse cx="18.5" cy="10.5" rx="1.8" ry="2.2" />
  </Svg>
);
export const IconList = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11" />
    <circle cx="5" cy="18" r="1.2" />
  </Svg>
);
export const IconMore = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5" cy="12" r="1.3" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <circle cx="19" cy="12" r="1.3" fill="currentColor" />
  </Svg>
);
export const IconEmergency = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 2.5 19.5h19L12 3Z" />
    <path d="M12 9.5v4.5M12 17h.01" />
  </Svg>
);
export const IconPeople = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <circle cx="17" cy="9" r="2.6" />
    <path d="M16.5 14.1c2.6.2 4.5 2.1 4.5 4.9" />
  </Svg>
);
export const IconShare = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="18" cy="5.5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="18.5" r="2.5" />
    <path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1" />
  </Svg>
);
export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2.2" />
    <path d="M15.5 8.5V5.7c0-1.2-1-2.2-2.2-2.2H5.7c-1.2 0-2.2 1-2.2 2.2v7.6c0 1.2 1 2.2 2.2 2.2h2.8" />
  </Svg>
);
export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);
export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" />
  </Svg>
);
export const IconPhone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3.5h3.2l1.6 4.2-2 1.3a11 11 0 0 0 5.2 5.2l1.3-2 4.2 1.6V17a2.5 2.5 0 0 1-2.7 2.5A15.5 15.5 0 0 1 2.5 6.2 2.5 2.5 0 0 1 5 3.5Z" />
  </Svg>
);
export const IconBack = (p: IconProps) => (
  <Svg {...p} className="flip-rtl">
    <path d="M15 5 8 12l7 7" />
  </Svg>
);
export const IconPin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.4" />
  </Svg>
);
export const IconBell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16ZM10 20.5a2 2 0 0 0 4 0" />
  </Svg>
);

/* Tierarten */
const SPECIES_PATHS: Record<Species, ReactNode> = {
  dog: (
    <>
      <path d="M7 9.5 4.5 5 3 10.5c0 1.3.8 2 2 2" />
      <path d="M17 9.5 19.5 5l1.5 5.5c0 1.3-.8 2-2 2" />
      <path d="M7 9c1.2-1.4 3-2 5-2s3.8.6 5 2c.8 1 1.2 2.4 1.2 4 0 4-2.8 6.5-6.2 6.5S5.8 17 5.8 13c0-1.6.4-3 1.2-4Z" />
      <path d="M10.8 15.5h2.4l-1.2 1.3-1.2-1.3Z" fill="currentColor" />
      <path d="M9.5 12h.01M14.5 12h.01" strokeWidth={2.4} />
    </>
  ),
  cat: (
    <>
      <path d="M5.5 11 5 3.8l4.4 3.4a8 8 0 0 1 5.2 0L19 3.8l-.5 7.2c.6 1 .9 2.2.9 3.4 0 3.6-3.3 5.8-7.4 5.8s-7.4-2.2-7.4-5.8c0-1.2.3-2.4.9-3.4Z" />
      <path d="M9.5 13h.01M14.5 13h.01" strokeWidth={2.4} />
      <path d="M11 15.8h2l-1 1-1-1ZM3 15l3.5.5M3.5 18l3.3-1M21 15l-3.5.5M20.5 18l-3.3-1" />
    </>
  ),
  rabbit: (
    <>
      <path d="M9.3 9.5C8 6.5 8 3 9.5 2.5s2.5 3.5 2.5 6.5" />
      <path d="M14.7 9.5C16 6.5 16 3 14.5 2.5S12 6 12 9" />
      <path d="M12 9c3.6 0 6 2.6 6 5.7S15.3 20.5 12 20.5s-6-2.7-6-5.8S8.4 9 12 9Z" />
      <path d="M10 14h.01M14 14h.01" strokeWidth={2.4} />
      <path d="M11.2 16.4h1.6l-.8.8-.8-.8Z" />
    </>
  ),
  guinea: (
    <>
      <path d="M3.5 15c0-4.2 3.6-7.5 8.5-7.5 4.4 0 8 2.8 8 6.6 0 3.3-2.7 5.4-6.4 5.4H7.6C5.2 19.5 3.5 17.6 3.5 15Z" />
      <path d="M7 8.7c-.8-1.6-.3-3 1.2-3.2 1 0 1.6.9 1.7 2" />
      <path d="M7.5 13h.01" strokeWidth={2.4} />
      <path d="M4 15.5h1.2M8 19.5v1.3M15 19.5v1.3" />
    </>
  ),
  bird: (
    <>
      <path d="M14.5 6.5a3.5 3.5 0 0 0-6.8 1.2c0 1.2.3 2.2.3 2.2L4 17.5c3 .9 7.6.6 10.3-2.4 2.3-2.5 2.2-5.6.2-8.6Z" />
      <path d="m14.5 6.5 3.5 1-3 1.5" />
      <path d="M11 7.5h.01" strokeWidth={2.4} />
      <path d="M9.5 17.5 8.5 21M12.5 16.5l.5 4.5" />
    </>
  ),
  reptile: (
    <>
      <path d="M4 12c0-1.6 1.4-2.6 3-2.6h3.5c1 0 1.8-.4 2.5-1L15 6.8c1-.8 2.4-.8 3.3 0l1.2 1c.8.8.8 2 0 2.7l-1 .8c-.7.6-.7 1.6 0 2.2 1 .9.7 2.5-.6 2.9l-3.4 1c-2.3.7-4.4-.1-5.6-1.8H6.8C5.2 15.6 4 14 4 12Z" />
      <path d="M16.6 8.6h.01" strokeWidth={2.4} />
      <path d="M8 15.6 6.5 19M11 9.4 9.8 6.2M4 12H2" />
    </>
  ),
  horse: (
    <>
      <path d="M8 21v-5.5L5 13.8c-1-.7-1.3-2-.6-3l3.4-5.4C8.8 4 10.4 3.2 12 3.2l1-1.7 1.2 2c3 1 5.3 3.9 5.3 8.2V21" />
      <path d="M8 15.5c2.5.3 4.4-.6 5.2-2.7" />
      <path d="M9.3 8.3h.01" strokeWidth={2.4} />
      <path d="M13 4c1.5 1.8 2.6 4 3 6.6" />
    </>
  ),
  other: (
    <>
      <path d="M12 13.5c-2.6 0-5 2.6-5 4.6 0 1.6 1.3 2.4 2.7 2.4 1 0 1.5-.5 2.3-.5s1.3.5 2.3.5c1.4 0 2.7-.8 2.7-2.4 0-2-2.4-4.6-5-4.6Z" />
      <ellipse cx="5.5" cy="10.5" rx="1.8" ry="2.2" />
      <ellipse cx="9.3" cy="6.3" rx="1.8" ry="2.3" />
      <ellipse cx="14.7" cy="6.3" rx="1.8" ry="2.3" />
      <ellipse cx="18.5" cy="10.5" rx="1.8" ry="2.2" />
    </>
  ),
};

export const SpeciesIcon = ({ species, ...p }: IconProps & { species: Species }) => <Svg {...p}>{SPECIES_PATHS[species]}</Svg>;

/* Arten von Tagesplan-Einträgen */
const KIND_PATHS: Record<Kind, ReactNode> = {
  walk: (
    <>
      <circle cx="13" cy="4.5" r="1.8" />
      <path d="m9.5 21 2.5-6.5 3 3V21M8 12l2.5-4.5 4 1.5 2 3.5M12 14.5 10.5 7.5" />
    </>
  ),
  feed: (
    <>
      <path d="M3 13h18c0 3.9-3.2 7-7 7h-4c-3.8 0-7-3.1-7-7Z" />
      <path d="M8 10c0-1.5 1.8-2.5 4-2.5s4 1 4 2.5" />
    </>
  ),
  med: (
    <>
      <rect x="3.2" y="8.5" width="17.6" height="7" rx="3.5" transform="rotate(-40 12 12)" />
      <path d="m9.8 9.2 5 4.6" />
    </>
  ),
  litter: (
    <>
      <path d="M3 11h18l-1.8 8.5H4.8L3 11Z" />
      <path d="M6 11c.8-2 2.3-3 4-3M14 8l2-3.5" />
    </>
  ),
  cage: (
    <>
      <path d="M4 20V10a8 6 0 0 1 16 0v10M3 20h18M8 20V6.5M12 20V4M16 20V6.5" />
    </>
  ),
  terra: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 15c3-1.5 5-1.5 8 0s5 1.5 10 0M8 6V4h8v2" />
    </>
  ),
  muck: (
    <>
      <path d="M12 3v11M8.5 14h7l-1 6.5h-5L8.5 14ZM10.5 3h3" />
    </>
  ),
  own: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16ZM10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
};

export const KindIcon = ({ kind, ...p }: IconProps & { kind: Kind }) => <Svg {...p}>{KIND_PATHS[kind]}</Svg>;

export const IconChevron = (p: IconProps) => (
  <Svg {...p} className="flip-rtl">
    <path d="m9 6 6 6-6 6" />
  </Svg>
);
export const IconSparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 14 10l6.5 2-6.5 2-2 6.5-2-6.5L3.5 12 10 10Z" />
  </Svg>
);
export const IconChart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 20v-7M12 20V5M18 20v-10" />
  </Svg>
);
export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 5 6.2v5.3c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6.2Z" />
    <path d="m9 12 2.2 2.2L15 10.4" />
  </Svg>
);
export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
  </Svg>
);
