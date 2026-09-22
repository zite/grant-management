import { differenceInCalendarDays, format, formatDistanceToNowStrict, isThisYear, parseISO } from 'date-fns';
import { formatMoney } from '@project/shared/forms/logic';

export { formatMoney };

/**
 * Dates are always shown in the applicant's own time zone, with the zone
 * named, so "5:00 PM" never means someone else's 5:00 PM.
 */

export function parseDay(day: string) {
  // Date-only strings are LOCAL days; `new Date('2026-09-12')` is UTC and shifts a day west of Greenwich.
  return parseISO(day.length === 10 ? `${day}T00:00:00` : day);
}

export function tzAbbr(date: Date) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(date).find(p => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** "Saturday, September 26, 2026 at 7:00 PM EDT" */
export function fullDateTime(iso: string | null | undefined) {
  if (!iso) return '';
  const d = parseISO(iso);
  return `${format(d, "EEEE, MMMM d, yyyy 'at' h:mm a")} ${tzAbbr(d)}`.trim();
}

/** "Sep 26, 2026 at 7:00 PM EDT" */
export function mediumDateTime(iso: string | null | undefined) {
  if (!iso) return '';
  const d = parseISO(iso);
  return `${format(d, "MMM d, yyyy 'at' h:mm a")} ${tzAbbr(d)}`.trim();
}

export function shortDate(value: string | null | undefined) {
  if (!value) return '';
  const d = parseDay(value);
  return isThisYear(d) ? format(d, 'MMM d') : format(d, 'MMM d, yyyy');
}

export function longDate(value: string | null | undefined) {
  if (!value) return '';
  return format(parseDay(value), 'MMMM d, yyyy');
}

export function timeOfDay(iso: string) {
  const d = parseISO(iso);
  return `${format(d, 'h:mm a')} ${tzAbbr(d)}`.trim();
}

/** "just now", "5 minutes ago", "3 days ago", then the date. */
export function timeAgo(iso: string | null | undefined) {
  if (!iso) return '';
  const d = parseISO(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 45_000) return 'just now';
  if (Math.abs(differenceInCalendarDays(new Date(), d)) > 20) return shortDate(iso);
  return `${formatDistanceToNowStrict(d, { roundingMethod: 'floor' })} ago`;
}

export type Urgency = 'danger' | 'warning' | 'neutral' | 'muted';

/** How a program's deadline reads on a card, and how urgent it should look. */
export function deadlineInfo(p: { phase: string; deadline: string | null; opensAt: string | null; allowLate?: boolean }) {
  if (p.phase === 'scheduled' && p.opensAt) {
    return { label: `Opens ${shortDate(p.opensAt)}`, tone: 'neutral' as Urgency, exact: `Opens ${fullDateTime(p.opensAt)}` };
  }
  if (!p.deadline) return { label: 'Rolling deadline', tone: 'neutral' as Urgency, exact: 'Applications are reviewed on a rolling basis, with no deadline.' };
  const d = parseISO(p.deadline);
  const ms = d.getTime() - Date.now();
  const exact = `Deadline: ${fullDateTime(p.deadline)}`;
  if (ms <= 0) {
    return { label: p.allowLate ? 'Deadline passed · late applications accepted' : `Closed ${shortDate(p.deadline)}`, tone: (p.allowLate ? 'warning' : 'muted') as Urgency, exact };
  }
  const hours = ms / 3_600_000;
  const days = differenceInCalendarDays(d, new Date());
  if (hours < 1) return { label: `Closes in ${Math.max(1, Math.round(ms / 60_000))} min`, tone: 'danger' as Urgency, exact };
  if (days === 0) return { label: `Closes today at ${timeOfDay(p.deadline)}`, tone: 'danger' as Urgency, exact };
  if (days === 1) return { label: `Closes tomorrow at ${timeOfDay(p.deadline)}`, tone: 'danger' as Urgency, exact };
  if (days <= 7) return { label: `Closes in ${days} days`, tone: 'warning' as Urgency, exact };
  if (days <= 30) return { label: `Closes in ${days} days`, tone: 'neutral' as Urgency, exact };
  return { label: `Closes ${shortDate(p.deadline)}`, tone: 'neutral' as Urgency, exact };
}

export function awardLabel(min: number | null, max: number | null, currency = 'USD', style: 'short' | 'range' = 'short') {
  const m = (n: number) => formatMoney(n, currency);
  if (min != null && max != null) {
    if (min === max) return m(max);
    return style === 'short' ? `Up to ${m(max)}` : `${m(min)} – ${m(max)}`;
  }
  if (max != null) return `Up to ${m(max)}`;
  if (min != null) return `From ${m(min)}`;
  return '';
}

export type DueTone = 'overdue' | 'soon' | 'normal';

/** A due date the way people say it: "Due today", "Due tomorrow", "Due Friday", "Due Sep 30", "3 days overdue". */
export function dueLabel(day: string | null | undefined): { label: string; tone: DueTone } | null {
  if (!day) return null;
  const days = differenceInCalendarDays(parseDay(day), new Date());
  if (days < 0) return { label: days === -1 ? 'Due yesterday' : `${-days} days overdue`, tone: 'overdue' };
  if (days === 0) return { label: 'Due today', tone: 'soon' };
  if (days === 1) return { label: 'Due tomorrow', tone: 'soon' };
  if (days < 7) return { label: `Due ${format(parseDay(day), 'EEEE')}`, tone: days <= 3 ? 'soon' : 'normal' };
  return { label: `Due ${shortDate(day)}`, tone: 'normal' };
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function initials(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] ?? '';
