/**
 * Next.js instrumentation hook: runs once when the server starts. The Node
 * specific work lives in lib/server/startup.js so the Edge bundle (used for
 * proxy.js) never imports Node APIs.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startNodeRuntime } = await import('./lib/server/startup.js');
    await startNodeRuntime();
  }
}
