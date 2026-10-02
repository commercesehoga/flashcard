const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;
const DAILY_LIMIT = 5;
const WEEKLY_LIMIT = 20;
const usage = new Map();
const models = [
  ["openai/gpt-oss-120b", 800, { reasoning_effort: "low" }],
  ["openai/gpt-oss-20b", 800, { reasoning_effort: "low" }],
  ["llama-3.3-70b-versatile", 0, {}],
  ["llama-3.1-8b-instant", 0, {}]
];
const deadModels = new Set();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
}
function record(ip) {
  const now = Date.now(); let item = usage.get(ip);
  if (!item) item = { day: { count: 0, reset: now + DAY_MS }, week: { count: 0, reset: now + WEEK_MS } };
  if (now > item.day.reset) item.day = { count: 0, reset: now + DAY_MS };
  if (now > item.week.reset) item.week = { count: 0, reset: now + WEEK_MS };
  usage.set(ip, item); return item;
}
function refund(ip) { const item = record(ip); item.day.count = Math.max(0, item.day.count - 1); item.week.count = Math.max(0, item.week.count - 1); }

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return json({}, 200);
  if (context.request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const key = context.env.GROQ_API_KEY;
  if (!key) return json({ error: "Server is missing GROQ_API_KEY. Add it to Cloudflare Pages → Settings → Environment variables, then redeploy." }, 500);
  const ip = context.request.headers.get("CF-Connecting-IP") || context.request.headers.get("x-forwarded-for") || "unknown";
  const item = record(ip);
  if (item.day.count >= DAILY_LIMIT) return json({ error: `You have reached your daily limit (${DAILY_LIMIT} generations). Try again tomorrow.`, limitExceeded: true, reason: "daily" }, 429);
  if (item.week.count >= WEEKLY_LIMIT) return json({ error: `You have reached your weekly limit (${WEEKLY_LIMIT} generations). Try again next week.`, limitExceeded: true, reason: "weekly" }, 429);
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: "Invalid JSON request." }, 400); }
  if (!body?.sourceContent || typeof body.sourceContent !== "string") return json({ error: "Missing sourceContent." }, 400);
  const count = Math.min(Math.max(parseInt(body.count, 10) || 10, 3), 25);
  const maxTokens = Math.min(3200, count * 120 + 200);
  item.day.count++; item.week.count++;
  const systemPrompt = `You are an expert exam tutor and flashcard creator. Output ONLY valid JSON in this exact shape: {"exam_detected":"string","cards":[{"front":"question text","back":"answer text"}]}. Generate exactly ${count} cards. Fronts must be short questions (about 25 words max); backs must be accurate, concise, exam-ready answers (about 60 words max). Tailor the difficulty to the exam context. Do not repeat facts. Do not use markdown, numbering, or explanations outside the JSON. If the source is too short, return only the useful cards available and explain the limitation in exam_detected.`;
  const userPrompt = `Exam/context hint: ${body.examLabel || "not specified, infer it"}\nNumber of cards required: ${count}\nSource content:\n"""\n${String(body.sourceContent).slice(0, 3000)}\n"""`;
  let response = null, lastError = null;
  try {
    for (const [model, extraTokens, extra] of models) {
      if (deadModels.has(model)) continue;
      try {
        response = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(12000), body: JSON.stringify({ model, temperature: 0.7, max_completion_tokens: maxTokens + extraTokens, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], response_format: { type: "json_object" }, ...extra }) });
      } catch (error) { lastError = error; response = null; continue; }
      if (response.ok || response.status === 401 || response.status === 403) break;
      const text = await response.clone().text();
      if (response.status === 404 || /decommission|deprecat|does not exist|not found/i.test(text)) deadModels.add(model);
    }
    if (!response) throw lastError || new Error("No AI model available");
    if (!response.ok) {
      const text = await response.text(); refund(ip);
      let message = "Generation failed. Please try again.";
      if (response.status === 401 || response.status === 403) message = "API key is invalid or expired. Check GROQ_API_KEY in Cloudflare Pages settings.";
      else if (response.status === 429) message = "AI service is busy right now. Please wait a moment and try again.";
      else if (response.status === 413) message = "Your content is too long for the current AI rate limit. Try a shorter source or fewer cards.";
      else if (response.status === 400) { try { const detail = JSON.parse(text)?.error?.message; if (detail) message = `Generation failed: ${detail}`; } catch (e) {} }
      return json({ error: message, refunded: true }, response.status);
    }
    const data = await response.json(); const message = data.choices?.[0]?.message || {}; let raw = message.content || message.reasoning_content || message.reasoning || "";
    raw = raw.replace(/<\|[^|]*\|>/g, "").trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { const first = raw.indexOf("{"); const last = raw.lastIndexOf("}"); if (first >= 0 && last > first) { try { parsed = JSON.parse(raw.slice(first, last + 1)); } catch (ignored) {} } }
    if (!parsed?.cards?.length) { refund(ip); return json({ error: "AI returned no usable cards. Your token has been refunded — please try again.", refunded: true }, 422); }
    return json({ ...parsed, usage: { dailyRemaining: DAILY_LIMIT - item.day.count, weeklyRemaining: WEEKLY_LIMIT - item.week.count } });
  } catch (error) { refund(ip); console.error(error); return json({ error: "Network error reaching the AI service. Your token has been refunded.", refunded: true }, 500); }
}
