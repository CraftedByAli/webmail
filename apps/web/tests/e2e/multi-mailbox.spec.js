import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { login } from './helpers';

const switcher = (page) => page.getByTestId('mailbox-switcher');

async function addMailbox(page, name) {
  await switcher(page).click();
  await page.getByTestId('add-mailbox').click();
  const dialog = page.getByRole('dialog', { name: 'Add a mailbox' });
  await dialog.getByLabel('Mailbox address').fill(name);
  await dialog.getByLabel('Password', { exact: true }).fill('password123');
  await dialog.getByTestId('add-mailbox-submit').click();
  await expect(dialog).toBeHidden();
}

test.describe('multiple mailboxes', () => {
  test('add, switch and keep every mailbox’s mail separate', async ({ page }) => {
    await login(page);
    await expect(switcher(page)).toContainText('test@example.com');
    const rows = page.getByTestId('mail-row');
    await expect(rows.filter({ hasText: 'Welcome to your new webmail' }).first()).toBeVisible();

    // "sales" is shorthand for sales@<current domain>.
    await addMailbox(page, 'sales');
    await expect(switcher(page)).toContainText('sales@example.com');
    await expect(rows.filter({ hasText: 'Welcome to the sales mailbox' })).toBeVisible();
    await expect(rows.filter({ hasText: 'Welcome to your new webmail' })).toHaveCount(0);

    // Switch back from the menu.
    await switcher(page).click();
    await page.getByTestId('mailbox-option').filter({ hasText: 'test@example.com' }).click();
    await expect(switcher(page)).toContainText('test@example.com');
    await expect(rows.filter({ hasText: 'Welcome to your new webmail' }).first()).toBeVisible();
    await expect(rows.filter({ hasText: 'Welcome to the sales mailbox' })).toHaveCount(0);

    // g then 2 jumps to the second mailbox; the tab remembers it across reloads.
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('g');
    await page.keyboard.press('2');
    await expect(switcher(page)).toContainText('sales@example.com');
    await page.reload();
    await expect(switcher(page)).toContainText('sales@example.com');
    await expect(rows.filter({ hasText: 'Welcome to the sales mailbox' })).toBeVisible();

    // Compose from the sales mailbox shows which mailbox it sends from.
    await page.getByTestId('compose-button').click();
    await expect(page.getByTestId('compose-from')).toContainText('sales@example.com');
    await page.getByTestId('compose-close').click();

    // Mailboxes settings list both; signing one out keeps the other.
    await page.goto('/settings?section=mailboxes');
    const list = page.getByTestId('mailbox-list');
    await expect(list).toContainText('test@example.com');
    await expect(list).toContainText('sales@example.com');
    await list
      .locator('li')
      .filter({ hasText: 'sales@example.com' })
      .getByRole('button', { name: 'Sign out' })
      .click();
    await expect(list).not.toContainText('sales@example.com');
    await expect(list).toContainText('test@example.com');
  });

  test('attachments preview and download from any mailbox', async ({ page }) => {
    await login(page);
    await addMailbox(page, 'sales@example.com');
    await page.getByTestId('mail-row').filter({ hasText: 'Quote request for sales' }).click();

    await page.getByRole('button', { name: 'Preview requirements.txt' }).first().click();
    const preview = page.getByRole('dialog', { name: 'requirements.txt' });
    await expect(preview).toContainText('SSO required');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      preview.getByRole('button', { name: 'Download' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('requirements.txt');
    const saved = await download.path();
    expect(fs.readFileSync(saved, 'utf8')).toContain('Annual billing');
    await page.keyboard.press('Escape');

    // PDF in the other mailbox: the inline endpoint serves a frameable PDF.
    await switcher(page).click();
    await page.getByTestId('mailbox-option').filter({ hasText: 'test@example.com' }).click();
    await page.getByTestId('mail-row').filter({ hasText: 'Invoice #1042' }).first().click();
    await page.getByRole('button', { name: 'Preview invoice-1042.pdf' }).first().click();
    const frame = page.locator('iframe[title="invoice-1042.pdf"]');
    await expect(frame).toBeVisible();
    const src = await frame.getAttribute('src');
    expect(src).toContain('account=test%40example.com');
    const res = await page.request.get(src);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('application/pdf');
    expect(res.headers()['x-frame-options']).toBe('SAMEORIGIN');
    expect(Number(res.headers()['content-length'])).toBe((await res.body()).length);
  });

  test('forwarding can be turned on and off per mailbox', async ({ page }) => {
    await login(page);
    await addMailbox(page, 'support');
    await page.goto('/settings?section=forwarding');
    await expect(page.getByRole('heading', { name: 'Forwarding' })).toBeVisible();
    await expect(page.getByText('Settings · support@example.com')).toBeVisible();

    await page.getByLabel('Forward incoming mail').click();
    const address = page.getByLabel('Forward to');
    await address.fill('support@example.com');
    await address.press('Enter');
    await expect(page.getByText('A mailbox cannot forward to itself.')).toBeVisible();
    await address.fill('archive@partner.example');
    await address.press('Enter');
    await expect(page.getByTestId('forwarding-addresses')).toContainText('archive@partner.example');
    await page.getByTestId('forwarding-save').click();
    await expect(page.getByText('New mail is being forwarded to')).toBeVisible();

    await page.getByLabel('Forward incoming mail').click();
    await page.getByTestId('forwarding-save').click();
    await expect(page.getByText('Forwarding turned off')).toBeVisible();
    await expect(page.getByText('New mail is being forwarded to')).toHaveCount(0);
    // The address list is kept for next time.
    await expect(page.getByTestId('forwarding-addresses')).toContainText('archive@partner.example');
  });
});
