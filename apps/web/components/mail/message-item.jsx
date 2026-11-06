'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Reply,
  ReplyAll,
  Forward,
  MoreVertical,
  Star,
  Trash2,
  MailOpen,
  Paperclip,
  ChevronDown,
  Image as ImageIcon,
  ImageOff,
  Printer,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import { InlineError } from '@/components/ui/error-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MessageBody } from '@/components/mail/message-body';
import { AttachmentList } from '@/components/mail/attachment-list';
import { useMessage } from '@/hooks/use-messages';
import { formatFullDate, formatListDate } from '@/utils/format';
import { cn } from '@/utils/cn';

/**
 * One message inside a conversation.
 *
 * A thread is a document, not a deck of cards: messages are separated by a
 * hairline and share one vertical axis. Collapsed messages compress to a single
 * row with the same rhythm as the message list, so scanning a long thread feels
 * identical to scanning the inbox. The body loads only when expanded.
 */
export function MessageItem({
  summary,
  me,
  expanded,
  isOnly,
  onToggle,
  onActivate,
  onReply,
  onReplyAll,
  onForward,
  onTrash,
  onMarkUnread,
  onStar,
  prefs,
  threadKey,
}) {
  const [images, setImages] = useState(!!prefs?.inbox?.autoLoadImages);
  const [showDetails, setShowDetails] = useState(false);
  const queryClient = useQueryClient();
  const message = useMessage(summary.folder, summary.uid, { images, enabled: expanded });
  const data = message.data;

  // Reflect the server's auto-mark-read back into the thread + list caches.
  useEffect(() => {
    if (data && !summary.flags.seen && data.flags?.seen) {
      queryClient.setQueryData(threadKey, (old) =>
        old
          ? {
              ...old,
              messages: old.messages.map((m) =>
                m.uid === summary.uid && m.folder === summary.folder
                  ? { ...m, flags: { ...m.flags, seen: true } }
                  : m
              ),
            }
          : old
      );
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    }
  }, [data, summary, queryClient, threadKey]);

  const from = summary.from;
  const isMe = from?.address === me;
  const fromLabel = isMe ? 'me' : from?.name || from?.address || 'Unknown sender';
  const starred = summary.flags.flagged;

  if (!expanded) {
    return (
      <article
        className={cn(
          'group border-line border-t first:border-t-0',
          !summary.flags.seen && 'bg-accent-subtle/40'
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded="false"
          className="row-h hover:bg-hover focus-visible:outline-focus rounded-control -mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 px-2 text-left transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
        >
          <Avatar address={from} size="sm" />
          <span
            className={cn(
              'text-ui shrink-0 truncate',
              summary.flags.seen ? 'text-fg' : 'text-fg font-semibold'
            )}
          >
            {fromLabel}
          </span>
          <span className="text-ui text-fg-muted min-w-0 flex-1 truncate">{summary.preview}</span>
          {summary.hasAttachment ? (
            <Paperclip className="text-fg-muted size-3.5 shrink-0" aria-label="Has attachment" />
          ) : null}
          {starred ? (
            <Star className="fill-star text-star size-3.5 shrink-0" aria-label="Starred" />
          ) : null}
          <time
            className="text-caption text-fg-muted shrink-0"
            dateTime={summary.date || undefined}
          >
            {formatListDate(summary.date, prefs?.general)}
          </time>
        </button>
      </article>
    );
  }

  return (
    <article
      className="border-line border-t first:border-t-0"
      aria-label={`Message from ${fromLabel}`}
      onFocusCapture={onActivate}
      onClickCapture={onActivate}
    >
      <header className="flex items-start gap-3 pt-4 pb-3">
        <Avatar address={from} size="lg" className="mt-0.5" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded="true"
              className="text-body text-fg focus-visible:outline-focus truncate font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {fromLabel}
            </button>
            {from?.address && !isMe ? (
              <span className="text-caption text-fg-muted hidden truncate sm:inline">
                {from.address}
              </span>
            ) : null}
            <time
              className="text-caption text-fg-muted ml-auto shrink-0"
              dateTime={summary.date || undefined}
              title={formatFullDate(summary.date, prefs?.general)}
            >
              {formatFullDate(summary.date, prefs?.general)}
            </time>
          </div>

          <button
            type="button"
            className="text-caption text-fg-muted hover:text-fg-secondary focus-visible:outline-focus mt-0.5 flex items-center gap-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
          >
            <span className="truncate">to {recipientsShort(summary.to, me)}</span>
            <ChevronDown
              className={cn(
                'size-3 transition-transform duration-100',
                showDetails && 'rotate-180'
              )}
            />
          </button>

          {showDetails ? (
            <dl className="text-caption mt-2 grid grid-cols-[3.25rem_1fr] gap-x-3 gap-y-1">
              <Detail label="From" value={addressText(from)} />
              <Detail label="To" value={(summary.to || []).map(addressText).join(', ')} />
              {summary.cc?.length ? (
                <Detail label="Cc" value={summary.cc.map(addressText).join(', ')} />
              ) : null}
              {data?.replyTo?.length ? (
                <Detail label="Reply-to" value={data.replyTo.map(addressText).join(', ')} />
              ) : null}
              <Detail label="Date" value={formatFullDate(summary.date, prefs?.general)} />
              {summary.messageId ? <Detail label="ID" value={summary.messageId} mono /> : null}
            </dl>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 print:hidden">
          <IconButton
            label={starred ? 'Unstar message' : 'Star message'}
            size="icon-sm"
            onClick={() => onStar(!starred)}
          >
            <Star className={cn(starred && 'fill-star text-star')} />
          </IconButton>
          <IconButton label="Reply" shortcut="R" size="icon-sm" onClick={onReply}>
            <Reply />
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More message actions">
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onReply}>
                <Reply /> Reply
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onReplyAll}>
                <ReplyAll /> Reply all
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onForward}>
                <Forward /> Forward
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onMarkUnread}>
                <MailOpen /> Mark as unread
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setImages((v) => !v)}>
                {images ? <ImageOff /> : <ImageIcon />}
                {images ? 'Hide remote images' : 'Load remote images'}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => window.print()}>
                <Printer /> Print
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={onTrash}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="pb-5 sm:pl-12">
        {message.isPending ? (
          <div className="grid gap-2 py-1" aria-busy="true">
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ) : message.isError ? (
          <InlineError
            message="This message could not be loaded."
            onRetry={() => message.refetch()}
          />
        ) : (
          <>
            {data.body.blockedImages > 0 && !images ? (
              <p className="text-caption text-fg-secondary mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>External images were blocked to protect your privacy.</span>
                <button
                  type="button"
                  onClick={() => setImages(true)}
                  className="text-accent-text hover:text-accent-hover focus-visible:outline-focus font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Show images
                </button>
              </p>
            ) : null}

            {data.truncated ? (
              <p className="text-caption text-fg-muted mb-3">
                This message is unusually large and has been shortened.
              </p>
            ) : null}

            <MessageBody body={data.body} allowExternal={images} />

            {data.attachments?.length ? <AttachmentList attachments={data.attachments} /> : null}

            {!isOnly ? (
              <div className="mt-5 flex gap-2 print:hidden">
                <Button variant="default" size="sm" onClick={onReply}>
                  <Reply /> Reply
                </Button>
                <Button variant="ghost" size="sm" onClick={onForward}>
                  <Forward /> Forward
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

function Detail({ label, value, mono }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className={cn('text-fg-secondary min-w-0 break-words', mono && 'text-meta font-mono')}>
        {value}
      </dd>
    </>
  );
}

function recipientsShort(list, me) {
  if (!list || list.length === 0) return 'me';
  const names = list.map((a) => (a.address === me ? 'me' : a.name?.split(' ')[0] || a.address));
  return names.length > 3
    ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
    : names.join(', ');
}

function addressText(a) {
  if (!a) return '';
  return a.name ? `${a.name} <${a.address}>` : a.address;
}
