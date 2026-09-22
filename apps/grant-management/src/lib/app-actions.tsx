import { createContext, useContext } from 'react';
import type { Submission } from './types';

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
};

/** The minimum a dialog needs to act on submissions — list rows and the detail page both satisfy it. */
export type SubmissionTarget = Pick<Submission, 'id' | 'reference' | 'title' | 'programId' | 'status' | 'stageId' | 'applicantName' | 'applicantEmail' | 'requestedAmount' | 'awardAmount' | 'notifiedAt' | 'applicantId'>;

export type DecisionIntent = 'Accepted' | 'Waitlisted' | 'Declined' | 'release' | 'reopen';

/**
 * App-wide actions any screen can trigger. The dialogs themselves live once in
 * the shell, so a decision made from a list, a board card, the detail page or
 * the command palette is the same flow.
 */
export type AppActions = {
  openPeek: (idOrRef: string) => void;
  closePeek: () => void;
  peekId: string | null;
  openPalette: (initialQuery?: string) => void;
  openShortcuts: () => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  openDecision: (targets: SubmissionTarget[], intent: DecisionIntent) => void;
  openAssignReviewers: (targets: SubmissionTarget[]) => void;
  openCompose: (targets: SubmissionTarget[], opts?: { templateId?: string; subject?: string; body?: string }) => void;
  openCreateProgram: () => void;
  openAddSubmission: (programId?: string) => void;
  /** The program the current screen is about, so create actions default sensibly. */
  setContextProgram: (programId: string | null) => void;
  contextProgramId: string | null;
};

export const AppActionsContext = createContext<AppActions | null>(null);

export function useAppActions() {
  const ctx = useContext(AppActionsContext);
  if (!ctx) throw new Error('useAppActions must be used inside AppShell');
  return ctx;
}
