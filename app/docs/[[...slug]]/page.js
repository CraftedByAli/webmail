import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { docsHref, findDocsPage } from '@/components/docs/nav';
import { DOCS_CONTENT } from '@/components/docs/pages';
import { REPO_URL } from '@/components/docs/site';

function slugOf(params) {
  return (params.slug || []).join('/');
}

export async function generateMetadata({ params }) {
  const found = findDocsPage(slugOf(await params));
  if (!found) return {};
  return {
    title: found.page.slug ? found.page.title : { absolute: 'OsmicMails documentation' },
    description: found.page.description,
  };
}

export default async function DocsPage({ params }) {
  const slug = slugOf(await params);
  const found = findDocsPage(slug);
  const Content = DOCS_CONTENT[slug];
  if (!found || !Content) notFound();
  const { prev, next } = found;

  return (
    <div className="mx-auto max-w-[46rem]">
      <article data-docs-article>
        <Content />
      </article>

      <nav
        aria-label="Previous and next pages"
        className="border-line mt-14 grid gap-3 border-t pt-6 sm:grid-cols-2"
      >
        {prev ? (
          <Link
            href={docsHref(prev.slug)}
            className="border-line hover:bg-hover rounded-surface focus-visible:outline-focus block border p-3.5 transition-colors focus-visible:outline-2"
          >
            <span className="text-caption text-fg-muted flex items-center gap-1">
              <ArrowLeft className="size-3.5" aria-hidden="true" /> Previous
            </span>
            <span className="text-ui text-fg mt-0.5 block font-medium">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={docsHref(next.slug)}
            className="border-line hover:bg-hover rounded-surface focus-visible:outline-focus block border p-3.5 text-right transition-colors focus-visible:outline-2"
          >
            <span className="text-caption text-fg-muted flex items-center justify-end gap-1">
              Next <ArrowRight className="size-3.5" aria-hidden="true" />
            </span>
            <span className="text-ui text-fg mt-0.5 block font-medium">{next.title}</span>
          </Link>
        ) : null}
      </nav>

      <p className="text-caption text-fg-muted mt-8">
        Found a mistake?{' '}
        <a
          href={`${REPO_URL}/issues/new`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-text underline underline-offset-2"
        >
          Open an issue
        </a>
        .
      </p>
    </div>
  );
}
