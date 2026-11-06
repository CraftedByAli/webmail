import { test, expect } from '@playwright/test';
import { login } from './helpers';

/**
 * Message rendering is the part of a webmail that dark mode usually breaks.
 * These tests pin the two presentation modes and the quote trimming.
 */
async function setTheme(page, theme) {
  await page.goto(`/settings?section=appearance`);
  await page.getByRole('radio', { name: theme, exact: true }).click();
  await expect(page.locator('html')).toHaveClass(theme === 'Dark' ? /dark/ : /light/);
}

/**
 * Opens a conversation and expands every message in it, so these tests do not
 * depend on which message another spec happened to reply to.
 */
async function openBySubject(page, subject) {
  await page.goto('/mail/inbox');
  await page.getByTestId('mail-row').filter({ hasText: subject }).first().click();
  await expect(page.getByTestId('thread-view')).toBeVisible();

  const expandAll = page.getByRole('button', { name: 'Expand all messages' });
  if (await expandAll.isVisible().catch(() => false)) await expandAll.click();
  await expect(page.locator('[data-testid="message-body"]').first()).toBeVisible();
}

/** The frame showing the given text, so multi-message threads stay unambiguous. */
function frameContaining(page, index = 0) {
  return page.frameLocator('[data-testid="message-body"]').nth(index);
}

test.describe('message rendering', () => {
  test('plain mail is rendered in the reader theme, in both modes', async ({ page }) => {
    await login(page);

    for (const theme of ['Light', 'Dark']) {
      await setTheme(page, theme);
      await openBySubject(page, 'Welcome to your new webmail');

      const frame = page.frameLocator('[data-testid="message-body"]').first();
      await expect(frame.locator('body')).toContainText('This is a test message');

      // The frame must not paint its own sheet: it inherits the app surface,
      // which is what makes dark mode legible for ordinary correspondence.
      const bg = await page
        .locator('[data-testid="message-body"]')
        .first()
        .evaluate((el) => getComputedStyle(el.contentDocument.body).backgroundColor);
      expect(bg).toBe('rgba(0, 0, 0, 0)');

      // Sanitized and inert: no scripts survive into the document.
      expect(await frame.locator('script').count()).toBe(0);
    }
  });

  test('designed mail keeps its own colours on a light sheet, even in dark mode', async ({
    page,
  }) => {
    await login(page);
    await setTheme(page, 'Dark');
    await openBySubject(page, 'Your weekly deploy report');

    const host = page.locator('[data-testid="message-body"]').first();
    const bg = await host.evaluate(
      (el) => getComputedStyle(el.contentDocument.body).backgroundColor
    );
    expect(bg).toBe('rgb(255, 255, 255)');

    const frame = page.frameLocator('[data-testid="message-body"]').first();
    await expect(frame.getByText('Weekly deploy report')).toBeVisible();

    // The sender's call-to-action keeps the colour they chose; our accent must
    // not be forced onto it.
    const linkColor = await host.evaluate(
      (el) => getComputedStyle(el.contentDocument.querySelector('a')).color
    );
    expect(linkColor).toBe('rgb(255, 255, 255)');
  });

  test('quoted history is trimmed behind a toggle', async ({ page }) => {
    await login(page);
    await openBySubject(page, 'Re: Server migration window');

    const frame = page.frameLocator('[data-testid="message-body"]').first();
    await expect(frame.locator('body')).toContainText('Friday after 18:00');
    await expect(frame.locator('body')).not.toContainText('two-hour window');

    await page.getByRole('button', { name: 'Show quoted history' }).click();
    const quoted = page.frameLocator('[data-testid="message-body-quoted"]');
    await expect(quoted.locator('body')).toContainText('two-hour window');
  });

  test('remote images stay blocked until asked for', async ({ page }) => {
    await login(page);
    await openBySubject(page, 'Welcome to your new webmail');

    const notice = page.getByText('External images were blocked').first();
    await expect(notice).toBeVisible();
    await expect(frameContaining(page).locator('img[data-blocked-src]')).toHaveCount(1);

    await page.getByRole('button', { name: 'Show images' }).first().click();
    await expect(notice).toBeHidden();
  });
});
