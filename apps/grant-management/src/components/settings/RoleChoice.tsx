import { ClipboardCheck, FolderKanban, ShieldCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@project/components/lib/utils';

export type Role = 'Admin' | 'Manager' | 'Reviewer';

export const ROLE_INFO: Record<Role, { icon: LucideIcon; summary: string; detail: string }> = {
  Admin: {
    icon: ShieldCheck,
    summary: 'Runs the workspace',
    detail: 'Everything a manager can do, plus organization settings, branding and who is on the team.',
  },
  Manager: {
    icon: FolderKanban,
    summary: 'Runs programs',
    detail: 'Forms, submissions, reviewer assignments, decisions, awards and email templates.',
  },
  Reviewer: {
    icon: ClipboardCheck,
    summary: 'Scores assigned applications',
    detail: 'Sees only the applications assigned to them. Volunteer reviewers sign in through the applicant portal.',
  },
};

/** Roles as cards that explain themselves, so nobody has to guess what "Manager" can do. */
export function RoleChoice({ value, onChange, roles, disabled, compact, name = 'Role' }: {
  value: Role;
  onChange: (role: Role) => void;
  roles: Role[];
  disabled?: boolean;
  compact?: boolean;
  name?: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className={cn('grid gap-2', roles.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      {roles.map(role => {
        const info = ROLE_INFO[role];
        const on = value === role;
        return (
          <button
            key={role}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(role)}
            onKeyDown={e => {
              const i = roles.indexOf(role);
              const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? roles[(i + 1) % roles.length] : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? roles[(i - 1 + roles.length) % roles.length] : null;
              if (next) {
                e.preventDefault();
                onChange(next);
                (e.currentTarget.parentElement?.querySelector(`[data-role="${next}"]`) as HTMLElement | null)?.focus();
              }
            }}
            data-role={role}
            tabIndex={on ? 0 : -1}
            className={cn(
              'flex min-w-0 flex-col items-start gap-1 rounded-lg border bg-background p-3 text-left transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
              on ? 'border-primary ring-1 ring-primary' : 'hover:border-foreground/25',
            )}
          >
            <span className="flex w-full items-center gap-2">
              <info.icon className={cn('h-3.5 w-3.5 shrink-0', on ? 'text-primary' : 'text-muted-foreground')} />
              <span className="text-[13px] font-medium">{role}</span>
              <span className={cn('ml-auto flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border', on ? 'border-primary bg-primary' : 'border-input')}>
                {on && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
              </span>
            </span>
            <span className="text-xs font-medium text-foreground/80">{info.summary}</span>
            {!compact && <span className="text-xs leading-relaxed text-muted-foreground">{info.detail}</span>}
          </button>
        );
      })}
    </div>
  );
}
