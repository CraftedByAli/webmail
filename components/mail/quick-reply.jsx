'use client';

import { Reply, ReplyAll, Forward } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Reply / Reply all / Forward buttons at the bottom of a conversation. */
export function QuickReply({ message, me, defaultReplyAll, onReply, onReplyAll, onForward }) {
  const others = [...(message.to || []), ...(message.cc || [])].filter((a) => a.address !== me);
  const canReplyAll =
    others.length > 0 ||
    (message.from && message.from.address !== me && (message.to || []).length > 1);
  return (
    <div className="mt-4 flex flex-wrap gap-2 print:hidden">
      <Button
        variant={defaultReplyAll && canReplyAll ? 'outline' : 'default'}
        onClick={onReply}
        data-testid="reply-button"
      >
        <Reply /> Reply
      </Button>
      {canReplyAll ? (
        <Button variant={defaultReplyAll ? 'default' : 'outline'} onClick={onReplyAll}>
          <ReplyAll /> Reply all
        </Button>
      ) : null}
      <Button variant="outline" onClick={onForward}>
        <Forward /> Forward
      </Button>
    </div>
  );
}
