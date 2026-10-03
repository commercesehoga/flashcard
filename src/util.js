// Shared helpers for the Pages Function handlers.

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// JSON response with CORS headers.
export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS }
  });
}

// CORS preflight / method guard. Returns a Response to short-circuit, or null to continue.
export function guard(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  return null;
}

// Parse the JSON body; bad / empty body -> {}.
export async function readBody(request) {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) || {} : {};
  } catch {
    return {};
  }
}
