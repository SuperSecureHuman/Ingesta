'use client';

import SettingsView from '@/components/views/SettingsView';
import { PageSpinner } from '@/components/ui/PageSpinner';
import { useRequireAuth } from '@/hooks/useRequireAuth';

export default function SettingsPage() {
  const { isLoading } = useRequireAuth('admin');

  if (isLoading) {
    return <PageSpinner />;
  }

  return (
    <div className="p-6">
      <SettingsView />
    </div>
  );
}
