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

  // Groq's free tier enforces a Tokens-Per-Minute (TPM) budget that covers
  // BOTH the input prompt and the max_tokens reserved for the reply — a flat
  // 4096 reservation wastes budget on small decks and pushes larger ones
  // over the limit (returns a 413 "rate_limit_exceeded" from Groq, despite
  // the misleading name). Scale the reservation to what this deck actually
  // needs: ~130 tokens/card (front+back+JSON overhead) plus a small buffer.
  const maxTokensForReply = Math.min(4096, safeCount * 140 + 300);

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
- Never include markdown formatting, asterisks, or numbering inside front/back text.
- If the source content is too short, garbled, or unclear to extract ${safeCount} distinct facts from, still return valid JSON: generate as many genuinely useful cards as the content supports (even just 1-2), and set "exam_detected" to a brief note explaining the content was limited. Never reply with plain text or an explanation outside the JSON shape — always return the JSON object.`;

  const userPrompt = `Exam/context hint: ${examLabel || "not specified, please infer"}
Number of cards required: ${safeCount}
Source content (topic, question, or extracted document text):
"""
${String(sourceContent).slice(0, 4000)}
"""`;

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.4,
        max_tokens: maxTokensForReply,
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
      if (groqRes.status === 413) {
        // Groq returns 413 for its per-minute token (TPM) rate limit, not
        // literal request byte size — the name is misleading. Surface the
        // real reason so it's clear this is a content-length/rate issue.
        friendlyError = "Your content is too long for the current AI rate limit. Try a shorter topic, fewer pages, or a shorter transcript excerpt.";
      }
      if (groqRes.status === 400) {
        // Surface the real reason (e.g. model decommissioned, bad request shape,
        // or — most commonly for this app — the model couldn't find usable
        // content in the source text, e.g. a scanned/image-based PDF that
        // extracted as garbled or near-empty text) instead of a generic
        // message, so this is debuggable and actionable for the user.
        let detail = "";
        let failedGeneration = "";
        try {
          const parsedErr = JSON.parse(errText)?.error;
          detail = parsedErr?.message || "";
          failedGeneration = parsedErr?.failed_generation || "";
        } catch (e) { /* not JSON */ }

        if (failedGeneration) {
          friendlyError = `The AI couldn't find usable content to make flashcards from: "${failedGeneration.slice(0, 200)}". If this was a PDF, it may be scanned/image-based — try the Image (OCR) tab instead, or paste the topic directly.`;
        } else {
          friendlyError = detail ? `Generation failed: ${detail}` : "Generation failed — the request was rejected by the AI service. Please try again.";
        }
      }

      res.status(groqRes.status).json({ error: friendlyError, refunded: true });
      return;
    }

    const data = await groqRes.json();
    const msg = data.choices?.[0]?.message || {};
    let raw = msg.content || msg.reasoning_content || msg.reasoning || "";

    // Defensive cleanup in case the model wraps the JSON in code fences
    // or stray tokens despite response_format/system prompt instructions.
    raw = raw
      .replace(/<\|[^|]*\|>/g, "")
      .trim()
      .replace(/^```json/i, "")
      .replace(/^```/, "")
      .replace(/```$/, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // Fallback: pull out the outermost {...} block in case the model
      // wrapped the JSON in extra prose/reasoning despite instructions.
      const first = raw.indexOf("{");
      const last = raw.lastIndexOf("}");
      if (first !== -1 && last !== -1 && last > first) {
        try {
          parsed = JSON.parse(raw.slice(first, last + 1));
        } catch (e2) {
          parsed = null;
        }
      }
    }

    if (!parsed) {
      console.error("Could not parse AI output. Raw content was:", raw.slice(0, 2000));
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
