import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { formatMoney } from '@project/shared/forms/logic';
import type { Bootstrap, EmailTemplate, FormMeta, Label, Member, Program, Rubric, SavedView, Stage } from './types';

/**
 * The reference data every screen renders names from, indexed once.
 *
 * Submission rows carry ids; this is where those ids become a stage chip, an
 * avatar or a program name. One memoised context is what lets an optimistic
 * edit re-render every surface from a single cache write.
 */
export type Workspace = Bootstrap & {
  isManager: boolean;
  isAdmin: boolean;
  programById: Map<string, Program>;
  programByKey: Map<string, Program>;
  stageById: Map<string, Stage>;
  stagesByProgram: Map<string, Stage[]>;
  rubricById: Map<string, Rubric>;
  memberById: Map<string, Member>;
  labelById: Map<string, Label>;
  formById: Map<string, FormMeta>;
  templateById: Map<string, EmailTemplate>;
  viewById: Map<string, SavedView>;
  /** Active programs first (open, closing, scheduled), then closed and drafts; archived last. */
  orderedPrograms: Program[];
  activeMembers: Member[];
  /** People who can own submissions. */
  managers: Member[];
  stagesFor: (programId: string | null | undefined) => Stage[];
  labelsFor: (programId: string | null | undefined) => Label[];
  reviewerPool: (programId: string | null | undefined) => Member[];
  programManagers: (programId: string | null | undefined) => Member[];
  money: (n: number | null | undefined, opts?: { compact?: boolean }) => string;
  reference: (programId: string, number: number | null | undefined) => string;
};

const WorkspaceContext = createContext<Workspace | null>(null);

const PHASE_ORDER: Record<string, number> = { open: 0, closing: 0, scheduled: 1, draft: 2, closed: 3, archived: 4 };

export function buildWorkspace(data: Bootstrap): Workspace {
  const byId = <T extends { id: string }>(items: T[]) => new Map(items.map(i => [i.id, i]));
  const stagesByProgram = new Map<string, Stage[]>();
  for (const s of data.stages) {
    if (!stagesByProgram.has(s.programId)) stagesByProgram.set(s.programId, []);
    stagesByProgram.get(s.programId)!.push(s);
  }
  for (const list of stagesByProgram.values()) list.sort((a, b) => a.position - b.position);
  const memberById = byId(data.members);
  const activeMembers = data.members.filter(m => m.status !== 'Deactivated');
  const managers = activeMembers.filter(m => m.role === 'Admin' || m.role === 'Manager');
  const currency = data.settings.currency || 'USD';
  const programById = byId(data.programs);
  const orderedPrograms = [...data.programs].sort((a, b) => (PHASE_ORDER[a.phase] ?? 5) - (PHASE_ORDER[b.phase] ?? 5) || a.position - b.position);

  return {
    ...data,
    isManager: data.me.role === 'Admin' || data.me.role === 'Manager',
    isAdmin: data.me.role === 'Admin',
    programById,
    programByKey: new Map(data.programs.map(p => [p.key.toUpperCase(), p])),
    stageById: byId(data.stages),
    stagesByProgram,
    rubricById: byId(data.rubrics),
    memberById,
    labelById: byId(data.labels),
    formById: byId(data.forms),
    templateById: byId(data.templates),
    viewById: byId(data.views),
    orderedPrograms,
    activeMembers,
    managers,
    stagesFor: programId => (programId ? stagesByProgram.get(programId) ?? [] : []),
    labelsFor: programId => data.labels.filter(l => !l.programId || l.programId === programId),
    reviewerPool: programId => {
      if (!programId) return activeMembers;
      const ids = new Set(data.programMembers.filter(pm => pm.programId === programId && pm.role === 'Reviewer').map(pm => pm.memberId));
      return activeMembers.filter(m => ids.has(m.id));
    },
    programManagers: programId => {
      if (!programId) return managers;
      const p = programById.get(programId);
      const ids = new Set(data.programMembers.filter(pm => pm.programId === programId && pm.role === 'Manager').map(pm => pm.memberId));
      if (p?.ownerId) ids.add(p.ownerId);
      return managers.filter(m => ids.has(m.id));
    },
    money: (n, opts) => formatMoney(n ?? 0, currency, opts),
    reference: (programId, number) => (number ? `${programById.get(programId)?.key ?? 'APP'}-${number}` : 'Draft'),
  };
}

export function WorkspaceProvider({ data, children }: { data: Bootstrap; children: ReactNode }) {
  const value = useMemo(() => buildWorkspace(data), [data]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ws = useContext(WorkspaceContext);
  if (!ws) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ws;
}
