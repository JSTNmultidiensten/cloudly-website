// Live sales for the private dashboard at /live (same EXPORT_KEY secret as the other private pages).
// GET  /api/sales?key=KEY[&since=ID]           -> { sales: [...] } (all sales, or only those with id > since)
// POST /api/sales?key=KEY  JSON { channel, city, cans, amount, shipping?, deposit?, note }  -> add a manual sale
//   amount = what the customer paid in total (incl. statiegeld and shipping); shipping/deposit = the part of it that was shipping / statiegeld
// POST /api/sales?key=KEY  JSON { action: 'delete', id }               -> remove a sale entered by mistake
// Shopify orders arrive through /api/shopify-webhook and land in the same table.

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export const CHANNELS = ['webshop', 'tiktok', 'winkel', 'horeca', 'proeverij', 'overig'];

export async function ensureSales(DB) {
  await DB.prepare(
    'CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, channel TEXT NOT NULL, ref TEXT UNIQUE, city TEXT, country TEXT, lat REAL, lon REAL, cans INTEGER NOT NULL DEFAULT 0, amount REAL NOT NULL DEFAULT 0, note TEXT)'
  ).run();
  for (const col of ['shipping REAL NOT NULL DEFAULT 0', 'deposit REAL NOT NULL DEFAULT 0']) {
    try { await DB.prepare('ALTER TABLE sales ADD COLUMN ' + col).run(); } catch (e) { /* column already there */ }
  }
}

function allowed(request, env) {
  const key = new URL(request.url).searchParams.get('key') || request.headers.get('x-key') || '';
  return env.EXPORT_KEY && key === env.EXPORT_KEY;
}

export async function onRequestGet({ request, env }) {
  if (!allowed(request, env)) return json({ ok: false, error: 'key' }, 401);
  if (!env.DB) return json({ ok: false, error: 'not_configured' }, 503);
  await ensureSales(env.DB);
  const since = Number(new URL(request.url).searchParams.get('since') || 0);
  const { results } = await env.DB.prepare(
    'SELECT id, created_at, channel, city, country, lat, lon, cans, amount, shipping, deposit, note FROM sales WHERE id > ?1 ORDER BY id ASC LIMIT 20000'
  ).bind(since).all();
  return json({ ok: true, sales: results });
}

export async function onRequestPost({ request, env }) {
  if (!allowed(request, env)) return json({ ok: false, error: 'key' }, 401);
  if (!env.DB) return json({ ok: false, error: 'not_configured' }, 503);
  await ensureSales(env.DB);
  let b;
  try { b = await request.json(); } catch (e) { return json({ ok: false, error: 'bad_request' }, 400); }

  if (b.action === 'delete') {
    const id = Number(b.id);
    if (!id) return json({ ok: false, error: 'id' }, 400);
    await env.DB.prepare('DELETE FROM sales WHERE id = ?1').bind(id).run();
    return json({ ok: true });
  }

  const channel = CHANNELS.includes(b.channel) ? b.channel : 'overig';
  const city = String(b.city || '').trim().slice(0, 60);
  const cans = Math.max(0, Math.min(100000, Math.round(Number(b.cans) || 0)));
  const amount = Math.max(0, Math.min(1000000, Math.round((Number(b.amount) || 0) * 100) / 100));
  const note = String(b.note || '').trim().slice(0, 140);
  const money = v => Math.max(0, Math.min(100000, Math.round((Number(v) || 0) * 100) / 100));
  const shipping = money(b.shipping), deposit = money(b.deposit);
  const lat = Number.isFinite(Number(b.lat)) && b.lat !== null && b.lat !== '' ? Number(b.lat) : null;
  const lon = Number.isFinite(Number(b.lon)) && b.lon !== null && b.lon !== '' ? Number(b.lon) : null;
  if (!cans && !amount) return json({ ok: false, error: 'empty' }, 400);

  const r = await env.DB.prepare(
    'INSERT INTO sales (created_at, channel, ref, city, country, lat, lon, cans, amount, note, shipping, deposit) VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)'
  ).bind(new Date().toISOString(), channel, city, 'NL', lat, lon, cans, amount, note, shipping, deposit).run();
  return json({ ok: true, id: r.meta && r.meta.last_row_id });
}
