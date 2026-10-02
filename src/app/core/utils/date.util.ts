/**
 * Coerces any value coming out of Firestore into a `Date`.
 *
 * Firestore `Timestamp` objects are duck-typed rather than `instanceof`-checked
 * so this keeps working even when two copies of the SDK end up in the bundle.
 */
export function toDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (value && typeof value === 'object' && 'seconds' in value) {
    const { seconds, nanoseconds } = value as { seconds: number; nanoseconds?: number };
    return new Date(seconds * 1000 + (nanoseconds ?? 0) / 1_000_000);
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date(0);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 min ago", "3 hr ago", "2 days ago". */
export function timeAgo(date: Date, now = new Date()): string {
  const diff = now.getTime() - date.getTime();
  if (Number.isNaN(diff) || diff < 0) {
    return 'just now';
  }
  if (diff < MINUTE) {
    return 'just now';
  }
  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return `${minutes} min ago`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours} hr ago`;
  }
  const days = Math.floor(diff / DAY);
  if (days < 30) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "12:45 pm" style clock label used in order timelines. */
export function formatClock(date: Date): string {
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** "Today, 12:45 pm" / "2 Mar 2026, 7:10 pm". */
export function formatDateTime(date: Date, now = new Date()): string {
  const isToday = date.toDateString() === now.toDateString();
  return isToday
    ? `Today, ${formatClock(date)}`
    : `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${formatClock(date)}`;
}
