'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Library, Film, Settings, LogOut, User } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@/hooks/useAuth';

export function AppSidebar() {
  const { currentUser } = useAppContext();
  const { logout } = useAuth();
  const pathname = usePathname();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-white/[0.06]">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2">
          <span className="text-primary font-bold text-base">▶</span>
          <span className="font-semibold tracking-tight text-sm group-data-[collapsible=icon]:hidden">Ingesta</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Library</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href="/" />}
                isActive={pathname === '/'}
                tooltip="Libraries"
              >
                <Library className="h-4 w-4" />
                <span>Libraries</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href="/projects" />}
                isActive={pathname === '/projects'}
                tooltip="Projects"
              >
                <Film className="h-4 w-4" />
                <span>Projects</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {currentUser?.role === 'admin' && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link href="/settings" />}
                  isActive={pathname === '/settings'}
                  tooltip="Settings"
                >
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="pb-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<div />} nativeButton={false} className="w-full">
                <SidebarMenuButton className="h-10">
                  <Avatar className="h-5 w-5 shrink-0">
                    <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                      {currentUser?.username
                        ? currentUser.username.slice(0, 2).toUpperCase()
                        : <User className="h-3 w-3" />
                      }
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm">{currentUser?.username}</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-52">
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
