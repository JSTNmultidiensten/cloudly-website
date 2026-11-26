// POST /api/submit  (multipart form)  photo, name, email?, message?, consent, age, lang, bot-field
// Saves a community photo submission in the D1 database bound as DB.
// The page resizes photos to max 1600 px JPEG before upload, so they stay well under D1's 2 MB value limit.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX = 1800000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export async function ensureTable(DB) {
  await DB.prepare(
    'CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, name TEXT NOT NULL, email TEXT, lang TEXT, country TEXT, consent TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, photo BLOB NOT NULL, message TEXT)'
  ).run();
  try { await DB.prepare('ALTER TABLE submissions ADD COLUMN message TEXT').run(); } catch (e) { /* column already there */ }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: 'not_configured' }, 503);
  let form;
  try { form = await request.formData(); } catch (e) { return json({ ok: false, error: 'bad_request' }, 400); }
  if (form.get('bot-field')) return json({ ok: true }); // honeypot: pretend it worked

  const name = String(form.get('name') || '').trim().slice(0, 80);
  const email = String(form.get('email') || '').trim().toLowerCase();
  const lang = String(form.get('lang') || 'nl').slice(0, 5);
  const message = String(form.get('message') || '').trim().replace(/\s+/g, ' ').slice(0, 280);
  if (!name) return json({ ok: false, error: 'name' }, 400);
  if (email && (email.length > 254 || !EMAIL_RE.test(email))) return json({ ok: false, error: 'email' }, 400);
  if (form.get('consent') !== 'on' || form.get('age') !== 'on') return json({ ok: false, error: 'consent' }, 400);

  const photo = form.get('photo');
  if (!photo || typeof photo === 'string') return json({ ok: false, error: 'photo' }, 400);
  if (!TYPES.includes(photo.type)) return json({ ok: false, error: 'type' }, 400);
  if (photo.size > MAX) return json({ ok: false, error: 'size' }, 413);
  const bytes = await photo.arrayBuffer();

  const consent = lang === 'en'
    ? 'Permission to show this photo, my name and my message on the Cloudly website and socials; 16 or older; everyone in the photo agrees.'
    : 'Toestemming om deze foto, mijn naam en mijn reactie op de website en socials van Cloudly te tonen; 16 jaar of ouder; iedereen op de foto vindt het goed.';

  await ensureTable(env.DB);
  await env.DB.prepare(
    'INSERT INTO submissions (created_at, name, email, lang, country, consent, mime, size, photo, message) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)'
  ).bind(new Date().toISOString(), name, email || null, lang, (request.cf && request.cf.country) || '', consent, photo.type, bytes.byteLength, bytes, message || null).run();

  return json({ ok: true });
}

export const onRequest = () => json({ ok: false, error: 'method_not_allowed' }, 405);
