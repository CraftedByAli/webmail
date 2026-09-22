export const EMAIL = process.env.E2E_EMAIL || 'test@example.com';
export const PASSWORD = process.env.E2E_PASSWORD || 'password123';

export async function login(page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/mail\/inbox/);
  await page.getByTestId('mail-list').waitFor();
}
