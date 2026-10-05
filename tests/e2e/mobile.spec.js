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

test('mobile: form fields are 16px so iOS Safari does not zoom on focus', async ({ page }) => {
  await page.goto('/login');
  for (const field of [
    page.getByLabel('Email address'),
    page.getByLabel('Password', { exact: true }),
  ]) {
    const size = await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  }
  await login(page);
  const search = await page
    .locator('#global-search')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(search).toBeGreaterThanOrEqual(16);
  await page.getByTestId('compose-fab').click();
  const compose = page.getByTestId('compose-window');
  for (const el of [compose.getByTestId('compose-subject'), compose.getByTestId('compose-body')]) {
    const size = await el.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  }
  await compose.getByTestId('compose-close').click();
});

test('mobile: select conversations by avatar and act on them', async ({ page }) => {
  await login(page);
  const rows = page.getByTestId('mail-row');
  await rows
    .nth(0)
    .getByRole('button', { name: /^Select conversation/ })
    .click();
  // In selection mode a tap on a row selects it instead of opening it.
  await rows.nth(1).click();
  await expect(page.getByText('2 selected')).toBeVisible();
  await expect(page).toHaveURL(/\/mail\/inbox$/);
  await expect(page.getByTestId('compose-fab')).toBeHidden();
  await page.getByRole('button', { name: 'More actions' }).click();
  await expect(page.getByRole('menuitem', { name: 'Mark as read' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Cancel selection' }).click();
  await expect(page.getByTestId('compose-fab')).toBeVisible();
});
