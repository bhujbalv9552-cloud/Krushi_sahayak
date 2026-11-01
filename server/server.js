// Krishi Sahayak secure Google Gemini API proxy. Requires Node.js 20+.
// GEMINI_API_KEY stays on the server and must never be bundled into the APK.
const http = require('node:http');

const PORT = Number(process.env.PORT || 8787);
const API_KEY = process.env.GEMINI_API_KEY;
const APP_KEY = process.env.APP_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const LIMIT = Math.max(1, Number(process.env.REQS_PER_HOUR || 60));
const MAX_BODY = 4 * 1024 * 1024;
const hits = new Map();

function send(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 3600000);
  if (recent.length >= LIMIT) { hits.set(ip, recent); return true; }
  recent.push(now); hits.set(ip, recent); return false;
}
function validImage(image) {
  return typeof image === 'string' && image.length <= 3_500_000 && /^[A-Za-z0-9+/]+={0,2}$/.test(image);
}
async function askGemini(input, chatMode) {
  const system = String(input.system || '').slice(0, 6000);
  let contents;
  if (chatMode) {
    if (!Array.isArray(input.contents) || input.contents.length < 1 || input.contents.length > 18)
      throw Object.assign(new Error('invalid_history'), { status: 400, code: 'invalid_history' });
    contents = input.contents.map((m) => {
      if (!m || !['user', 'model'].includes(m.role) || typeof m.text !== 'string' || !m.text.trim())
        throw Object.assign(new Error('invalid_message'), { status: 400, code: 'invalid_message' });
      return { role: m.role, parts: [{ text: m.text.slice(0, 6000) }] };
    });
  } else {
    if (typeof input.prompt !== 'string' || !input.prompt.trim())
      throw Object.assign(new Error('prompt_required'), { status: 400, code: 'prompt_required' });
    const parts = [];
    if (input.image) {
      if (!validImage(input.image)) throw Object.assign(new Error('invalid_image'), { status: 400, code: 'invalid_image' });
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: input.image } });
    }
    parts.push({ text: input.prompt.slice(0, 6000) });
    contents = [{ role: 'user', parts }];
  }

  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(55000),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': API_KEY },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents,
      generationConfig: { temperature: 0.35, maxOutputTokens: 1400 }
    })
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    console.error('Gemini API error:', upstream.status, data?.error?.status || data?.error?.message || 'unknown');
    throw Object.assign(new Error('upstream_unavailable'), { status: 502, code: 'upstream_unavailable' });
  }
  const answer = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n').trim();
  if (!answer) throw Object.assign(new Error('empty_response'), { status: 502, code: 'empty_response' });
  return answer;
}

const server = http.createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type,x-app-key');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  if (req.method === 'GET' && req.url === '/health')
    return send(res, 200, { ok: true, provider: 'google-gemini', model: MODEL, configured: Boolean(API_KEY && APP_KEY) });
  if (req.method !== 'POST' || !['/api/ask', '/api/chat'].includes(req.url))
    return send(res, 404, { error: 'not_found' });
  if (!API_KEY || !APP_KEY) return send(res, 503, { error: 'server_not_configured' });
  if (req.headers['x-app-key'] !== APP_KEY) return send(res, 401, { error: 'unauthorized' });
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  if (limited(ip)) return send(res, 429, { error: 'rate_limited' });

  let raw = '', tooLarge = false;
  req.on('data', chunk => {
    if (tooLarge) return;
    raw += chunk.toString('utf8');
    if (Buffer.byteLength(raw) > MAX_BODY) {
      tooLarge = true; send(res, 413, { error: 'payload_too_large' }); req.destroy();
    }
  });
  req.on('end', async () => {
    if (tooLarge) return;
    try {
      const input = JSON.parse(raw || '{}');
      const answer = await askGemini(input, req.url === '/api/chat');
      return send(res, 200, { text: answer, provider: 'google-gemini', model: MODEL });
    } catch (error) {
      if (error.status === 400) return send(res, 400, { error: error.code });
      console.error('Request failed:', error.code || error.name || 'Error');
      return send(res, error.status || 502, { error: error.code || 'request_failed' });
    }
  });
});
server.listen(PORT, '0.0.0.0', () => console.log(`Krishi Sahayak Gemini API listening on ${PORT} (${MODEL})`));
