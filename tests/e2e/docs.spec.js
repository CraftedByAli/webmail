import { test, expect } from '@playwright/test';

test('docs are public and link every page', async ({ page }) => {
  await page.goto('/docs');
  await expect(page).toHaveURL(/\/docs$/);
  await expect(page.getByRole('heading', { level: 1, name: 'OsmicMails' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Documentation' });
  await nav.getByRole('link', { name: 'Mailcow & replacing SOGo' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Mailcow & replacing SOGo' })
  ).toBeVisible();
  await expect(page.getByText('MAIL_TLS_SERVERNAME=mail.example.com').first()).toBeVisible();
});

test('unknown docs pages 404 and the app still requires sign-in', async ({ page }) => {
  const res = await page.goto('/docs/does-not-exist');
  expect(res.status()).toBe(404);
  await page.goto('/mail/inbox');
  await expect(page).toHaveURL(/\/login/);
});
