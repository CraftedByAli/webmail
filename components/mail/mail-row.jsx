'use client';

import { memo } from 'react';
import { Star, Paperclip, Archive, Trash2, MailOpen, Mail } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/utils/cn';
import { formatListDate, participantsLabel } from '@/utils/format';

/**
 * One conversation / message row. Memoised because the virtualiser re-renders
 * often while scrolling.
 */
export const MailRow = memo(function MailRow({
  item,
  me,
  selected,
  focused,
  showPreview,
  isMobile,
  showFolder,
  onToggleSelect,
  onOpen,
  onFocus,
  onStar,
  onArchive,
  onTrash,
  onToggleRead,
  dragPayload,
  prefs,
}) {
  const isThread = item.type === 'thread';
  const unread = isThread ? item.unread : !item.flags?.seen;
  const starred = isThread ? item.starred : !!item.flags?.flagged;
  const sender = isThread
    ? participantsLabel(item.participants, me, item.count)
    : item.from?.address === me
      ? 'me'
      : item.from?.name || item.from?.address || '(unknown)';
  const subject = item.subject || '(no subject)';
  const date = formatListDate(item.date, prefs?.general);
  const isDraft = !isThread && item.flags?.draft;

  const stop = (fn) => (e) => {
    e.stopPropagation();
    e.preventDefault();
    fn();
  };

  return (
    <div
      role="listitem"
      tabIndex={0}
      data-selected={selected ? 'true' : undefined}
      aria-label={`${unread ? 'Unread. ' : ''}${sender}. ${subject}. ${date}`}
      data-testid="mail-row"
      data-unread={unread ? 'true' : undefined}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-webmail-messages', JSON.stringify(dragPayload));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      onFocus={onFocus}
      onMouseEnter={onFocus}
      className={cn(
        'group border-border/70 relative flex h-full cursor-pointer items-center gap-2 border-b px-2 text-sm transition-colors outline-none sm:px-3',
        unread ? 'bg-unread font-semibold' : 'bg-read text-foreground/85',
        selected && 'bg-selected',
        focused && 'ring-ring ring-1 ring-inset',
        'hover:shadow-soft hover:z-10'
      )}
    >
      <div className="hidden shrink-0 items-center sm:flex" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          aria-label={`Select conversation from ${sender}`}
        />
      </div>
      <button
        type="button"
        onClick={stop(() => onStar(!starred))}
        aria-label={starred ? 'Unstar' : 'Star'}
        aria-pressed={starred}
        className={cn(
          'text-muted-foreground/70 hover:text-star hidden shrink-0 rounded p-1 sm:block',
          starred && 'text-star'
        )}
      >
        <Star className={cn('h-4 w-4', starred && 'fill-current')} />
      </button>

      {isMobile ? (
        <div className="flex min-w-0 flex-1 flex-col py-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className={cn('truncate', unread ? 'text-foreground' : '')}>
              {isDraft ? <span className="text-destructive">Draft</span> : sender}
            </span>
            <span className="text-muted-foreground shrink-0 text-xs">{date}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn('truncate', unread ? 'text-foreground' : 'font-normal')}>
              {subject}
            </span>
            {item.hasAttachment ? (
              <Paperclip
                className="text-muted-foreground h-3.5 w-3.5 shrink-0"
                aria-label="Has attachment"
              />
            ) : null}
            {starred ? (
              <Star className="fill-star text-star h-3.5 w-3.5 shrink-0" aria-label="Starred" />
            ) : null}
          </div>
          {showPreview && item.preview ? (
            <span className="text-muted-foreground truncate text-xs font-normal">
              {item.preview}
            </span>
          ) : null}
        </div>
      ) : (
        <>
          <div className={cn('w-44 shrink-0 truncate lg:w-52', unread ? 'text-foreground' : '')}>
            {isDraft ? <span className="text-destructive">Draft</span> : sender}
            {showFolder && item.folder ? (
              <span className="bg-muted text-muted-foreground ml-1 rounded px-1 text-[10px] font-normal">
                {item.folder}
              </span>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className={cn('truncate', unread ? 'text-foreground' : '')}>{subject}</span>
            {showPreview && item.preview ? (
              <span className="text-muted-foreground hidden min-w-0 truncate font-normal md:inline">
                <span aria-hidden="true"> – </span>
                {item.preview}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2 pl-2">
            {item.hasAttachment ? (
              <Paperclip className="text-muted-foreground h-4 w-4" aria-label="Has attachment" />
            ) : null}
            <span
              className={cn(
                'w-16 text-right text-xs tabular-nums',
                unread ? 'text-foreground' : 'text-muted-foreground',
                'group-hover:hidden'
              )}
            >
              {date}
            </span>
            <div
              className="hidden items-center gap-0.5 group-hover:flex"
              onClick={(e) => e.stopPropagation()}
            >
              <RowAction label="Archive" onClick={onArchive}>
                <Archive className="h-4 w-4" />
              </RowAction>
              <RowAction label="Delete" onClick={onTrash}>
                <Trash2 className="h-4 w-4" />
              </RowAction>
              <RowAction
                label={unread ? 'Mark as read' : 'Mark as unread'}
                onClick={() => onToggleRead(unread)}
              >
                {unread ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
              </RowAction>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

function RowAction({ label, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1.5"
    >
      {children}
    </button>
  );
}
