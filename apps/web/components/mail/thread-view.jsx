'use client';

import { useMemo, useState } from 'react';
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
import { useApi } from '@/hooks/use-account';
import { useThread, threadKey } from '@/hooks/use-messages';
import { useFolders } from '@/hooks/use-folders';
import { useMailActions } from '@/hooks/use-mail-actions';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { usePreferences, useSession } from '@/hooks/use-session';
import { useComposeStore } from '@/stores/compose-store';
import { IconButton } from '@/components/ui/icon-button';
import { ToolbarDivider } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { MoveMenu } from '@/components/mail/move-menu';
import { MessageItem } from '@/components/mail/message-item';
import { QuickReply } from '@/components/mail/quick-reply';

/**
 * A conversation reads as one continuous document: title, then messages
 * separated by hairlines, then the reply actions. Unread messages and the most
 * recent message open automatically; everything else collapses to a single row.
 */
export function ThreadView({ folder, uids, messageUid, backHref, roles }) {
  const api = useApi();
  const router = useRouter();
  const prefs = usePreferences();
  const { data: session } = useSession();
  const me = session?.user?.email;
  const actions = useMailActions();
  const { data: folderData } = useFolders();
  const openCompose = useComposeStore((s) => s.open);

  // Opening a single message resolves its conversation first.
  const lookup = useQuery({
    queryKey: ['thread-lookup', folder, messageUid],
    queryFn: () => api.get(`/api/mail/messages/${messageUid}/thread`, { folder }),
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

  // Open unread + newest on first load, and anything that arrives later (such
  // as the reply we just sent). Derived during render so it never lags a frame.
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
  const toggleAll = () => setExpanded(allExpanded ? new Set() : new Set(keys));
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
  const composeFrom = (mode, target) => {
    const source = target || messages.find((m) => m.uid === activeUid) || latest;
    if (!source) return;
    openCompose({
      mode,
      data: { __loadFrom: { folder: source.folder, uid: source.uid, mode, signature } },
    });
  };

  useKeyboardShortcuts(
    {
      back: goBack,
      escape: goBack,
      archive: isTrash ? undefined : withBack(actions.archive),
      delete: withBack(actions.trash),
      spam: withBack(actions.spam),
      reply: () => composeFrom('reply'),
      replyAll: () => composeFrom('replyAll'),
      forward: () => composeFrom('forward'),
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
      <div className="bg-surface flex h-full flex-col">
        <Toolbar onBack={goBack} />
        <ErrorState
          title="This conversation could not be opened"
          message={error.message}
          onRetry={() => (uids ? thread.refetch() : lookup.refetch())}
        />
      </div>
    );
  }

  return (
    <div className="bg-surface flex h-full min-h-0 flex-col" data-testid="thread-view">
      <Toolbar onBack={goBack}>
        {!isTrash ? (
          <IconButton label="Archive" shortcut="E" onClick={withBack(actions.archive)}>
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
        <ToolbarDivider />
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
          label={starred ? 'Unstar conversation' : 'Star conversation'}
          shortcut="S"
          onClick={() =>
            starred
              ? actions.unstar(folder, threadUidsInFolder)
              : actions.star(folder, threadUidsInFolder)
          }
        >
          <Star className={starred ? 'fill-star text-star' : undefined} />
        </IconButton>

        <div className="ml-auto flex items-center gap-0.5">
          <IconButton
            label="Print conversation"
            className="hidden sm:inline-flex"
            onClick={() => window.print()}
          >
            <Printer />
          </IconButton>
          {messages.length > 1 ? (
            <IconButton
              label={allExpanded ? 'Collapse all messages' : 'Expand all messages'}
              onClick={toggleAll}
            >
              {allExpanded ? <ChevronsDownUp /> : <ChevronsUpDown />}
            </IconButton>
          ) : null}
        </div>
      </Toolbar>

      <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto">
        <div className="px-gutter mx-auto w-full max-w-4xl pt-5 pb-16">
          {isLoading ? (
            <div className="grid gap-4">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-3 w-40" />
              <div className="grid gap-2 pt-6">
                <Skeleton className="h-3 w-11/12" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            </div>
          ) : (
            <>
              <header className="pb-4">
                <h1 className="text-display text-fg font-semibold" data-testid="thread-subject">
                  {data?.subject || '(no subject)'}
                </h1>
                {messages.length > 1 ? (
                  <p className="text-caption text-fg-muted mt-1">
                    {messages.length} messages in this conversation
                  </p>
                ) : null}
              </header>

              <div className="border-line border-b">
                {messages.map((m, index) => {
                  const key = `${m.folder}:${m.uid}`;
                  return (
                    <MessageItem
                      key={key}
                      summary={m}
                      me={me}
                      expanded={expanded.has(key)}
                      isOnly={index === messages.length - 1}
                      onToggle={() => toggle(key)}
                      onActivate={() => setActiveUid(m.uid)}
                      onReply={() => composeFrom('reply', m)}
                      onReplyAll={() => composeFrom('replyAll', m)}
                      onForward={() => composeFrom('forward', m)}
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
                  );
                })}
              </div>

              {latest ? (
                <QuickReply
                  message={latest}
                  me={me}
                  defaultReplyAll={prefs?.general?.replyBehavior === 'replyAll'}
                  onReply={() => composeFrom('reply')}
                  onReplyAll={() => composeFrom('replyAll')}
                  onForward={() => composeFrom('forward')}
                />
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Toolbar({ onBack, children }) {
  return (
    <div
      data-chrome
      className="border-line bg-canvas px-gutter flex h-11 shrink-0 items-center gap-0.5 border-b"
      role="toolbar"
      aria-label="Conversation actions"
    >
      <IconButton label="Back to list" shortcut="U" onClick={onBack} data-testid="back-button">
        <ArrowLeft />
      </IconButton>
      <ToolbarDivider />
      {children}
    </div>
  );
}
