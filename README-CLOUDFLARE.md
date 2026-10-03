# Cloudflare Pages deployment

This project is now structured for Cloudflare Pages:

1. Create a Pages project and connect this repository/folder.
2. Use `.` as the build output directory. Leave the build command empty.
3. Add `GROQ_API_KEY` under Settings → Environment variables as an encrypted secret.
4. Deploy. The Pages Functions in `functions/api/` provide `/api/generate` and `/api/youtube-transcript`.

OCR runs in the browser with Tesseract WASM, so no server-side OCR function is needed.

For local development, install Wrangler and run `npx wrangler pages dev .`.
