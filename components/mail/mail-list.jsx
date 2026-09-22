'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Inbox, Search, Star, FileText, Loader2 } from 'lucide-react';
import { MailToolbar } from '@/components/mail/mail-toolbar';
import { MailRow } from '@/components/mail/mail-row';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useMessageList } from '@/hooks/use-messages';
import { useMailActions } from '@/hooks/use-mail-actions';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { usePreferences, useSession } from '@/hooks/use-session';
import { useUiStore } from '@/stores/ui-store';
import { useComposeStore } from '@/stores/compose-store';
import { threadHref, messageHref } from '@/utils/mail-routes';
import { useIsMobile } from '@/hooks/use-media-query';

/**
 * Virtualised, infinitely scrolling conversation list with bulk selection,
 * keyboard navigation and optimistic actions.
 */
export function MailList({ title, route, folder, folderReady, roles, folders, baseHref }) {
  const router = useRouter();
  const prefs = usePreferences();
  const { data: session } = useSession();
  const me = session?.user?.email;
  const isMobile = useIsMobile();
  const actions = useMailActions();
  const openCompose = useComposeStore((s) => s.open);

  const conversation =
    route.role === 'drafts' || route.role === 'starred'
      ? false
      : prefs?.inbox?.conversationView !== false;
  const pageSize = prefs?.inbox?.pageSize || 50;
  const showPreview = prefs?.inbox?.previewText !== false;

  const list = useMessageList({
    folder: folderReady ? folder : null,
    role: route.role === 'starred' ? 'starred' : undefined,
    query: route.query || undefined,
    conversation,
    pageSize,
    enabled: folderReady,
  });

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) || [], [list.data]);
  const total = list.data?.pages[0]?.total ?? 0;

  const selected = useUiStore((s) => s.selected);
  const toggleSelected = useUiStore((s) => s.toggleSelected);
  const selectMany = useUiStore((s) => s.selectMany);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const focusedIndex = useUiStore((s) => s.focusedIndex);
  const setFocusedIndex = useUiStore((s) => s.setFocusedIndex);

  useEffect(() => {
    clearSelection();
    setFocusedIndex(-1);
  }, [folder, route.query, route.role, clearSelection, setFocusedIndex]);

  const parentRef = useRef(null);
  const rowHeight = prefs?.appearance?.density === 'compact' ? 40 : isMobile ? 72 : 52;
  const virtualizer = useVirtualizer({
    count: items.length + (list.hasNextPage ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  // Infinite loading: fetch the next page when the sentinel row is visible.
  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (!last) return;
    if (last.index >= items.length - 1 && list.hasNextPage && !list.isFetchingNextPage)
      list.fetchNextPage();
  }, [virtualItems, items.length, list]);

  const openItem = useCallback(
    (item) => {
      if (!item) return;
      if (route.role === 'drafts') {
        openCompose({
          mode: 'draft',
          data: { draftUid: item.uid, __loadFrom: { folder: item.folder, uid: item.uid } },
        });
        return;
      }
      const target =
        item.type === 'thread'
          ? threadHref(baseHref, item.uids, item.folder)
          : messageHref(baseHref, item.uid, item.folder);
      router.push(target);
    },
    [router, baseHref, route.role, openCompose]
  );

  const uidsFor = (item) => (item.type === 'thread' ? item.uids : [item.uid]);
  const selectedItems = items.filter((i) => selected.has(i.id));
  const selectionByFolder = groupByFolder(selectedItems);

  const runOnSelection = (fn) => {
    for (const [f, uids] of Object.entries(selectionByFolder)) fn(f, uids);
  };

  // Keyboard shortcuts scoped to the list.
  const focused = items[focusedIndex];
  const targetItems = selectedItems.length ? selectedItems : focused ? [focused] : [];
  const targets = groupByFolder(targetItems);
  const forTargets = (fn) => () => {
    for (const [f, uids] of Object.entries(targets)) fn(f, uids);
  };
  useKeyboardShortcuts(
    {
      next: () => {
        const i = Math.min(items.length - 1, focusedIndex + 1);
        setFocusedIndex(i);
        virtualizer.scrollToIndex(i, { align: 'auto' });
      },
      previous: () => {
        const i = Math.max(0, focusedIndex - 1);
        setFocusedIndex(i);
        virtualizer.scrollToIndex(i, { align: 'auto' });
      },
      open: () => openItem(focused),
      select: () => focused && toggleSelected(focused.id),
      archive: forTargets(actions.archive),
      delete: forTargets(actions.trash),
      spam: forTargets(actions.spam),
      star: forTargets((f, uids) =>
        targetItems.every((i) => i.starred || i.flags?.flagged)
          ? actions.unstar(f, uids)
          : actions.star(f, uids)
      ),
      markRead: forTargets(actions.markRead),
      markUnread: forTargets(actions.markUnread),
      escape: () => clearSelection(),
    },
    { enabled: prefs?.shortcuts?.enabled !== false }
  );

  const emptyIcon =
    route.view === 'search'
      ? Search
      : route.role === 'starred'
        ? Star
        : route.role === 'drafts'
          ? FileText
          : Inbox;
  const emptyTitle =
    route.view === 'search'
      ? 'No results'
      : route.role === 'starred'
        ? 'No starred messages'
        : `Nothing in ${title}`;
  const emptyDescription =
    route.view === 'search'
      ? 'Try different keywords or operators like from:, subject: or has:attachment.'
      : route.role === 'inbox'
        ? "You're all caught up."
        : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="mail-list">
      <MailToolbar
        title={title}
        route={route}
        folder={folder}
        roles={roles}
        folders={folders}
        items={items}
        total={total}
        loaded={items.length}
        selectedCount={selectedItems.length}
        allSelected={items.length > 0 && selectedItems.length === items.length}
        onSelectAll={(checked) => (checked ? selectMany(items.map((i) => i.id)) : clearSelection())}
        onRefresh={() => list.refetch()}
        refreshing={list.isRefetching}
        onArchive={() => runOnSelection(actions.archive)}
        onTrash={() => runOnSelection(actions.trash)}
        onDeleteForever={() => runOnSelection(actions.deleteForever)}
        onSpam={() => runOnSelection(actions.spam)}
        onNotSpam={() => runOnSelection(actions.notSpam)}
        onRead={() => runOnSelection(actions.markRead)}
        onUnread={() => runOnSelection(actions.markUnread)}
        onMove={(dest) => runOnSelection((f, uids) => actions.move(f, uids, dest))}
        onStar={() => runOnSelection(actions.star)}
      />

      {list.isError ? (
        <ErrorState
          title="Unable to load messages"
          message={list.error?.message}
          onRetry={() => list.refetch()}
          retrying={list.isRefetching}
        />
      ) : list.isPending || !folderReady ? (
        <div className="space-y-px p-2" aria-busy="true" aria-label="Loading messages">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-3">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
      ) : (
        <div
          ref={parentRef}
          className="min-h-0 flex-1 scrollbar-thin overflow-y-auto overscroll-contain"
          role="list"
          aria-label={`${title} conversations`}
        >
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualItems.map((virtualRow) => {
              const item = items[virtualRow.index];
              if (!item) {
                return (
                  <div
                    key="loader"
                    className="text-muted-foreground absolute left-0 flex w-full items-center justify-center py-3 text-sm"
                    style={{ top: virtualRow.start, height: virtualRow.size }}
                  >
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading more…
                  </div>
                );
              }
              return (
                <div
                  key={item.id}
                  className="absolute left-0 w-full"
                  style={{ top: virtualRow.start, height: virtualRow.size }}
                >
                  <MailRow
                    item={item}
                    me={me}
                    selected={selected.has(item.id)}
                    focused={focusedIndex === virtualRow.index}
                    showPreview={showPreview}
                    isMobile={isMobile}
                    showFolder={route.role === 'starred' || route.view === 'search'}
                    onToggleSelect={() => toggleSelected(item.id)}
                    onOpen={() => openItem(item)}
                    onFocus={() => setFocusedIndex(virtualRow.index)}
                    onStar={(starred) =>
                      starred
                        ? actions.star(item.folder, uidsFor(item))
                        : actions.unstar(item.folder, uidsFor(item))
                    }
                    onArchive={() => actions.archive(item.folder, uidsFor(item))}
                    onTrash={() => actions.trash(item.folder, uidsFor(item))}
                    onToggleRead={(read) =>
                      read
                        ? actions.markRead(item.folder, uidsFor(item))
                        : actions.markUnread(item.folder, uidsFor(item))
                    }
                    dragPayload={{
                      folder: item.folder,
                      uids: selected.has(item.id)
                        ? selectedItems.filter((i) => i.folder === item.folder).flatMap(uidsFor)
                        : uidsFor(item),
                    }}
                    prefs={prefs}
                  />
                </div>
              );
            })}
          </div>
          {list.hasNextPage && !list.isFetchingNextPage ? (
            <div className="flex justify-center py-3">
              <Button variant="ghost" size="sm" onClick={() => list.fetchNextPage()}>
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function groupByFolder(items) {
  const out = {};
  for (const item of items) {
    const uids = item.type === 'thread' ? item.uids : [item.uid];
    if (!out[item.folder]) out[item.folder] = [];
    out[item.folder].push(...uids);
  }
  return out;
}
