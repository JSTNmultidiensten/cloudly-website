// POST /api/subscribe  {email, source}
// Saves a launch-list signup in the D1 database bound as DB (Pages > Settings > Bindings).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'not_configured' }, 503);
  let data = {};
  try {
    const type = request.headers.get('content-type') || '';
    data = type.includes('application/json') ? await request.json() : Object.fromEntries(await request.formData());
  } catch (e) {
    return json({ ok: false, error: 'bad_request' }, 400);
  }
  if (data['bot-field']) return json({ ok: true }); // honeypot: pretend it worked
  const email = String(data.email || '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return json({ ok: false, error: 'invalid_email' }, 400);
  const source = String(data.source || '').slice(0, 40);

  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS signups (email TEXT PRIMARY KEY, source TEXT, country TEXT, created_at TEXT NOT NULL)'
  ).run();
  const country = (request.cf && request.cf.country) || '';
  const res = await env.DB.prepare(
    'INSERT OR IGNORE INTO signups (email, source, country, created_at) VALUES (?1, ?2, ?3, ?4)'
  ).bind(email, source, country, new Date().toISOString()).run();

  return json({ ok: true, already: res.meta && res.meta.changes === 0 });
}

export const onRequest = () => json({ ok: false, error: 'method_not_allowed' }, 405);
