import { LockKeyhole } from 'lucide-react';
import { useSession } from '../lib/auth';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { Button, Container, LinkButton } from './ui';

/** Shown in place of a page that needs an account, with a way straight back after signing in. */
export function SignInPrompt({ title = 'Sign in to continue', body, hashPath }: { title?: string; body?: string; hashPath?: string }) {
  const { signIn } = useSession();
  useDocumentTitle('Sign in');
  return (
    <Container size="narrow" className="py-16 sm:py-24">
      <div className="mx-auto max-w-md rounded-xl border bg-card p-8 text-center shadow-sm animate-fade-up">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
          <LockKeyhole className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-5 font-serif text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {body ?? 'Sign in with your email to start an application, save your progress, and check on anything you’ve submitted. It’s free, and new here is fine — we’ll set you up.'}
        </p>
        <Button size="lg" className="mt-6 w-full" onClick={() => signIn(hashPath)}>
          Sign in or create an account
        </Button>
        <LinkButton to="/" variant="ghost" className="mt-2 w-full">
          Browse programs
        </LinkButton>
      </div>
    </Container>
  );
}
