import Link from 'next/link';
import { LogIn } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { DocsSidebar, DocsMobileNav, OnThisPage } from '@/components/docs/docs-sidebar';
import { REPO_URL } from '@/components/docs/site';

/**
 * Public documentation frame: header, navigation rail, article, and an
 * on-page outline on wide screens. Server-rendered; only the navigation
 * highlights and the outline run on the client.
 */
export function DocsShell({ children }) {
  return (
    <div className="bg-canvas min-h-dvh">
      <header className="border-line bg-canvas/90 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[90rem] items-center gap-3 px-4 sm:px-6">
          <Link
            href="/docs"
            className="focus-visible:outline-focus rounded-control flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2"
            aria-label="OsmicMails documentation home"
          >
            <Logo showText />
            <span className="text-ui text-fg-muted border-line border-l pl-2 font-medium">
              Docs
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg-secondary hover:bg-hover hover:text-fg rounded-control text-ui focus-visible:outline-focus inline-flex h-8 items-center gap-1.5 px-2.5 font-medium transition-colors focus-visible:outline-2"
            >
              <GithubMark className="size-4" />
              <span className="hidden sm:inline">GitHub</span>
              <span className="sr-only sm:hidden">GitHub repository</span>
            </a>
            <Link
              href="/login"
              className="bg-accent text-on-accent hover:bg-accent-hover rounded-control text-ui focus-visible:outline-focus inline-flex h-8 items-center gap-1.5 px-3 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <LogIn className="size-4" aria-hidden="true" />
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <DocsMobileNav />

      <div className="mx-auto flex max-w-[90rem] gap-10 px-4 sm:px-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-14 max-h-[calc(100dvh-3.5rem)] scrollbar-thin overflow-y-auto py-8 pr-2">
            <DocsSidebar />
          </div>
        </aside>

        <main id="main" className="min-w-0 flex-1 py-8 sm:py-10">
          {children}
        </main>

        <aside className="hidden w-52 shrink-0 xl:block">
          <div className="sticky top-14 py-10">
            <OnThisPage />
          </div>
        </aside>
      </div>
    </div>
  );
}

/** GitHub's mark (Lucide no longer ships brand icons). */
function GithubMark({ className }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
