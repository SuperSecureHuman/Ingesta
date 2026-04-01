'use client';

import { useAppContext } from '@/context/AppContext';
import AuthenticatedLayout from '@/components/layout/AuthenticatedLayout';

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAppContext();

  if (!currentUser) {
    return <>{children}</>;
  }

  return <AuthenticatedLayout>{children}</AuthenticatedLayout>;
}
