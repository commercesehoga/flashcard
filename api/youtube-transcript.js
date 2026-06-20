// /api/youtube-transcript.js
//
// Fetches the caption transcript for a YouTube video, server-side, so the
// client never talks to YouTube directly (avoids CORS and keeps this a
// single fetch() call from the frontend).
//
// Uses youtube-transcript-plus (dependency declared in package.json — Vercel
// installs it automatically on deploy). This is a maintained fork of the
// older "youtube-transcript" package, which is widely reported to get
// blocked by YouTube once deployed to any cloud platform (Vercel, Render,
// DigitalOcean, etc.) because it sends no/blank User-Agent header from
// server IPs. youtube-transcript-plus fixes that by letting us send a real
// desktop-browser User-Agent, which is what actually avoids the block —
// just installing a package is not enough on its own.
//
// Request:  POST { url: "https://www.youtube.com/watch?v=..." }
// Response: 200 { videoId, transcript, segmentCount }
//           4xx/5xx { error }

const { fetchTranscript } = require("youtube-transcript-plus");

// A realistic, current desktop Chrome UA. YouTube is far less likely to
// challenge/block requests that look like a normal browser.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  try {
    const { url } = req.body || {};
    const videoId = extractVideoId(url);

    if (!videoId) {
      res.status(400).json({ error: "Could not find a valid YouTube video ID in that link." });
      return;
    }

    const result = await fetchTranscript(videoId, {
      userAgent: BROWSER_UA,
      retries: 2,
      retryDelay: 800
    });

    // youtube-transcript-plus returns { videoDetails, segments }
    const segments = Array.isArray(result) ? result : result?.segments;

    if (!segments || segments.length === 0) {
      res.status(404).json({ error: "No captions/transcript found for that video." });
      return;
    }

    const transcript = segments
      .map(s => s.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 20000); // keep payload reasonable for the flashcard generator

    res.status(200).json({
      videoId,
      transcript,
      segmentCount: segments.length
    });
  } catch (err) {
    console.error("youtube-transcript error:", err);
    const msg = (err && err.message) || "";
    let friendly = "Could not fetch a transcript. The video may not have captions, or may be private/age-restricted/region-locked.";
    if (/disabled/i.test(msg)) friendly = "Captions/transcript are disabled for that video.";
    if (/too many requests|rate.?limit/i.test(msg)) friendly = "YouTube is rate-limiting transcript requests right now. Try again shortly.";
    res.status(500).json({ error: friendly });
  }
};
