import { test, expect } from '@playwright/test';

const SITE = 'https://crust.oscarrc.me';

// The pages @astrojs/sitemap is expected to enumerate (all static routes
// except the robots.txt / sitemap endpoints themselves).
const EXPECTED_URLS = [
  `${SITE}/`,
  `${SITE}/docs/`,
  `${SITE}/docs/api/`,
  `${SITE}/docs/theming/`,
  `${SITE}/playground/`
];

test('sitemap-index.xml is served and points at the url set', async ({ request }) => {
  const response = await request.get('/sitemap-index.xml');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('xml');

  const body = await response.text();
  expect(body).toContain('<sitemapindex');
  expect(body).toContain(`${SITE}/sitemap-0.xml`);
});

test('sitemap-0.xml lists every public page', async ({ request }) => {
  const response = await request.get('/sitemap-0.xml');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('xml');

  const body = await response.text();
  expect(body).toContain('<urlset');
  for (const url of EXPECTED_URLS) {
    expect(body).toContain(`<loc>${url}</loc>`);
  }
});

test('robots.txt allows crawling and references the sitemap index', async ({ request }) => {
  const response = await request.get('/robots.txt');
  expect(response.status()).toBe(200);

  const body = await response.text();
  expect(body).toContain('User-agent: *');
  expect(body).toContain('Allow: /');
  expect(body).toContain(`Sitemap: ${SITE}/sitemap-index.xml`);
});

test('the layout advertises the sitemap to crawlers', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="sitemap"]')).toHaveAttribute(
    'href',
    '/sitemap-index.xml'
  );
});
