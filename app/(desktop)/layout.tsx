import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { DesktopProviders } from '@/components/desktop/DesktopProviders';
import type { SessionPayload } from '@/types/auth';

export default async function DesktopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  return (
    <DesktopProviders session={session}>
      {children}
    </DesktopProviders>
  );
}
