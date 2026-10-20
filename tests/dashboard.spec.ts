import { test as base, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';

/*
 * Checks for the QA dashboard, run against samples/ (built from real runs R-143 to R-152).
 * Every test fails if the page throws a JavaScript error.
 * If you change samples/, update the expected numbers below.
 */
const test = base.extend<{ jsErrors: string[] }>({
  jsErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await use(errors);
    expect(errors, 'JavaScript errors on the page').toEqual([]);
  }, { auto: true }],
});

const samplesDir = path.resolve(__dirname, '..', 'samples');
const sample = (file: string) => JSON.parse(fs.readFileSync(path.join(samplesDir, file), 'utf8'));

async function open(page: Page, hash = '') {
  await page.goto(`/?data=samples${hash}`);
  await expect(page.locator('#headline')).not.toHaveText(/Loading/);
}

/* Serve chosen JSON for data/*.json, for tests that need real-mode data with tweaks. */
async function serveData(page: Page, files: Record<string, unknown | null>) {
  await page.route(/\/data\/[\w-]+\.json/, route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    const body = name in files ? files[name] : sample(name);
    if (body === null) return route.fulfill({ status: 404, body: 'Not found' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test.describe('Overview', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('shows the UI pass rate, not the mixed UI and API rate', async ({ page }) => {
    await open(page);
    await expect(page.locator('#stats b').first()).toHaveText('56%');
    await expect(page.locator('#headline')).toHaveText('11 tests need a look');
    await expect(page.locator('#verdict')).toContainText('Not ready to deploy');
    await expect(page.locator('#cnt-at')).toHaveText('25');
  });

  test('never mentions API tests on any page', async ({ page }) => {
    for (const hash of ['#overview', '#categories', '#suites', '#graphs', '#flaky', '#history', '#coverage', '#requirements']) {
      await open(page, hash);
      await expect(page.locator('body'), `"API" shown on ${hash}`).not.toContainText(/\bAPI\b/, { useInnerText: true });
    }
    await page.locator('[data-help]').first().click();
    await expect(page.locator('#modalBody')).toContainText('UI tests only');
    await expect(page.locator('#modalBody')).not.toContainText(/\bAPI\b/, { useInnerText: true });
  });

  test('compares with the previous run and shows the streak', async ({ page }) => {
    await open(page);
    await expect(page.locator('#stats .delta')).toHaveCount(4);
    await expect(page.locator('#stats')).toContainText('Changes are from R-151');
    await expect(page.locator('#streak')).toHaveText('Below 80% for 10 runs in a row');
    await expect(page.locator('#ovTrend .hbar')).toHaveCount(10);
  });

  test('groups failures by shared error and copies a rerun command', async ({ page }) => {
    await open(page);
    const top = page.locator('#wErrors .wrow').first();
    await expect(top).toContainText('Patients Module Smoke');
    await expect(top.locator('.cnt')).toHaveText('5');
    await top.locator('[data-rerun-group]').click();
    const cmd = await page.evaluate(() => navigator.clipboard.readText());
    expect(cmd.startsWith('npx cucumber-js --profile web20 --name "')).toBe(true);
    expect(cmd.match(/--name "/g)).toHaveLength(5);
  });

  test('opens a test from the suite map', async ({ page }) => {
    await open(page);
    await page.locator('#board .sq.failed').first().click();
    await expect(page.locator('#modalBg')).toHaveClass(/open/);
    await expect(page.locator('#modalBody')).toContainText('Run it locally');
    await page.keyboard.press('Escape');
    await expect(page.locator('#modalBg')).not.toHaveClass(/open/);
  });

  test('says when it is showing sample data', async ({ page }) => {
    await open(page);
    await expect(page.locator('#notice')).toContainText('Showing sample data');
  });
});

test.describe('Suites', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('opens on the first failure and shows its details', async ({ page }) => {
    await open(page, '#suites');
    const first = page.locator('#atList .r-tree').first();
    await expect(first).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('#atDetail h2')).toHaveText(await first.locator('.t-name').innerText());
  });

  test('picking a test updates the details pane', async ({ page }) => {
    await open(page, '#suites');
    await page.locator('#atList .r-tree', { hasText: 'Session timeout' }).click();
    await expect(page.locator('#atDetail h2')).toHaveText('Session timeout redirects to login');
    await expect(page.locator('#atDetail')).toContainText('waitForURL');
    await page.locator('#atDetail [data-copy-bug]').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('[BUG]');
  });

  test('status filter and top search narrow the tree', async ({ page }) => {
    await open(page, '#suites');
    await page.locator('#atStatus [data-at="failed"]').click();
    await expect(page.locator('#atList .r-tree')).toHaveCount(11);
    await page.locator('#atStatus [data-at="all"]').click();
    await page.locator('#atSearch').fill('sidebar opens');
    await expect(page.locator('#atList .r-tree')).toHaveCount(7);
  });
});

test.describe('History and graphs', () => {
  test('history uses UI numbers and run details list UI suites only', async ({ page }) => {
    await open(page, '#history');
    const row = page.locator('#hiList tr', { hasText: 'R-150' });
    await expect(row).toContainText('60%');
    await row.click();
    await expect(page.locator('#modalBody')).toContainText('Patients Module Smoke');
    await expect(page.locator('#modalBody')).not.toContainText('CRM Reports');
  });

  test('graphs plot every run and remember the time range', async ({ page }) => {
    await open(page, '#graphs');
    await expect(page.locator('#gTrend .c-hit')).toHaveCount(10);
    await page.locator('#rangeSeg [data-range="0"]').click();
    await page.reload();
    await expect(page.locator('#rangeSeg [data-range="0"]')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('Navigation', () => {
  for (const [view, hash] of [['fx', '#categories'], ['at', '#suites'], ['gr', '#graphs'], ['fl', '#flaky'], ['hi', '#history'], ['cv', '#coverage'], ['rq', '#requirements'], ['ov', '#overview']]) {
    test(`sidebar opens ${hash}`, async ({ page }) => {
      await open(page);
      await page.locator(`#nav [data-view="${view}"]`).click();
      await expect(page.locator(`#view-${view}`)).toBeVisible();
      expect(new URL(page.url()).hash).toBe(hash);
    });
  }

  test('old links from earlier versions still work', async ({ page }) => {
    await open(page, '#fix');
    await expect(page.locator('#view-fx')).toBeVisible();
    await open(page, '#tests');
    await expect(page.locator('#view-at')).toBeVisible();
  });
});

test.describe('Data problems', () => {
  test('missing results.json shows a clear message', async ({ page }) => {
    await serveData(page, { 'results.json': null });
    await page.goto('/');
    await expect(page.locator('#headline')).toHaveText('No run data found');
    await expect(page.locator('#reloadBtn')).toBeVisible();
  });

  test('an old run shows the stale warning', async ({ page }) => {
    const res = sample('results.json');
    res.generatedAt = new Date(Date.now() - 3 * 86400_000).toISOString();
    await serveData(page, { 'results.json': res });
    await page.goto('/');
    await expect(page.locator('#notice')).toContainText('scheduled workflow');
  });

  test('config.js settings are used', async ({ page }) => {
    await page.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.DASHBOARD_CONFIG = { releaseThreshold: 50, rerunCommand: "npm run web20 --" };' }));
    await open(page);
    await expect(page.locator('#verdict')).toContainText('Ready to deploy, at or above 50%');
  });
});

test.describe('Accessibility and layout', () => {
  for (const hash of ['', '#suites', '#graphs', '#categories']) {
    test(`no WCAG A or AA issues on ${hash || '#overview'}`, async ({ page }) => {
      await open(page, hash);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(result.violations.map(v => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    });
  }

  test('no WCAG issues in light mode', async ({ page }) => {
    await open(page);
    await page.locator('[data-theme-set="light"]').click();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(result.violations.map(v => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  });

  test('phone width has no sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const hash of ['', '#suites', '#graphs', '#history']) {
      await open(page, hash);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    }
  });
});
