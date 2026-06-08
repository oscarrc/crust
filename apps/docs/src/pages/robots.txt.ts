import type { APIRoute } from 'astro';

const getRobotsTxt = (siteURL: URL) => `\
User-agent: *
Allow: /

Sitemap: ${siteURL.href}sitemap-index.xml
LLMs: ${siteURL.href}llms.txt
`;

export const GET: APIRoute = ({ site }) => {
  const siteURL = new URL('', site);
  return new Response(getRobotsTxt(siteURL));
};