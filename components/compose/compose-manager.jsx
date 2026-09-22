'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { useComposeStore } from '@/stores/compose-store';
import { ComposeWindow } from '@/components/compose/compose-window';
import { apiGet } from '@/utils/api-client';
import { buildReply, buildForward, buildFromDraft } from '@/utils/reply';
import { useSession } from '@/hooks/use-session';
import { useIsMobile } from '@/hooks/use-media-query';
import { cn } from '@/utils/cn';

/**
 * Hosts every open compose window. Windows opened with `__loadFrom` first
 * fetch the source message (reply / forward / draft) and then hydrate.
 */
export function ComposeManager() {
  const windows = useComposeStore((s) => s.windows);
  const update = useComposeStore((s) => s.update);
  const close = useComposeStore((s) => s.close);
  const { data: session } = useSession();
  const me = session?.user?.email;
  const isMobile = useIsMobile();

  useEffect(() => {
    for (const win of windows) {
      // Fresh messages start with the default signature (once signatures are known).
      if (win.mode === 'new' && win.data.signatureId === undefined && session) {
        const defaultSig = session.signatures?.find((s) => s.isDefault);
        update(win.id, {
          data: {
            ...win.data,
            signatureId: defaultSig?.id ?? null,
            html:
              defaultSig && !win.data.html
                ? `<p></p><div class="wm-signature"><br>-- <br>${defaultSig.html}</div>`
                : win.data.html,
          },
        });
        continue;
      }
      const load = win.data.__loadFrom;
      if (!load || win.loading) continue;
      update(win.id, { loading: true });
      apiGet(`/api/mail/messages/${load.uid}`, { folder: load.folder, images: 0, markRead: 0 })
        .then((message) => {
          let built;
          const defaultSig = session?.signatures?.find((s) => s.isDefault);
          const signatureHtml = load.signature ?? defaultSig?.html ?? '';
          if (win.mode === 'draft') built = buildFromDraft(message);
          else if (win.mode === 'forward') built = buildForward(message, { signatureHtml });
          else built = buildReply(message, { all: win.mode === 'replyAll', me, signatureHtml });
          update(win.id, {
            loading: false,
            data: {
              ...win.data,
              ...built.data,
              __loadFrom: undefined,
              signatureId: win.mode === 'draft' ? null : (defaultSig?.id ?? null),
            },
            showCc: built.data.cc?.length > 0,
          });
        })
        .catch((error) => {
          toast.error(error.message || 'Unable to open the message.');
          close(win.id);
        });
    }
  }, [windows, update, close, me, session]);

  if (windows.length === 0) return null;

  const visible = windows.filter((w) => !w.minimized);
  const minimized = windows.filter((w) => w.minimized);

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-end justify-end gap-3 px-0 sm:px-4',
        isMobile && 'inset-0'
      )}
      aria-live="polite"
    >
      {isMobile ? (
        visible.slice(-1).map((w) => <ComposeWindow key={w.id} win={w} mobile />)
      ) : (
        <>
          {minimized.map((w) => (
            <ComposeWindow key={w.id} win={w} minimizedBar />
          ))}
          {visible.map((w) => (
            <ComposeWindow key={w.id} win={w} />
          ))}
        </>
      )}
    </div>
  );
}
