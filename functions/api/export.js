// GET /api/export?key=YOUR_EXPORT_KEY  ->  signups.csv
// Set EXPORT_KEY as a secret in Pages > Settings > Variables and Secrets. Without it, export is off.
export async function onRequestGet({ request, env }) {
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!env.EXPORT_KEY || key !== env.EXPORT_KEY) return new Response('Not found', { status: 404 });
  if (!env.DB) return new Response('Database not connected', { status: 503 });
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS signups (email TEXT PRIMARY KEY, source TEXT, country TEXT, created_at TEXT NOT NULL)'
  ).run();
  const { results } = await env.DB.prepare('SELECT email, source, country, created_at FROM signups ORDER BY created_at').all();
  const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = ['email,source,country,signed_up_at', ...results.map(r => [r.email, r.source, r.country, r.created_at].map(esc).join(','))].join('\n');
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="cloudly-launch-list.csv"',
      'cache-control': 'no-store'
    }
  });
}
