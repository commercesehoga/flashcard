// Vercel Serverless Function — runs on the server, never sent to the browser.
// Reads GROQ_API_KEY from Vercel's Environment Variables (Project Settings -> Environment Variables).
// The frontend (index.html) calls this endpoint at /api/generate instead of calling Groq directly,
// so the real API key is never exposed in the page source.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "Server is missing GROQ_API_KEY. Add it in Vercel: Project Settings -> Environment Variables, then redeploy."
    });
    return;
  }

  const { sourceContent, examLabel, count } = req.body || {};

  if (!sourceContent || typeof sourceContent !== "string") {
    res.status(400).json({ error: "Missing sourceContent." });
    return;
  }

  const safeCount = Math.min(Math.max(parseInt(count, 10) || 10, 3), 25);

  const systemPrompt = `You are an expert exam tutor and flashcard creator. You write clear, accurate, exam-focused flashcards.
Output ONLY valid JSON, no markdown fences, no preamble, no explanation. The JSON must match exactly this shape:
{"exam_detected":"string naming the exam/context this content fits (e.g. 'Class 12 CBSE Physics', 'NEET Biology', 'JEE Chemistry', 'Banking Awareness', 'SSC General Studies', or a sensible label if general)","cards":[{"front":"question text","back":"answer text"}]}
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
        model: "llama-3.3-70b-versatile",
        temperature: 0.4,
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("Groq error:", errText);
      res.status(groqRes.status).json({ error: "Groq API error", detail: errText });
      return;
    }

    const data = await groqRes.json();
    let raw = data.choices?.[0]?.message?.content || "";
    raw = raw.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      res.status(502).json({ error: "AI returned malformed JSON." });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unexpected server error reaching Groq." });
  }
}
