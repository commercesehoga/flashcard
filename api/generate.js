// Vercel Serverless Function — runs on the server, never sent to the browser.
// Reads GROQ_API_KEY from Vercel's Environment Variables.
// Rate limits: 5 requests/day, 20 requests/week per IP.
// Tokens are NOT deducted if generation fails or AI returns bad output.

const DAY_MS  = 24 * 60 * 60 * 1000;
const WEEK_MS = 7  * DAY_MS;
const DAILY_LIMIT  = 5;
const WEEKLY_LIMIT = 20;

// In-memory store (resets on cold start — for persistent limits use Vercel KV)
const ipStore = new Map();

function getIpRecord(ip) {
  const now = Date.now();
  let rec = ipStore.get(ip);
  if (!rec) {
    rec = { day: { count: 0, resetAt: now + DAY_MS }, week: { count: 0, resetAt: now + WEEK_MS } };
    ipStore.set(ip, rec);
  }
  if (now > rec.day.resetAt)  { rec.day  = { count: 0, resetAt: now + DAY_MS  }; }
  if (now > rec.week.resetAt) { rec.week = { count: 0, resetAt: now + WEEK_MS }; }
  return rec;
}

function checkLimit(ip) {
  const rec = getIpRecord(ip);
  if (rec.day.count  >= DAILY_LIMIT)  return { exceeded: true, reason: "daily",  remaining: 0 };
  if (rec.week.count >= WEEKLY_LIMIT) return { exceeded: true, reason: "weekly", remaining: 0 };
  return {
    exceeded: false,
    dailyRemaining:  DAILY_LIMIT  - rec.day.count  - 1,
    weeklyRemaining: WEEKLY_LIMIT - rec.week.count - 1
  };
}

function consumeToken(ip) {
  const rec = getIpRecord(ip);
  rec.day.count++;
  rec.week.count++;
}

function refundToken(ip) {
  const rec = ipStore.get(ip);
  if (!rec) return;
  if (rec.day.count  > 0) rec.day.count--;
  if (rec.week.count > 0) rec.week.count--;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is missing GROQ_API_KEY. Add it in Vercel: Project Settings → Environment Variables, then redeploy." });
    return;
  }

  // Rate limit check
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  const limitCheck = checkLimit(ip);
  if (limitCheck.exceeded) {
    const resetLabel = limitCheck.reason === "daily" ? "tomorrow" : "next week";
    res.status(429).json({
      error: `You have reached your ${limitCheck.reason} limit (${limitCheck.reason === "daily" ? DAILY_LIMIT : WEEKLY_LIMIT} generations). Try again ${resetLabel}.`,
      limitExceeded: true,
      reason: limitCheck.reason
    });
    return;
  }

  const { sourceContent, examLabel, count } = req.body || {};

  if (!sourceContent || typeof sourceContent !== "string") {
    res.status(400).json({ error: "Missing sourceContent." });
    return;
  }

  const safeCount = Math.min(Math.max(parseInt(count, 10) || 10, 3), 25);

  // Consume token BEFORE the call
  consumeToken(ip);

  const systemPrompt = `You are an expert exam tutor and flashcard creator. You write clear, accurate, exam-focused flashcards.
Output ONLY valid JSON, no markdown fences, no preamble, no explanation. The JSON must match exactly this shape:
{"exam_detected":"string naming the exam/context (e.g. 'Class 12 CBSE Physics', 'NEET Biology', 'JEE Chemistry', 'Banking Awareness', 'SSC General Studies', 'CUET Commerce', or a sensible label if general)","cards":[{"front":"question text","back":"answer text"}]}
Rules:
- Generate exactly ${safeCount} cards.
- "front" is a short, clear question or prompt (max ~25 words).
- "back" is a correct, concise, exam-ready answer (max ~60 words), accurate and specific — no vague filler.
- If an exam context is given, tailor difficulty, terminology and depth to that exam. If not given, infer the most likely exam/subject from the content.
- Do not repeat the same fact twice across cards.
- Never include markdown formatting, asterisks, or numbering inside front/back text.`;

  const userPrompt = `Exam/context hint: ${examLabel || "not specified, please infer"}
Number of cards required: ${safeCount}
Source content (topic, question, or extracted document text):
"""
${String(sourceContent).slice(0, 18000)}
"""`;

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        // llama-3.3-70b-versatile was deprecated by Groq (announced 2026-06-17).
        // openai/gpt-oss-120b is Groq's recommended replacement: 131K context,
        // JSON mode support, similar quality/speed for this kind of structured
        // extraction task. reasoning_effort "low" keeps it fast and avoids
        // burning the completion-token budget on hidden reasoning steps that
        // a straightforward flashcard-extraction task doesn't need.
        model: "openai/gpt-oss-120b",
        // Groq reasoning models REQUIRE temperature=1; any other value is rejected.
        // max_completion_tokens must cover reasoning tokens + output tokens (8192 is safe).
        temperature: 1,
        max_completion_tokens: 8192,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt   }
        ],
        response_format: { type: "json_object" }
      }),
      // Streaming note: Groq supports SSE streaming; to add it, set stream:true
      // and pipe groqRes.body directly to res with Transfer-Encoding: chunked.
      // Keeping JSON mode for now for reliable structured output.
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("Groq error:", errText);

      // Refund token on Groq-side failure
      refundToken(ip);

      let friendlyError = "Generation failed. Please try again.";
      if (groqRes.status === 429) friendlyError = "AI service is busy right now. Please wait a moment and try again.";
      if (groqRes.status === 401) friendlyError = "API key is invalid or expired. Contact support.";
      if (groqRes.status === 503) friendlyError = "AI service is temporarily unavailable. Try again in a minute.";
      if (groqRes.status === 413) friendlyError = "Request too large for the AI service. Try fewer cards or a shorter source text.";
      if (groqRes.status === 400) {
        // Surface the real reason (e.g. bad params, model decommissioned)
        let detail = "";
        try { detail = JSON.parse(errText)?.error?.message || ""; } catch (e) { /* not JSON */ }
        friendlyError = detail ? `Generation failed: ${detail}` : "Generation failed — the request was rejected by the AI service. Please try again.";
      }

      // Always return 502 to the browser so the client never sees a leaked Groq status.
      // (e.g. Groq 413 forwarded as-is caused the browser to misinterpret a Groq-side
      // payload error as a client request error and broke res.json() in the frontend.)
      res.status(502).json({ error: friendlyError, refunded: true });
      return;
    }

    const data = await groqRes.json();
    let raw = data.choices?.[0]?.message?.content || "";
    raw = raw.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Refund on parse failure
      refundToken(ip);
      res.status(502).json({ error: "AI returned malformed output. Your token has been refunded — please try again.", refunded: true });
      return;
    }

    if (!parsed.cards || !Array.isArray(parsed.cards) || parsed.cards.length === 0) {
      refundToken(ip);
      res.status(422).json({ error: "AI generated no cards. Your token has been refunded. Try rephrasing your topic.", refunded: true });
      return;
    }

    res.status(200).json({
      ...parsed,
      usage: {
        dailyRemaining:  limitCheck.dailyRemaining,
        weeklyRemaining: limitCheck.weeklyRemaining
      }
    });
  } catch (err) {
    console.error(err);
    refundToken(ip);
    res.status(500).json({ error: "Network error reaching the AI service. Your token has been refunded.", refunded: true });
  }
}
