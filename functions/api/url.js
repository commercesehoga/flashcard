// Cloudflare Pages Function -> POST /api/url
import handler from '../../src/api/url.js';

export const onRequest = ({ request, env, waitUntil }) => handler(request, env, { waitUntil });
