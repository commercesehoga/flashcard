// /api/youtube-transcript.js
//
//
// Install before deploying:
//   npm install youtube-transcript
//
// Request:  POST { url: "https://www.youtube.com/watch?v=..." }
// Response: 200 { videoId, transcript, segmentCount }
//           4xx/5xx { error }

const { YoutubeTranscript } = require("youtube-transcript");

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

    const segments = await YoutubeTranscript.fetchTranscript(videoId);

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
    res.status(500).json({
      error: "Could not fetch a transcript. The video may not have captions, or may be private/age-restricted/region-locked."
    });
  }
};
