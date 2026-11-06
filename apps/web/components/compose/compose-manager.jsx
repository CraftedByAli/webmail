'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { useComposeStore } from '@/stores/compose-store';
import { useAccountStore } from '@/stores/account-store';
import { ComposeWindow } from '@/components/compose/compose-window';
import { AccountScope } from '@/components/layout/account-provider';
import { useApi } from '@/hooks/use-account';
import { buildReply, buildForward, buildFromDraft } from '@/utils/reply';
import { useSession } from '@/hooks/use-session';
import { useIsMobile } from '@/hooks/use-media-query';
import { cn } from '@/utils/cn';

/**
 * Hosts every open compose window. Each window renders inside the scope of
 * the mailbox it was opened from, so its signatures, suggestions, draft saves
 * and the final send all go to that mailbox — even while the user is reading
 * another one.
 */
export function ComposeManager() {
  const windows = useComposeStore((s) => s.windows);
  const accounts = useAccountStore((s) => s.accounts);
  const active = useAccountStore((s) => s.active);
  const isMobile = useIsMobile();

  if (windows.length === 0) return null;

  const multi = accounts.length > 1;
  const known = new Set(accounts.map((a) => a.email));
  const live = windows.filter((w) => !w.account || known.has(w.account));
  const visible = live.filter((w) => !w.minimized);
  const minimized = live.filter((w) => w.minimized);

  const render = (w, props) => (
    <AccountScope key={w.id} account={w.account || active}>
      <ComposeHost win={w} showFrom={multi} {...props} />
    </AccountScope>
  );

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-end justify-end gap-3 px-0 sm:px-4',
        isMobile && 'inset-0'
      )}
      aria-live="polite"
    >
      {isMobile ? (
        visible.slice(-1).map((w) => render(w, { mobile: true }))
      ) : (
        <>
          {minimized.map((w) => render(w, { minimizedBar: true }))}
          {visible.map((w) => render(w, {}))}
        </>
      )}
    </div>
  );
}

/**
 * Hydrates one window: default signature for new messages, and the source
 * message for reply / forward / draft.
 */
function ComposeHost({ win, ...props }) {
  const api = useApi();
  const update = useComposeStore((s) => s.update);
  const close = useComposeStore((s) => s.close);
  const { data: session } = useSession();
  const me = session?.user?.email;

  useEffect(() => {
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
      return;
    }
    const load = win.data.__loadFrom;
    if (!load || win.loading) return;
    update(win.id, { loading: true });
    api
      .get(`/api/mail/messages/${load.uid}`, { folder: load.folder, images: 0, markRead: 0 })
      .then((message) => {
        let built;
        const defaultSig = session?.signatures?.find((s) => s.isDefault);
        const signatureHtml = load.signature ?? defaultSig?.html ?? '';
        if (win.mode === 'draft') built = buildFromDraft(message);
        else if (win.mode === 'forward') built = buildForward(message, { signatureHtml });
        else built = buildReply(message, { all: win.mode === 'replyAll', me, signatureHtml });
        const current = useComposeStore.getState().windows.find((w) => w.id === win.id);
        if (!current) return;
        update(win.id, {
          loading: false,
          data: {
            ...current.data,
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
  }, [api, win, update, close, me, session]);

  return <ComposeWindow win={win} {...props} />;
}
