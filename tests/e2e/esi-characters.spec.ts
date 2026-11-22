import { expect, test } from '@playwright/test';

test('a callback from another tab clears the URL and asks the user to sign in again', async ({ page }) => {
  let tokenRequests = 0;
  await page.route('https://login.eveonline.com/**', route => {
    tokenRequests++;
    return route.abort();
  });
  await page.goto('/auth/eve/callback?code=mock-authorization-code&state=wrong-state');
  await expect(page).toHaveURL(/\/auth\/eve\/callback$/);
  await expect(page.getByRole('status')).toHaveText('Open sign-in again from this tab');
  expect(tokenRequests).toBe(0);
  await page.getByRole('link', { name: 'Return to fitting workspace' }).click();
  await expect(page.getByRole('heading', { name: 'YAFT', exact: true })).toBeVisible();
});
