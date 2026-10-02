/**
 * src/api/url.js — page fetcher for the "Extract from Website or Article" feature.
 *
 * The browser cannot fetch other sites directly (CORS), so this endpoint fetches the page and
 * hands the raw HTML straight back. All the CPU-heavy work (Readability article extraction)
 * runs in the browser — see extractArticleFromHtml() in public/app.html — which keeps this
 * function within Cloudflare's free-plan CPU limit (10 ms per request).
 *
 * POST { url }  ->  200 text/html (page body, capped at 2 MB, X-Final-Url header)
 *                   4xx/5xx application/json { error }
 */

import { json, guard, readBody, CORS } from '../util.js';

const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB HTML cap
const TIMEOUT_MS = 10_000;

// Hostnames / IPv4 / IPv6 literals that must never be fetched (SSRF guard).
function isBlockedHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || h.startsWith('fe80:') || h.startsWith('::ffff:')) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

export default async function handler(request) {
  const early = guard(request);
  if (early) return early;

  const { url } = await readBody(request);
  if (!url || typeof url !== 'string') return json({ error: 'url is required' }, 400);

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('invalid protocol');
  } catch {
    return json({ error: 'Invalid URL — must start with http:// or https://' }, 400);
  }

  if (isBlockedHost(parsedUrl.hostname)) {
    return json({ error: 'Private/internal URLs are not allowed' }, 403);
  }

  try {
    const response = await fetch(parsedUrl.href, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ThunderStudyBot/1.0; +https://thunderstudy.indevs.in)',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      return json({ error: `Failed to fetch page: HTTP ${response.status}` }, 502);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return json({ error: 'URL does not point to an HTML page' }, 422);
    }
    if (!response.body) return json({ error: 'The page was empty' }, 422);

    // Stream the body through, cutting it off at MAX_HTML_BYTES (near-zero CPU).
    let total = 0;
    const cap = new TransformStream({
      transform(chunk, controller) {
        total += chunk.byteLength;
        if (total > MAX_HTML_BYTES) {
          controller.enqueue(chunk.slice(0, chunk.byteLength - (total - MAX_HTML_BYTES)));
          controller.terminate();
        } else {
          controller.enqueue(chunk);
        }
      }
    });

    return new Response(response.body.pipeThrough(cap), {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': contentType,   // keep upstream charset so non-UTF-8 pages decode correctly
        'X-Final-Url': response.url || parsedUrl.href,
        'Access-Control-Expose-Headers': 'X-Final-Url',
        'Cache-Control': 'no-store'
      }
    });

  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return json({ error: 'Page took too long to respond (>10s)' }, 504);
    }
    console.error('[api/url] error:', err);
    return json({ error: err.message || 'Unknown error fetching URL' }, 500);
  }
}
