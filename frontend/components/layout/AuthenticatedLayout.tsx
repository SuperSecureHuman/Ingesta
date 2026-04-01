import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { AppSidebar } from '@/components/layout/AppSidebar';
import AppBreadcrumb from '@/components/layout/Breadcrumb';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 px-4 bg-zinc-950/70 backdrop-blur-md border-b border-white/[0.06]">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4 opacity-30" />
          <AppBreadcrumb />
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
