'use client';

import { memo, useRef } from 'react';
import { Star, Paperclip, Archive, Trash2, MailOpen, Mail, Check } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/utils/cn';
import { formatListDate, participantsLabel } from '@/utils/format';

/**
 * One conversation in the list.
 *
 * Design notes:
 *  - Rows are flush. No card, no shadow, no lift on hover: a list of 10,000
 *    messages must read as one continuous surface, not a stack of tiles.
 *  - Unread is carried by a 2px accent rule at the leading edge plus weight,
 *    not by striping the background. Striping fights selection and hover, and
 *    breaks down entirely in dark mode.
 *  - Columns share vertical axes with the toolbar above them so the eye can
 *    scan sender → subject → date without re-anchoring.
 *
 * Memoised: the virtualiser re-renders this constantly while scrolling.
 *
 * Touch: there is no hover and no checkbox column on phones, so the avatar is
 * the selection target, a long press selects too, and while anything is
 * selected a tap toggles selection instead of opening the conversation.
 */
const LONG_PRESS_MS = 450;
export const MailRow = memo(function MailRow({
  item,
  me,
  selected,
  focused,
  showPreview,
  isMobile,
  selectionMode,
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
    ? participantsLabel(item.participants, me)
    : item.from?.address === me
      ? 'me'
      : item.from?.name || item.from?.address || 'Unknown sender';
  const subject = item.subject || '(no subject)';
  const date = formatListDate(item.date, prefs?.general);
  const isDraft = !isThread && item.flags?.draft;

  const press = useLongPress(isMobile ? onToggleSelect : null);
  const firstSender = isThread
    ? item.participants?.find((p) => p.address !== me) || item.participants?.[0]
    : item.from;

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
      data-testid="mail-row"
      data-unread={unread ? 'true' : undefined}
      aria-label={`${unread ? 'Unread. ' : ''}${sender}. ${subject}. ${date}`}
      draggable={!isMobile}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-webmail-messages', JSON.stringify(dragPayload));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => {
        if (press.consumeClick()) return;
        if (isMobile && selectionMode) onToggleSelect();
        else onOpen();
      }}
      {...press.handlers}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      onFocus={onFocus}
      onMouseEnter={onFocus}
      className={cn(
        'group focus-inset border-line px-gutter text-ui relative flex h-full cursor-pointer items-center gap-2 border-b transition-colors duration-100',
        isMobile && 'gap-3 select-none [-webkit-touch-callout:none]',
        'before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:content-[""]',
        unread ? 'before:bg-accent' : 'before:bg-transparent',
        selected ? 'bg-accent-subtle' : 'bg-surface hover:bg-hover',
        focused && !selected && 'bg-hover'
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
        aria-label={
          starred ? `Unstar conversation from ${sender}` : `Star conversation from ${sender}`
        }
        aria-pressed={starred}
        className={cn(
          'rounded-tight hidden shrink-0 p-0.5 transition-colors duration-100 sm:block',
          starred ? 'text-star' : 'text-fg-muted/45 group-hover:text-fg-muted hover:!text-star'
        )}
      >
        <Star className={cn('size-4', starred && 'fill-current')} />
      </button>

      {isMobile ? (
        <button
          type="button"
          onClick={stop(() => {
            if (!press.consumeClick()) onToggleSelect();
          })}
          aria-label={
            selected ? `Deselect conversation from ${sender}` : `Select conversation from ${sender}`
          }
          aria-pressed={selected}
          className="rounded-pill focus-visible:outline-focus -my-1 shrink-0 p-1 focus-visible:outline-2"
        >
          {selected ? (
            <span className="bg-accent text-on-accent rounded-pill grid size-9 place-items-center">
              <Check className="size-4" />
            </span>
          ) : (
            <Avatar address={firstSender} size="lg" />
          )}
        </button>
      ) : null}

      {isMobile ? (
        <div className="flex min-w-0 flex-1 flex-col justify-center py-1.5">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate',
                unread ? 'text-fg font-semibold' : 'text-fg'
              )}
            >
              {isDraft ? <span className="text-danger">Draft</span> : sender}
            </span>
            <time className="text-caption text-fg-muted shrink-0">{date}</time>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'min-w-0 flex-1 truncate',
                unread ? 'text-fg font-medium' : 'text-fg-secondary'
              )}
            >
              {subject}
            </span>
            {item.hasAttachment ? (
              <Paperclip className="text-fg-muted size-3.5 shrink-0" aria-label="Has attachment" />
            ) : null}
            {starred ? (
              <Star className="fill-star text-star size-3.5 shrink-0" aria-label="Starred" />
            ) : null}
          </div>
          {showPreview && item.preview ? (
            <span className="text-caption text-fg-muted truncate">{item.preview}</span>
          ) : null}
        </div>
      ) : (
        <>
          <div
            className={cn(
              'flex w-40 shrink-0 items-center gap-1.5 truncate lg:w-48',
              unread ? 'text-fg font-semibold' : 'text-fg'
            )}
          >
            <span className="truncate">
              {isDraft ? <span className="text-danger">Draft</span> : sender}
            </span>
            {isThread && item.count > 1 ? (
              <span className="text-caption text-fg-muted shrink-0 font-normal" data-numeric>
                {item.count}
              </span>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className={cn('shrink-0 truncate', unread ? 'text-fg font-semibold' : 'text-fg')}>
              {subject}
            </span>
            {showFolder && item.folder ? (
              <span className="bg-hover text-meta text-fg-muted rounded-tight shrink-0 px-1">
                {item.folder}
              </span>
            ) : null}
            {showPreview && item.preview ? (
              <span className="text-fg-muted hidden min-w-0 truncate md:inline">
                {item.preview}
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2 pl-2">
            {item.hasAttachment ? (
              <Paperclip className="text-fg-muted size-4" aria-label="Has attachment" />
            ) : null}
            <time
              className={cn(
                'text-caption w-14 text-right group-hover:hidden',
                unread ? 'text-fg font-medium' : 'text-fg-muted'
              )}
            >
              {date}
            </time>
            <div
              className="hidden items-center gap-0.5 group-hover:flex"
              onClick={(e) => e.stopPropagation()}
            >
              <RowAction
                label={`Archive conversation from ${sender}`}
                title="Archive"
                onClick={onArchive}
              >
                <Archive className="size-4" />
              </RowAction>
              <RowAction
                label={`Delete conversation from ${sender}`}
                title="Delete"
                onClick={onTrash}
              >
                <Trash2 className="size-4" />
              </RowAction>
              <RowAction
                label={
                  unread
                    ? `Mark conversation from ${sender} as read`
                    : `Mark conversation from ${sender} as unread`
                }
                title={unread ? 'Mark as read' : 'Mark as unread'}
                onClick={() => onToggleRead(unread)}
              >
                {unread ? <MailOpen className="size-4" /> : <Mail className="size-4" />}
              </RowAction>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

function RowAction({ label, title, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      className="text-fg-muted hover:bg-active hover:text-fg focus-visible:outline-focus rounded-control grid size-7 place-items-center transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1"
    >
      {children}
    </button>
  );
}

/**
 * Long-press detection for touch rows. Movement cancels it (the user is
 * scrolling), and the click that follows a long press is swallowed so the
 * row does not also open.
 */
function useLongPress(onLongPress) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);

  const cancel = () => {
    clearTimeout(timer.current);
    timer.current = null;
  };

  if (!onLongPress) return { handlers: {}, consumeClick: () => false };

  return {
    consumeClick() {
      const was = fired.current;
      fired.current = false;
      return was;
    },
    handlers: {
      onPointerDown(e) {
        if (e.pointerType === 'mouse') return;
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        cancel();
        timer.current = setTimeout(() => {
          fired.current = true;
          navigator.vibrate?.(10);
          onLongPress();
        }, LONG_PRESS_MS);
      },
      onPointerMove(e) {
        if (!timer.current || !start.current) return;
        if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onContextMenu(e) {
        // Android fires contextmenu on long press; the selection already happened.
        if (fired.current || timer.current) e.preventDefault();
      },
    },
  };
}
