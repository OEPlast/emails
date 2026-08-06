/**
 * Value formatting shared by the HTML templates and the plain-text bodies, so a number never
 * renders one way in one and another way in the other.
 */

const nairaFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 2,
});

/**
 * Formats an amount as Naira.
 *
 * Returns "—" rather than "₦NaN" for a missing value: templates render optional money fields
 * (discounts, refund estimates) and a stray NaN in a receipt is worse than a visible blank.
 */
export function formatToNaira(value: number | undefined | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return nairaFormatter.format(value);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toDate(value: Date | string | number | undefined | null): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Nov 9, 2022 10:12 AM" */
export function formatDateTime(value: Date | string | number | undefined | null): string {
  const date = toDate(value);
  if (!date) return '—';

  const minutes = date.getMinutes().toString().padStart(2, '0');
  const rawHours = date.getHours();
  const ampm = rawHours >= 12 ? 'PM' : 'AM';
  const hours = rawHours % 12 || 12;

  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} ${hours}:${minutes} ${ampm}`;
}

/** "Nov 9, 2022" — for anything where the time of day is noise. */
export function formatDateOnly(value: Date | string | number | undefined | null): string {
  const date = toDate(value);
  if (!date) return '—';
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** "3 items" / "1 item" */
export function pluralize(count: number | undefined | null, singular: string, plural?: string): string {
  const n = typeof count === 'number' && Number.isFinite(count) ? count : 0;
  return `${n} ${n === 1 ? singular : plural ?? `${singular}s`}`;
}

/** "inspection_passed" -> "Inspection Passed" */
export function titleCase(value: string | undefined | null): string {
  if (!value) return '';
  return value
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** Greeting that stays grammatical when we have no name on file. */
export function greetingName(firstName: string | undefined | null): string {
  const name = (firstName ?? '').trim();
  return name.length > 0 ? name : 'there';
}
