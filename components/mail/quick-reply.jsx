'use client';

import { Reply, ReplyAll, Forward } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Reply actions closing the conversation. Exactly one is primary — the one the
 * user's own default-reply preference says they mean.
 */
export function QuickReply({ message, me, defaultReplyAll, onReply, onReplyAll, onForward }) {
  const others = [...(message.to || []), ...(message.cc || [])].filter((a) => a.address !== me);
  const canReplyAll =
    others.length > 0 ||
    (message.from && message.from.address !== me && (message.to || []).length > 1);
  const replyAllIsPrimary = defaultReplyAll && canReplyAll;

  return (
    <div className="mt-5 flex flex-wrap gap-2 print:hidden">
      <Button
        variant={replyAllIsPrimary ? 'default' : 'primary'}
        onClick={onReply}
        data-testid="reply-button"
      >
        <Reply /> Reply
      </Button>
      {canReplyAll ? (
        <Button variant={replyAllIsPrimary ? 'primary' : 'default'} onClick={onReplyAll}>
          <ReplyAll /> Reply all
        </Button>
      ) : null}
      <Button variant="default" onClick={onForward}>
        <Forward /> Forward
      </Button>
    </div>
  );
}
