import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('mobile layout: drawer, list, full-screen compose', async ({ page }) => {
  await login(page);
  await expect(page.getByTestId('mail-row').first()).toBeVisible();
  await page.getByLabel('Show folders').first().click();
  await expect(page.getByTestId('folder-sent')).toBeVisible();
  await page.getByTestId('folder-sent').click();
  await expect(page.getByRole('heading', { name: 'Sent' })).toBeVisible();
  await page.getByLabel('Show folders').first().click();
  await page.getByTestId('compose-button').click();
  const compose = page.getByTestId('compose-window');
  await expect(compose).toBeVisible();
  const box = await compose.boundingBox();
  const viewport = page.viewportSize();
  expect(box.width).toBeGreaterThanOrEqual(viewport.width - 2);
  await compose.getByTestId('compose-close').click();
});
