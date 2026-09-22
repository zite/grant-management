import { cn } from '@project/components/lib/utils';
import { initials } from '../../lib/format';

/**
 * Applicants get a quiet initials bubble rather than a colored one, so they
 * never read as teammates in a mixed list.
 */
export function ApplicantAvatar({ name, size = 24, className }: { name: string | null | undefined; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full border bg-subtle font-semibold leading-none text-muted-foreground', className)}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.38)) }}
    >
      {initials(name)}
    </span>
  );
}
