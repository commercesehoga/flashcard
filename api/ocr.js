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
// Install before deploying:
//   npm install tesseract.js
//
// Note: plain Vercel serverless functions (this file's style) have a hard
// ~4.5MB request body limit, so very large/uncompressed images may be
// rejected before this code even runs. Compress images client-side if you
// hit that limit.
//
// Request:  POST { image: "data:image/png;base64,...." , lang?: "eng" }
// Response: 200 { text, confidence }
//           4xx/5xx { error }

const Tesseract = require("tesseract.js");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

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

    const { data } = await Tesseract.recognize(imageData, lang || "eng", {
      logger: () => {} // silence per-tile progress logs in production
    });

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
  }
};
