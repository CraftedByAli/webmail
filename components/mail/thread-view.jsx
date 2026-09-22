'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Archive,
  Trash2,
  ShieldAlert,
  MailOpen,
  FolderInput,
  Star,
  ChevronsDownUp,
  ChevronsUpDown,
  Inbox,
  Printer,
} from 'lucide-react';
import { apiGet } from '@/utils/api-client';
import { useThread } from '@/hooks/use-messages';
import { useFolders } from '@/hooks/use-folders';
import { useMailActions } from '@/hooks/use-mail-actions';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { usePreferences, useSession } from '@/hooks/use-session';
import { useComposeStore } from '@/stores/compose-store';
import { IconButton } from '@/components/ui/icon-button';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { MoveMenu } from '@/components/mail/move-menu';
import { MessageCard } from '@/components/mail/message-card';
import { QuickReply } from '@/components/mail/quick-reply';
import { threadKey } from '@/hooks/use-messages';

/**
 * Gmail-style conversation view: every message in the thread as a card, the
 * newest (and unread ones) expanded, with reply actions at the bottom.
 */
export function ThreadView({ folder, uids, messageUid, backHref, roles }) {
  const router = useRouter();
  const prefs = usePreferences();
  const { data: session } = useSession();
  const me = session?.user?.email;
  const actions = useMailActions();
  const { data: folderData } = useFolders();
  const openCompose = useComposeStore((s) => s.open);

  // Resolve a single message to its conversation when opened directly.
  const lookup = useQuery({
    queryKey: ['thread-lookup', folder, messageUid],
    queryFn: () => apiGet(`/api/mail/messages/${messageUid}/thread`, { folder }),
    enabled: !!messageUid && !uids,
    staleTime: 30_000,
  });
  const resolvedUids = uids || lookup.data?.messages?.map((m) => m.uid) || null;
  const thread = useThread(folder, resolvedUids || [], { enabled: !!resolvedUids });
  const data = thread.data || (messageUid && lookup.data) || null;
  const isLoading =
    (uids ? thread.isPending : lookup.isPending || (resolvedUids && thread.isPending)) && !data;
  const error = thread.error || lookup.error;

  const messages = useMemo(() => data?.messages || [], [data]);
  const [expanded, setExpanded] = useState(() => new Set());
  const [knownKeys, setKnownKeys] = useState('');
  const [activeUid, setActiveUid] = useState(null);

  // Expand unread + newest messages on first load, and any message that
  // arrives later (e.g. the reply we just sent) so it is visible immediately.
  // Computed during render (React's "adjust state on prop change" pattern)
  // so it never lags a frame behind the data.
  const keys = messages.map((m) => `${m.folder}:${m.uid}`);
  const keySignature = keys.join('|');
  if (messages.length > 0 && keySignature !== knownKeys) {
    const known = new Set(knownKeys ? knownKeys.split('|') : []);
    const first = known.size === 0;
    const next = new Set(expanded);
    messages.forEach((m, i) => {
      if (known.has(keys[i])) return;
      const isLast = i === messages.length - 1;
      if (first ? !m.flags.seen || isLast || (messageUid && m.uid === messageUid) : isLast)
        next.add(keys[i]);
    });
    setExpanded(next);
    setKnownKeys(keySignature);
    if (first) setActiveUid(messages[messages.length - 1]?.uid);
  }

  const allExpanded =
    messages.length > 0 && messages.every((m) => expanded.has(`${m.folder}:${m.uid}`));
  const toggleAll = () =>
    setExpanded(allExpanded ? new Set() : new Set(messages.map((m) => `${m.folder}:${m.uid}`)));
  const toggle = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const threadUidsInFolder = messages.filter((m) => m.folder === folder).map((m) => m.uid);
  const goBack = () => router.push(backHref);
  const isTrash = folder === roles?.trash;
  const isJunk = folder === roles?.junk;
  const starred = messages.some((m) => m.flags.flagged);

  const withBack = (fn) => async () => {
    const ok = await fn(folder, threadUidsInFolder);
    if (ok) goBack();
  };

  const latest = messages[messages.length - 1];
  const signature = session?.signatures?.find((s) => s.isDefault)?.html || '';
  const replyTo = (mode) => {
    const target = messages.find((m) => m.uid === activeUid) || latest;
    if (!target) return;
    openCompose({
      mode,
      data: { __loadFrom: { folder: target.folder, uid: target.uid, mode, signature } },
    });
  };

  useKeyboardShortcuts(
    {
      back: goBack,
      escape: goBack,
      archive: isTrash ? undefined : withBack(actions.archive),
      delete: withBack(actions.trash),
      spam: withBack(actions.spam),
      reply: () => replyTo('reply'),
      replyAll: () => replyTo('replyAll'),
      forward: () => replyTo('forward'),
      star: () =>
        starred
          ? actions.unstar(folder, threadUidsInFolder)
          : actions.star(folder, threadUidsInFolder),
      markUnread: withBack(actions.markUnread),
    },
    { enabled: prefs?.shortcuts?.enabled !== false }
  );

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <ThreadToolbar onBack={goBack} />
        <ErrorState
          title="Unable to open this conversation"
          message={error.message}
          onRetry={() => (uids ? thread.refetch() : lookup.refetch())}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="thread-view">
      <ThreadToolbar onBack={goBack}>
        {!isTrash ? (
          <IconButton label="Archive" shortcut="e" onClick={withBack(actions.archive)}>
            <Archive />
          </IconButton>
        ) : null}
        {isJunk ? (
          <IconButton label="Not spam" onClick={withBack(actions.notSpam)}>
            <Inbox />
          </IconButton>
        ) : (
          <IconButton label="Report spam" shortcut="!" onClick={withBack(actions.spam)}>
            <ShieldAlert />
          </IconButton>
        )}
        {isTrash ? (
          <>
            <IconButton label="Move to Inbox" onClick={withBack(actions.restore)}>
              <Inbox />
            </IconButton>
            <IconButton label="Delete forever" onClick={withBack(actions.deleteForever)}>
              <Trash2 />
            </IconButton>
          </>
        ) : (
          <IconButton label="Delete" shortcut="#" onClick={withBack(actions.trash)}>
            <Trash2 />
          </IconButton>
        )}
        <span className="bg-border mx-1 h-5 w-px" />
        <IconButton label="Mark as unread" shortcut="⇧U" onClick={withBack(actions.markUnread)}>
          <MailOpen />
        </IconButton>
        <MoveMenu
          folders={folderData?.folders}
          currentFolder={folder}
          onMove={(dest) =>
            actions.move(folder, threadUidsInFolder, dest).then((ok) => ok && goBack())
          }
        >
          <IconButton label="Move to">
            <FolderInput />
          </IconButton>
        </MoveMenu>
        <IconButton
          label={starred ? 'Unstar' : 'Star'}
          shortcut="s"
          onClick={() =>
            starred
              ? actions.unstar(folder, threadUidsInFolder)
              : actions.star(folder, threadUidsInFolder)
          }
        >
          <Star className={starred ? 'fill-star text-star' : ''} />
        </IconButton>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton
            label="Print"
            className="hidden sm:inline-flex"
            onClick={() => window.print()}
          >
            <Printer />
          </IconButton>
          {messages.length > 1 ? (
            <IconButton label={allExpanded ? 'Collapse all' : 'Expand all'} onClick={toggleAll}>
              {allExpanded ? <ChevronsDownUp /> : <ChevronsUpDown />}
            </IconButton>
          ) : null}
        </div>
      </ThreadToolbar>

      <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-40 w-full rounded-2xl" />
              <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
          ) : (
            <>
              <h1
                className="mb-4 flex flex-wrap items-center gap-2 text-xl leading-snug font-semibold sm:text-2xl"
                data-testid="thread-subject"
              >
                {data?.subject || '(no subject)'}
                {messages.length > 1 ? (
                  <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                    {messages.length}
                  </span>
                ) : null}
              </h1>
              <ol className="space-y-3">
                {messages.map((m, index) => {
                  const key = `${m.folder}:${m.uid}`;
                  return (
                    <li key={key}>
                      <MessageCard
                        summary={m}
                        me={me}
                        expanded={expanded.has(key)}
                        isLast={index === messages.length - 1}
                        onToggle={() => toggle(key)}
                        onActivate={() => setActiveUid(m.uid)}
                        onReply={() =>
                          openCompose({
                            mode: 'reply',
                            data: {
                              __loadFrom: {
                                folder: m.folder,
                                uid: m.uid,
                                mode: 'reply',
                                signature,
                              },
                            },
                          })
                        }
                        onReplyAll={() =>
                          openCompose({
                            mode: 'replyAll',
                            data: {
                              __loadFrom: {
                                folder: m.folder,
                                uid: m.uid,
                                mode: 'replyAll',
                                signature,
                              },
                            },
                          })
                        }
                        onForward={() =>
                          openCompose({
                            mode: 'forward',
                            data: {
                              __loadFrom: {
                                folder: m.folder,
                                uid: m.uid,
                                mode: 'forward',
                                signature,
                              },
                            },
                          })
                        }
                        onTrash={() =>
                          actions
                            .trash(m.folder, [m.uid])
                            .then((ok) => ok && messages.length === 1 && goBack())
                        }
                        onMarkUnread={() => actions.markUnread(m.folder, [m.uid])}
                        onStar={(v) =>
                          v ? actions.star(m.folder, [m.uid]) : actions.unstar(m.folder, [m.uid])
                        }
                        prefs={prefs}
                        threadKey={threadKey(folder, resolvedUids || [])}
                      />
                    </li>
                  );
                })}
              </ol>
              {latest ? (
                <QuickReply
                  message={latest}
                  me={me}
                  defaultReplyAll={prefs?.general?.replyBehavior === 'replyAll'}
                  onReply={() => replyTo('reply')}
                  onReplyAll={() => replyTo('replyAll')}
                  onForward={() => replyTo('forward')}
                />
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadToolbar({ onBack, children }) {
  return (
    <div
      className="border-border flex h-12 shrink-0 items-center gap-0.5 border-b px-2 sm:px-3"
      role="toolbar"
      aria-label="Conversation actions"
    >
      <IconButton label="Back to list" shortcut="u" onClick={onBack} data-testid="back-button">
        <ArrowLeft />
      </IconButton>
      <span className="bg-border mx-1 h-5 w-px" />
      {children}
    </div>
  );
}

export function ThreadActionsPlaceholder() {
  return <Button variant="ghost">…</Button>;
}
