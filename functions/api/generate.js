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


// ---- Helpers: always deliver the requested number of cards ----
function cleanLabel(label, fallback) {
  let s = String(label || "").replace(/\s+/g, " ").trim();
  const looksLikeNote = !s || s.length > 60 || /limited|insufficient|too short|unclear|garbled|not enough|only the phrase|source content/i.test(s);
  return looksLikeNote ? (fallback || "General Study") : s;
}

function cleanCards(list) {
  const seen = new Set();
  const out = [];
  for (const c of Array.isArray(list) ? list : []) {
    const front = String(c && c.front || "").replace(/\s+/g, " ").trim();
    const back  = String(c && c.back  || "").replace(/\s+/g, " ").trim();
    if (!front || !back) continue;
    const key = front.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ front, back });
  }
  return out;
}

function parseModelJson(raw) {
  raw = String(raw || "").replace(/<\|[^|]*\|>/g, "").trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  try { return JSON.parse(raw); } catch (e) {}
  const first = raw.indexOf("{"), last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) { try { return JSON.parse(raw.slice(first, last + 1)); } catch (e) {} }
  return null;
}

// Builds the follow-up request that asks only for the cards still missing.
function topUpPrompts(source, examLabel, missing, haveCards) {
  const system = `You are an expert exam tutor and flashcard creator. Output ONLY valid JSON: {"cards":[{"front":"question","back":"answer"}]}. Return exactly ${missing} NEW cards. The source may be a very short topic, a single word or even a single letter: treat it as a topic and use your own subject knowledge. Silently fix spelling. Fronts are short questions (max ~25 words), backs are accurate exam-ready answers (max ~60 words). No markdown, no numbering, never mention that the source is short.`;
  const user = `Exam/context hint: ${examLabel || "infer from the topic"}\nTopic/source: """${String(source).slice(0, 1500)}"""\nCards that already exist (do NOT repeat these):\n${haveCards.map(c => "- " + c.front).join("\n")}\nWrite exactly ${missing} new, different cards.`;
  return { system, user };
}

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
  const systemPrompt = `You are an expert exam tutor and flashcard creator. Output ONLY valid JSON in this exact shape: {"exam_detected":"string","cards":[{"front":"question text","back":"answer text"}]}. Generate exactly ${count} cards. Fronts must be short questions (about 25 words max); backs must be accurate, concise, exam-ready answers (about 60 words max). Tailor the difficulty to the exam context. Do not repeat facts. Do not use markdown, numbering, or explanations outside the JSON. ALWAYS return exactly ${count} cards however short or vague the source is. A short source (a single letter, word, phrase or a misspelled topic) is a TOPIC: use your own subject knowledge to write ${count} distinct, accurate, exam-style cards about it, silently fixing spelling and inferring the most likely meaning. If the source is a single letter or symbol, build cards on its most exam-relevant meanings (vitamins, blood groups, element symbols, SI units, grammar, abbreviations) and mix subjects. Never complain about the source or say it is short or unclear. exam_detected must be a short label of at most 6 words, never a sentence.`;
  const isShortTopic = String(body.sourceContent).trim().length < 60;
  const userPrompt = `Exam/context hint: ${body.examLabel || "not specified, infer it"}\nNumber of cards required: ${count}\n${isShortTopic ? "The source below is only a short topic/keyword (possibly a single letter or misspelled). Treat it as a topic and still write " + count + " full cards from your own knowledge.\n" : ""}Source content:\n"""\n${String(body.sourceContent).slice(0, 3000)}\n"""`;
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
    let cards = cleanCards(parsed && parsed.cards);
    if (!cards.length) { refund(ip); return json({ error: "AI returned no usable cards. Your token has been refunded — please try again.", refunded: true }, 422); }
    // Top up when the AI returns fewer cards than requested (common for tiny topics).
    for (let attempt = 0; attempt < 2 && cards.length < count; attempt++) {
      const missing = count - cards.length;
      const p = topUpPrompts(body.sourceContent, body.examLabel, missing, cards);
      try {
        let extra = null;
        for (const [model, extraTokens, extraOpts] of models) {
          if (deadModels.has(model)) continue;
          try {
            extra = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000), body: JSON.stringify({ model, temperature: 0.8, max_completion_tokens: Math.min(3200, missing * 120 + 200) + extraTokens, messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }], response_format: { type: "json_object" }, ...extraOpts }) });
          } catch (e) { extra = null; continue; }
          if (extra.ok) break;
        }
        if (!extra || !extra.ok) break;
        const extraData = await extra.json(); const em = extraData.choices?.[0]?.message || {};
        const extraParsed = parseModelJson(em.content || em.reasoning_content || em.reasoning || "");
        const merged = cleanCards(cards.concat((extraParsed && extraParsed.cards) || []));
        if (merged.length === cards.length) break;
        cards = merged;
      } catch (e) { break; }
    }
    cards = cards.slice(0, count);
    return json({ exam_detected: cleanLabel(parsed.exam_detected, body.examLabel), cards, usage: { dailyRemaining: DAILY_LIMIT - item.day.count, weeklyRemaining: WEEKLY_LIMIT - item.week.count } });
  } catch (error) { refund(ip); console.error(error); return json({ error: "Network error reaching the AI service. Your token has been refunded.", refunded: true }, 500); }
}
