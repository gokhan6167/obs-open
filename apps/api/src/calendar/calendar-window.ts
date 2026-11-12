/**
 * Akademik takvim pencere mantığı — saf, test edilebilir. Tüm modüller
 * (özellikle ders kayıt, Faz 2) "şu an X penceresi açık mı" sorusunu buradan sorar.
 */
export interface CalendarWindow {
  type: string;
  /** ISO timestamp. */
  startsAt: string;
  endsAt: string;
}

/** Verilen an, pencerenin [start, end) aralığında mı. */
export function isWithinWindow(atIso: string, window: CalendarWindow): boolean {
  return window.startsAt <= atIso && atIso < window.endsAt;
}

/** Verilen tipte AÇIK (o an aktif) bir pencere var mı. */
export function isEventOpen(
  windows: readonly CalendarWindow[],
  type: string,
  atIso: string,
): boolean {
  return windows.some((w) => w.type === type && isWithinWindow(atIso, w));
}
