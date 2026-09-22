import { Hammer } from 'lucide-react';
import { EmptyState } from '../primitives/bits';
import { PageHeader, useDocumentTitle } from './PageHeader';

/** A page that is being built. Replaced area by area. */
export function Placeholder({ title }: { title: string }) {
  useDocumentTitle(title);
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={<Hammer />} title={title} description="This screen is coming together." />
    </>
  );
}
