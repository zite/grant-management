import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Portal } from './queries';

/** "Page · Organization", so a tab full of portals is still findable. */
export function useDocumentTitle(title: string | null | undefined) {
  const qc = useQueryClient();
  const org = qc.getQueryData<Portal>(['portal', 'site'])?.settings.organizationName;
  useEffect(() => {
    const suffix = org ? `${org}` : 'Applicant portal';
    document.title = title ? `${title} · ${suffix}` : suffix;
  }, [title, org]);
}
