// /api/ocr.js
//
// Free image-to-text OCR — no API key, no paid service.
// Runs entirely server-side (this file only) so the client never ships the
// OCR engine — it just uploads an image and gets text back.
//
// Uses Tesseract.js (MIT licensed, pure JS/WASM port of the Tesseract OCR
// engine — works on Node serverless with no system binary required):
//   https://github.com/naptha/tesseract.js
//
// Dependency is declared in package.json ("tesseract.js") so Vercel installs
// it automatically during the build — nothing to do manually.
//
// Note: plain Vercel serverless functions (this file's style) have a hard
// ~4.5MB request body limit, so very large/uncompressed images may be
// rejected before this code even runs. Compress images client-side if you
// hit that limit.
//
// Request:  POST { image: "data:image/png;base64,...." , lang?: "eng" }
// Response: 200 { text, confidence }
//           4xx/5xx { error }

const { createWorker } = require("tesseract.js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  let worker;
  try {
    const { image, lang } = req.body || {};

    if (!image || typeof image !== "string") {
      res.status(400).json({ error: "No image provided." });
      return;
    }

    // Accept either a data: URL or a raw base64 string
    const imageData = image.startsWith("data:")
      ? image
      : `data:image/png;base64,${image}`;

    // createWorker downloads/caches the wasm core + language data on first
    // run (cold start). Subsequent warm invocations on the same instance
    // reuse Vercel's filesystem cache, so only the very first request after
    // a deploy is slow.
    worker = await createWorker(lang || "eng");

    const { data } = await worker.recognize(imageData);
    const text = (data && data.text ? data.text : "").trim();

    if (!text) {
      res.status(404).json({ error: "No readable text was found in that image. Try a clearer photo or scan." });
      return;
    }

    res.status(200).json({
      text: text.slice(0, 20000),
      confidence: data.confidence
    });
  } catch (err) {
    console.error("ocr error:", err);
    res.status(500).json({ error: "Could not process that image. Try a different file." });
  } finally {
    if (worker) {
      try { await worker.terminate(); } catch (e) { /* ignore */ }
    }
  }
};
