import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('webmail', () => {
  test('rejects wrong credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill('test@example.com');
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /./ })).toContainText(
      'Incorrect email or password'
    );
  });

  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/mail/inbox');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login → inbox → open email → reply → send → verify', async ({ page }) => {
    await login(page);

    // Inbox lists conversations with unread styling and the sidebar has counts.
    const rows = page.getByTestId('mail-row');
    await expect(rows.first()).toBeVisible();
    await expect(page.getByTestId('folder-inbox')).toContainText(/\d+/);

    // Open the welcome message.
    await rows.filter({ hasText: 'Welcome to your new webmail' }).first().click();
    await expect(page.getByTestId('thread-subject')).toContainText('Welcome to your new webmail');
    const body = page.getByTestId('message-body').first();
    await expect(body).toBeVisible();
    // Email HTML is sandboxed and sanitized: no script, external image blocked.
    const frame = page.frameLocator('[data-testid="message-body"]').first();
    await expect(frame.locator('body')).toContainText('This is a test message');
    expect(await frame.locator('script').count()).toBe(0);
    await expect(page.getByText('External images were blocked')).toBeVisible();

    // Reply.
    await page.getByTestId('reply-button').click();
    const compose = page.getByTestId('compose-window');
    await expect(compose).toBeVisible();
    await expect(compose.getByTestId('compose-subject')).toHaveValue(
      'Re: Welcome to your new webmail'
    );
    await expect(compose.getByTitle('team@mailcow.example')).toBeVisible();
    await compose.getByTestId('compose-body').click({ position: { x: 10, y: 8 } });
    await page.keyboard.press('Control+Home');
    await page.keyboard.type('Thanks for the warm welcome!');
    // Autosave creates a draft.
    await expect(compose.getByText('Draft saved')).toBeVisible({ timeout: 15_000 });
    await compose.getByTestId('compose-send').click();
    await expect(page.getByText('Message sent')).toBeVisible();
    await expect(compose).toBeHidden();

    // The reply appears in the conversation and in Sent.
    await expect(page.getByTestId('thread-subject')).toContainText('2');
    await expect(
      page.frameLocator('[data-testid="message-body"]').last().locator('body')
    ).toContainText('Thanks for the warm welcome!');
    await page.getByTestId('folder-sent').click();
    await expect(
      page.getByTestId('mail-row').filter({ hasText: 'Re: Welcome to your new webmail' }).first()
    ).toBeVisible();
    // Draft was consumed.
    await page.getByTestId('folder-drafts').click();
    await expect(page.getByText('Nothing in Drafts')).toBeVisible();
  });

  test('compose with attachment and cc', async ({ page }) => {
    await login(page);
    // Opening a message from John records his address for autocomplete.
    await page.getByTestId('mail-row').filter({ hasText: 'Meeting tomorrow' }).first().click();
    await expect(page.getByTestId('thread-subject')).toBeVisible();
    await page.getByTestId('back-button').click();
    await page.getByTestId('compose-button').click();
    const compose = page.getByTestId('compose-window');
    await compose.getByTestId('recipient-to').fill('john@example.com');
    await page.keyboard.press('Enter');
    await expect(compose.getByText('john@example.com')).toBeVisible();
    await compose.getByRole('button', { name: 'Cc', exact: true }).click();
    await compose.getByTestId('recipient-cc').fill('jo');
    await expect(page.getByRole('option').first()).toBeVisible();
    await page.keyboard.press('Enter');
    await compose.getByTestId('compose-subject').fill('Attachment test');
    await compose.getByTestId('compose-body').click();
    await page.keyboard.type('Please see the attached file.');
    await compose
      .locator('input[type=file]')
      .first()
      .setInputFiles({
        name: 'report.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('quarterly numbers'),
      });
    await expect(compose.getByText('report.txt')).toBeVisible();
    await expect(compose.getByText(/Uploading/)).toBeHidden();
    await compose.getByTestId('compose-send').click();
    await expect(page.getByText('Message sent')).toBeVisible();
    await page.getByTestId('folder-sent').click();
    const row = page.getByTestId('mail-row').filter({ hasText: 'Attachment test' }).first();
    await expect(row).toBeVisible();
    await expect(row.getByLabel('Has attachment')).toBeVisible();
    await row.click();
    await expect(page.getByText('report.txt')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByLabel('Download report.txt').click();
    expect((await download).suggestedFilename()).toBe('report.txt');
  });

  test('search, star, archive and delete with optimistic UI', async ({ page }) => {
    await login(page);
    const search = page.getByLabel('Search mail');
    await search.fill('from:ali has:attachment');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/mail\/search/);
    const result = page.getByTestId('mail-row').filter({ hasText: 'Invoice #1042' });
    await expect(result).toHaveCount(1);

    await page.getByTestId('folder-inbox').click();
    const row = page.getByTestId('mail-row').filter({ hasText: 'Newsletter issue #3' }).first();
    await row.hover();
    await row.getByLabel('Archive').click();
    await expect(page.getByText('Archived')).toBeVisible();
    await expect(
      page.getByTestId('mail-row').filter({ hasText: 'Newsletter issue #3' })
    ).toHaveCount(0);
    await page.getByTestId('folder-archive').click();
    await expect(
      page.getByTestId('mail-row').filter({ hasText: 'Newsletter issue #3' }).first()
    ).toBeVisible();

    await page.getByTestId('folder-inbox').click();
    const row2 = page.getByTestId('mail-row').filter({ hasText: 'Newsletter issue #4' }).first();
    await row2.getByRole('checkbox').check();
    await page.getByRole('toolbar', { name: 'Bulk actions' }).getByLabel('Delete').click();
    await expect(page.getByText('Moved to Trash')).toBeVisible();
    await page.getByTestId('folder-trash').click();
    await expect(
      page.getByTestId('mail-row').filter({ hasText: 'Newsletter issue #4' }).first()
    ).toBeVisible();
  });

  test('keyboard shortcuts navigate and act', async ({ page }) => {
    await login(page);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('j');
    await page.keyboard.press('j');
    await page.keyboard.press('o');
    await expect(page.getByTestId('thread-view')).toBeVisible();
    await page.keyboard.press('u');
    await expect(page.getByTestId('mail-list')).toBeVisible();
    await page.keyboard.press('c');
    await expect(page.getByTestId('compose-window')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  });

  test('folder management and settings', async ({ page }) => {
    await login(page);
    await page.getByLabel('Create folder').click();
    await page.getByLabel('Name').fill('Receipts');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByTestId('folder-Receipts')).toBeVisible();

    await page.goto('/settings?section=appearance');
    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.goto('/settings?section=security');
    await expect(page.getByText('This device')).toBeVisible();
  });

  test('real-time: new mail appears without refresh', async ({ page }) => {
    await login(page);
    // Sending to self loops back through the mock provider and emits an SSE event.
    await page.getByTestId('compose-button').click();
    const compose = page.getByTestId('compose-window');
    await compose.getByTestId('recipient-to').fill('test@example.com');
    await page.keyboard.press('Enter');
    await compose.getByTestId('compose-subject').fill('Realtime ping');
    await compose.getByTestId('compose-send').click();
    await expect(
      page.getByTestId('mail-row').filter({ hasText: 'Realtime ping' }).first()
    ).toBeVisible();
  });
});
