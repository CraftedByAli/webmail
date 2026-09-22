'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Menu,
  Settings,
  LogOut,
  Moon,
  Sun,
  Monitor,
  Wifi,
  WifiOff,
  Activity,
  Users,
  HelpCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Logo } from '@/components/layout/logo';
import { SearchBar } from '@/components/search/search-bar';
import { IconButton } from '@/components/ui/icon-button';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiPost } from '@/utils/api-client';
import { useUiStore } from '@/stores/ui-store';
import { useUpdatePreferences } from '@/hooks/use-session';

export function TopBar({ user, isAdmin }) {
  const router = useRouter();
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const realtimeStatus = useUiStore((s) => s.realtimeStatus);
  const { theme, setTheme } = useTheme();
  const updatePrefs = useUpdatePreferences();

  async function logout() {
    try {
      await apiPost('/api/auth/logout');
    } catch {
      // Cookie cleared regardless
    }
    router.replace('/login');
    router.refresh();
  }

  function changeTheme(value) {
    setTheme(value);
    updatePrefs.mutate({ appearance: { theme: value } });
  }

  const statusLabel =
    {
      live: 'Real-time updates active',
      polling: 'Checking for mail periodically',
      connecting: 'Connecting…',
      offline: 'Offline',
    }[realtimeStatus] || '';

  return (
    <header className="border-border bg-surface flex h-14 shrink-0 items-center gap-2 border-b px-2 sm:px-4">
      <IconButton label="Open menu" className="md:hidden" onClick={toggleSidebar}>
        <Menu />
      </IconButton>
      <Link
        href="/mail/inbox"
        className="flex items-center gap-2 rounded-lg px-1 py-1 font-semibold tracking-tight md:min-w-[12rem]"
        aria-label="Webmail home"
      >
        <Logo className="h-8 w-8" />
        <span className="hidden sm:inline">Webmail</span>
      </Link>

      <div className="flex min-w-0 flex-1 justify-center px-1 sm:px-4">
        <SearchBar />
      </div>

      <div className="flex items-center gap-1">
        <span
          className="text-muted-foreground hidden items-center sm:flex"
          title={statusLabel}
          aria-label={statusLabel}
          role="status"
        >
          {realtimeStatus === 'live' ? (
            <Wifi className="text-success h-4 w-4" />
          ) : realtimeStatus === 'offline' ? (
            <WifiOff className="h-4 w-4" />
          ) : (
            <Activity className="h-4 w-4 opacity-60" />
          )}
        </span>
        <IconButton
          label="Keyboard shortcuts"
          shortcut="?"
          className="hidden sm:inline-flex"
          onClick={() => useUiStore.setState({ helpOpen: true })}
        >
          <HelpCircle />
        </IconButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="focus-visible:ring-ring ml-1 rounded-full focus-visible:ring-2 focus-visible:outline-none"
              aria-label="Account menu"
            >
              <Avatar address={{ address: user.email }} size="md" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="truncate text-sm font-normal">
              <span className="text-muted-foreground block text-xs">Signed in as</span>
              <span className="text-foreground block truncate font-medium">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings /> Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/contacts">
                <Users /> Contacts
              </Link>
            </DropdownMenuItem>
            {isAdmin ? (
              <DropdownMenuItem asChild>
                <Link href="/admin/diagnostics">
                  <Activity /> Diagnostics
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={changeTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun className="mr-2 h-4 w-4" /> Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="mr-2 h-4 w-4" /> Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor className="mr-2 h-4 w-4" /> System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={logout}>
              <LogOut /> Sign out
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={async () => {
                try {
                  await apiPost('/api/auth/logout-all');
                  router.replace('/login');
                } catch (e) {
                  toast.error(e.message);
                }
              }}
            >
              <LogOut /> Sign out everywhere
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
