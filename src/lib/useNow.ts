import { useEffect, useState } from 'react';
import { msToNextMinute } from './time';

/** Aktuelle Zeit, aktualisiert zu jedem Minutenwechsel und beim Zurückkehren in die App. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, msToNextMinute(new Date()));
    };
    timer = setTimeout(tick, msToNextMinute(new Date()));
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return now;
}
