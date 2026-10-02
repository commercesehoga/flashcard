function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } }); }
function videoId(input) {
  if (!input || typeof input !== "string") return null; const value = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;
  try { const url = new URL(value), host = url.hostname.replace(/^www\./, ""); if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] || null; if (["youtube.com", "m.youtube.com"].includes(host)) { if (url.pathname === "/watch") return url.searchParams.get("v"); for (const part of ["shorts", "embed", "live"]) if (url.pathname.startsWith(`/${part}/`)) return url.pathname.split("/")[2]; } } catch (e) {}
  return null;
}
async function getText(url, options = {}) { const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error(`Transcript source returned ${response.status}`); return response.text(); }
export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return json({}, 200); if (context.request.method !== "POST") return json({ error: "Method not allowed. Use POST." }, 405);
  let body; try { body = await context.request.json(); } catch (e) { return json({ error: "Invalid JSON request." }, 400); }
  const id = videoId(body?.url); if (!id) return json({ error: "Could not find a valid YouTube video ID in that link." }, 400);
  const failures = [];
  const sources = [
    async () => { let text = await getText(`https://youtube-transcript.ai/transcript/${encodeURIComponent(id)}.txt`, { headers: { Accept: "text/plain" } }); return text.replace(/^\s*---\s*\n[\s\S]*?\n---\s*/, "").replace(/\[(?:\d+:)?\d+:\d+\]/g, "").replace(/\n{3,}/g, "\n\n").trim(); },
    async () => { const data = JSON.parse(await getText(`https://youtube-transcriber-api.vercel.app/v1/transcripts?id=${encodeURIComponent(id)}&type=text&lang=en`)); return String(data.transcripts?.[0]?.text || "").trim(); },
    async () => { const response = await fetch("https://youtube-transcript-api-tau-one.vercel.app/transcript", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ video_url: `https://www.youtube.com/watch?v=${id}` }), signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error("Transcript fallback failed"); return String((await response.json()).transcript || "").trim(); }
  ];
  for (const source of sources) { try { const transcript = await source(); if (transcript.length >= 50) return json({ videoId: id, transcript: transcript.slice(0, 20000), source: "cloudflare-transcript-source" }); } catch (error) { failures.push(error); } }
  return json({ error: "Could not fetch a transcript. The video may not have captions, or may be private, age-restricted, or region-locked — paste the transcript into the box instead." }, 502);
}
