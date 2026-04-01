'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SettingsUsersTab from '@/components/settings/SettingsUsersTab';
import SettingsInvitesTab from '@/components/settings/SettingsInvitesTab';
import SettingsAuditTab from '@/components/settings/SettingsAuditTab';

export default function SettingsView() {
  return (
    <Tabs defaultValue="users" className="space-y-4">
      <TabsList className="bg-zinc-900 border border-border/50">
        <TabsTrigger value="users">Users</TabsTrigger>
        <TabsTrigger value="invites">Invites</TabsTrigger>
        <TabsTrigger value="audit">Audit Log</TabsTrigger>
        <TabsTrigger value="preferences" disabled>Preferences</TabsTrigger>
      </TabsList>

      <TabsContent value="users" className="mt-0">
        <SettingsUsersTab />
      </TabsContent>

      <TabsContent value="invites" className="mt-0">
        <SettingsInvitesTab />
      </TabsContent>

      <TabsContent value="audit" className="mt-0">
        <SettingsAuditTab />
      </TabsContent>
    </Tabs>
  );
}
