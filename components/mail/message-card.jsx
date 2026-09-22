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
  ChevronUp,
  ImageOff,
  Image as ImageIcon,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
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
 * A single message inside a conversation. Loads its body lazily when
 * expanded; collapsed cards only show the header line.
 */
export function MessageCard({
  summary,
  me,
  expanded,
  isLast,
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

  // Once the server auto-marked the message read, reflect it in the thread cache.
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
  const fromLabel = isMe ? 'me' : from?.name || from?.address || '(unknown)';
  const starred = summary.flags.flagged;

  return (
    <article
      className={cn(
        'border-border bg-card shadow-soft rounded-2xl border transition-shadow',
        expanded ? 'shadow-soft' : 'hover:bg-muted/40'
      )}
      aria-label={`Message from ${fromLabel}`}
      onFocusCapture={onActivate}
      onClickCapture={onActivate}
    >
      <header
        className={cn(
          'flex cursor-pointer items-start gap-3 px-4 py-3',
          !expanded && 'items-center'
        )}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => e.key === 'Enter' && onToggle()}
      >
        <Avatar address={from} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'truncate text-sm font-semibold',
                !summary.flags.seen && 'text-foreground'
              )}
            >
              {fromLabel}
            </span>
            {expanded && from?.address && !isMe ? (
              <span className="text-muted-foreground hidden truncate text-xs sm:inline">
                &lt;{from.address}&gt;
              </span>
            ) : null}
            <span className="text-muted-foreground ml-auto flex shrink-0 items-center gap-1 text-xs">
              {summary.hasAttachment ? (
                <Paperclip className="h-3.5 w-3.5" aria-label="Has attachment" />
              ) : null}
              <time
                dateTime={summary.date || undefined}
                title={formatFullDate(summary.date, prefs?.general)}
              >
                {expanded
                  ? formatFullDate(summary.date, prefs?.general)
                  : formatListDate(summary.date, prefs?.general)}
              </time>
            </span>
          </div>
          {expanded ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground mt-0.5 flex items-center gap-1 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setShowDetails((v) => !v);
              }}
              aria-expanded={showDetails}
            >
              to {recipientsShort(summary.to, me)}
              {showDetails ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          ) : (
            <p className="text-muted-foreground truncate text-sm">
              {summary.preview || data?.body?.text?.slice(0, 120) || ''}
            </p>
          )}
          {expanded && showDetails ? (
            <dl className="bg-muted/60 mt-2 grid grid-cols-[3.5rem_1fr] gap-x-2 gap-y-0.5 rounded-lg p-2 text-xs">
              <dt className="text-muted-foreground">From</dt>
              <dd className="break-all">{addressText(from)}</dd>
              <dt className="text-muted-foreground">To</dt>
              <dd className="break-all">{(summary.to || []).map(addressText).join(', ')}</dd>
              {summary.cc?.length ? (
                <>
                  <dt className="text-muted-foreground">Cc</dt>
                  <dd className="break-all">{summary.cc.map(addressText).join(', ')}</dd>
                </>
              ) : null}
              {data?.replyTo?.length ? (
                <>
                  <dt className="text-muted-foreground">Reply-To</dt>
                  <dd className="break-all">{data.replyTo.map(addressText).join(', ')}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Date</dt>
              <dd>{formatFullDate(summary.date, prefs?.general)}</dd>
              {summary.messageId ? (
                <>
                  <dt className="text-muted-foreground">ID</dt>
                  <dd className="font-mono break-all">{summary.messageId}</dd>
                </>
              ) : null}
            </dl>
          ) : null}
        </div>
        {expanded ? (
          <div
            className="flex shrink-0 items-center gap-0.5 print:hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              label={starred ? 'Unstar' : 'Star'}
              size="icon-sm"
              onClick={() => onStar(!starred)}
            >
              <Star className={cn('h-4 w-4', starred && 'fill-star text-star')} />
            </IconButton>
            <IconButton label="Reply" shortcut="r" size="icon-sm" onClick={onReply}>
              <Reply />
            </IconButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More actions">
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
                  {images ? <ImageOff /> : <ImageIcon />}{' '}
                  {images ? 'Hide remote images' : 'Load remote images'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={onTrash}
                >
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </header>

      {expanded ? (
        <div className="border-border/70 border-t px-4 pt-3 pb-4">
          {message.isPending ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : message.isError ? (
            <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
              Unable to load this message.{' '}
              <button type="button" className="underline" onClick={() => message.refetch()}>
                Try again
              </button>
            </div>
          ) : (
            <>
              {data.body.blockedImages > 0 && !images ? (
                <div className="border-warning/40 bg-warning/10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs">
                  <ImageOff className="text-warning h-4 w-4" aria-hidden="true" />
                  <span>External images were blocked to protect your privacy.</span>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => setImages(true)}
                  >
                    Load images
                  </Button>
                </div>
              ) : null}
              {data.truncated ? (
                <p className="text-muted-foreground mb-2 text-xs">
                  This message is very large and has been truncated.
                </p>
              ) : null}
              <MessageBody body={data.body} allowExternal={images} />
              {data.attachments?.length ? <AttachmentList attachments={data.attachments} /> : null}
              {isLast ? null : (
                <div className="mt-4 flex gap-2 print:hidden">
                  <Button variant="outline" size="sm" onClick={onReply}>
                    <Reply /> Reply
                  </Button>
                  <Button variant="outline" size="sm" onClick={onForward}>
                    <Forward /> Forward
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

function recipientsShort(list, me) {
  if (!list || list.length === 0) return 'me';
  const names = list.map((a) => (a.address === me ? 'me' : a.name?.split(' ')[0] || a.address));
  return names.length > 3
    ? `${names.slice(0, 3).join(', ')} +${names.length - 3}`
    : names.join(', ');
}

function addressText(a) {
  if (!a) return '';
  return a.name ? `${a.name} <${a.address}>` : a.address;
}
