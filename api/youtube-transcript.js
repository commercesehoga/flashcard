// /api/youtube-transcript.js
//
// Fetches the caption transcript for a YouTube video, server-side, so the
// client never talks to YouTube directly.
//
// Why this is layered: hitting YouTube's own internal transcript endpoint
// directly from a server (what npm packages like "youtube-transcript" and
// "youtube-transcript-plus" do) is widely reported to get blocked once
// deployed to any cloud platform (Vercel, Render, DigitalOcean, etc.),
// because YouTube treats datacenter IPs with suspicion regardless of
// User-Agent. To get a transcript reliably, we instead chain through a
// handful of independent sources in order, falling through to the next one
// on any failure:
//
//   1. youtube-transcript.ai   — free hosted transcript service, no key
//   2. youtube-transcriber-api — community Vercel-hosted wrapper (Python/jdepoix)
//   3. youtube-transcript-api-tau-one — community Vercel-hosted wrapper
//   4. youtube-transcript-plus (npm) — direct-to-YouTube fallback of last resort
//
// Sources 2-3 are community-run projects and can occasionally go down or
// change shape; that's fine here since they're fallbacks, not the only path.
//
// Request:  POST { url: "https://www.youtube.com/watch?v=..." }
// Response: 200 { videoId, transcript, segmentCount? }
//           4xx/5xx { error }

function extractVideoId(input) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  // Already a bare 11-char video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return url.pathname.slice(1).split("/")[0] || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2];
      if (url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2];
      if (url.pathname.startsWith("/live/")) return url.pathname.split("/")[2];
    }
  } catch (e) {
    // not a parseable URL
  }
  return null;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ── Source 1: youtube-transcript.ai ────────────────────────────────────────
// Returns Markdown: a YAML front-matter block, then "[m:ss] line" transcript.
async function tryYoutubeTranscriptAi(videoId) {
  const res = await fetch(`https://youtube-transcript.ai/transcript/${encodeURIComponent(videoId)}.txt`, {
    headers: { "User-Agent": "ThunderStudyFlashcards/1.0 (transcript-fetch)", "Accept": "text/plain, text/markdown, */*" }
  });
  if (!res.ok) throw new Error(`youtube-transcript.ai status ${res.status}`);

  let text = await res.text();
  text = text.replace(/^---[\s\S]*?---\s*/m, "");       // strip YAML front-matter
  text = text.replace(/\[\d+:\d+\]/g, "");                // strip [m:ss] timestamps
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  if (text.length < 50) throw new Error("youtube-transcript.ai returned empty/short text");
  return text;
}

// ── Source 2: youtube-transcriber-api.vercel.app (community, Python/jdepoix) ──
async function tryMongjFallback(videoId) {
  const res = await fetch(`https://youtube-transcriber-api.vercel.app/v1/transcripts?id=${encodeURIComponent(videoId)}&type=text&lang=en`, {
    headers: { "User-Agent": "ThunderStudyFlashcards/1.0" }
  });
  if (!res.ok) throw new Error(`mongj fallback status ${res.status}`);

  const data = await res.json();
  const transcripts = Array.isArray(data.transcripts) ? data.transcripts : [];
  const text = (transcripts[0]?.text || "").trim();
  if (text.length < 50) throw new Error("mongj fallback returned empty/short text");
  return text;
}

// ── Source 3: youtube-transcript-api-tau-one.vercel.app (community) ────────
async function tryJaypaunFallback(videoId) {
  const res = await fetch("https://youtube-transcript-api-tau-one.vercel.app/transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "ThunderStudyFlashcards/1.0" },
    body: JSON.stringify({ video_url: `https://www.youtube.com/watch?v=${videoId}` })
  });
  if (!res.ok) throw new Error(`jaypaun fallback status ${res.status}`);

  const data = await res.json();
  const text = (data.transcript || "").trim();
  if (text.length < 50) throw new Error("jaypaun fallback returned empty/short text");
  return text;
}

// ── Source 4: youtube-transcript-plus (npm, direct to YouTube) ─────────────
// Last resort — talks to YouTube directly with a real browser User-Agent.
// Most likely to get blocked on a cloud IP, but costs nothing to try.
async function tryYoutubeTranscriptPlus(videoId) {
  const { fetchTranscript } = require("youtube-transcript-plus");
  const result = await fetchTranscript(videoId, { userAgent: UA, retries: 1, retryDelay: 500 });
  const segments = Array.isArray(result) ? result : result?.segments;
  if (!segments || segments.length === 0) throw new Error("youtube-transcript-plus returned no segments");

  const text = segments.map(s => s.text).join(" ").replace(/\s+/g, " ").trim();
  if (text.length < 50) throw new Error("youtube-transcript-plus returned empty/short text");
  return { text, segmentCount: segments.length };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const { url } = req.body || {};
  const videoId = extractVideoId(url);

  if (!videoId) {
    res.status(400).json({ error: "Could not find a valid YouTube video ID in that link." });
    return;
  }

  const sources = [
    { name: "youtube-transcript.ai", run: tryYoutubeTranscriptAi },
    { name: "youtube-transcriber-api", run: tryMongjFallback },
    { name: "youtube-transcript-api-tau-one", run: tryJaypaunFallback },
  ];

  for (const source of sources) {
    try {
      const text = await source.run(videoId);
      const transcript = text.slice(0, 20000);
      res.status(200).json({ videoId, transcript });
      return;
    } catch (err) {
      console.warn(`[youtube-transcript] ${source.name} failed:`, err.message);
    }
  }

  // Last resort: direct-to-YouTube npm package
  try {
    const { text, segmentCount } = await tryYoutubeTranscriptPlus(videoId);
    res.status(200).json({ videoId, transcript: text.slice(0, 20000), segmentCount });
    return;
  } catch (err) {
    console.warn("[youtube-transcript] youtube-transcript-plus failed:", err.message);
  }

  res.status(502).json({
    error: "Could not fetch a transcript. The video may not have captions, or may be private/age-restricted/region-locked."
  });
};
