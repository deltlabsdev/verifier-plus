import { test, expect } from "@playwright/test";
import path from 'path';
import { TestId } from "@/lib/testIds";

// openbadge.png is baked with an OB 3.0 credential secured as a compact JWT (ES256, did:web)
test('baked PNG with JWT credential verifies', async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, 'openbadge.png'));
  await expect(page.getByText('Json cannot be parsed')).toHaveCount(0);
  await expect(page.getByTestId(TestId.CredentialName)).toContainText('Introduction to Verifiable Credentials');
  await expect(page.getByTestId(TestId.SigningLogMsg)).toBeVisible();
  await expect(page.getByTestId(TestId.SigningErrorMsg)).toHaveCount(0);
});
