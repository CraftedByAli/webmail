'use client';

import { useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { parseMailRoute, viewHref, ROLE_VIEWS } from '@/utils/mail-routes';
import { useResolvedFolder } from '@/hooks/use-folders';
import { MailList } from '@/components/mail/mail-list';
import { ThreadView } from '@/components/mail/thread-view';

/**
 * Routes the /mail/* URL to either the list or a conversation.
 */
export function MailView() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = useMemo(
    () => (Array.isArray(params.slug) ? params.slug : params.slug ? [params.slug] : []),
    [params.slug]
  );
  const route = useMemo(() => parseMailRoute(slug, searchParams), [slug, searchParams]);
  const resolved = useResolvedFolder(route);

  const title =
    route.view === 'search'
      ? 'Search results'
      : route.view === 'folder'
        ? resolved.folder?.name || route.folderPath
        : ROLE_VIEWS[route.view]?.label || 'Inbox';
  const baseHref = viewHref({ view: route.view, folderPath: route.folderPath, query: route.query });

  if (route.threadUids || route.messageUid) {
    return (
      <ThreadView
        key={`${resolved.path}:${(route.threadUids || [route.messageUid]).join('-')}`}
        folder={resolved.path}
        uids={route.threadUids}
        messageUid={route.messageUid}
        backHref={baseHref}
        roles={resolved.roles}
      />
    );
  }

  return (
    <MailList
      key={`${route.view}:${resolved.path}:${route.query}`}
      title={title}
      route={route}
      folder={resolved.path}
      folderReady={resolved.ready}
      roles={resolved.roles}
      folders={resolved.folders}
      baseHref={baseHref}
    />
  );
}
