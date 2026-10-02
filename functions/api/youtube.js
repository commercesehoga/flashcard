// Cloudflare Pages Function -> POST /api/youtube
import handler from '../../src/api/youtube.js';

export const onRequest = ({ request, env, waitUntil }) => handler(request, env, { waitUntil });
