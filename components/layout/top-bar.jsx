'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  PanelLeft,
  Settings,
  LogOut,
  Moon,
  Sun,
  Monitor,
  Activity,
  Users,
  Keyboard,
  WifiOff,
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { apiPost } from '@/utils/api-client';
import { useUiStore } from '@/stores/ui-store';
import { useUpdatePreferences } from '@/hooks/use-session';

/**
 * The brand block is exactly one sidebar wide, so search begins on the same
 * vertical axis as the message list below it.
 */
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
      // The cookie is cleared regardless; always land on the login screen.
    }
    router.replace('/login');
    router.refresh();
  }

  function changeTheme(value) {
    setTheme(value);
    updatePrefs.mutate({ appearance: { theme: value } });
  }

  return (
    <header
      data-chrome
      className="border-line bg-canvas flex h-12 shrink-0 items-center gap-2 border-b pr-2 pl-2 sm:pr-3"
    >
      <IconButton
        label="Show folders"
        className="md:hidden"
        onClick={toggleSidebar}
        tooltip={false}
      >
        <PanelLeft />
      </IconButton>

      <Link
        href="/mail/inbox"
        aria-label="Webmail — go to Inbox"
        className="focus-visible:outline-focus rounded-control flex h-8 shrink-0 items-center px-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 md:w-[calc(var(--rail-w)-0.5rem)]"
      >
        <Logo showText />
      </Link>

      <div className="md:pl-gutter flex min-w-0 flex-1 items-center">
        <SearchBar />
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {/* Connection state is surfaced only when it needs attention. */}
        {realtimeStatus === 'polling' || realtimeStatus === 'offline' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="status"
                className="text-fg-muted grid size-8 place-items-center"
                aria-label={
                  realtimeStatus === 'offline'
                    ? 'Offline — reconnecting'
                    : 'Live updates unavailable, checking for mail periodically'
                }
              >
                <WifiOff className="size-4" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {realtimeStatus === 'offline'
                ? 'Offline — reconnecting'
                : 'Checking for mail periodically'}
            </TooltipContent>
          </Tooltip>
        ) : null}

        <IconButton
          label="Keyboard shortcuts"
          shortcut="?"
          className="hidden sm:inline-flex"
          onClick={() => useUiStore.setState({ helpOpen: true })}
        >
          <Keyboard />
        </IconButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="hover:bg-hover focus-visible:outline-focus rounded-control ml-0.5 grid size-8 place-items-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              aria-label={`Account menu for ${user.email}`}
            >
              <Avatar address={{ address: user.email }} size="sm" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <div className="px-2 py-1.5">
              <p className="text-meta text-fg-muted">Signed in as</p>
              <p className="text-ui text-fg truncate font-medium">{user.email}</p>
            </div>
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
            <DropdownMenuLabel>Appearance</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={changeTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun /> Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon /> Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor /> System
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
