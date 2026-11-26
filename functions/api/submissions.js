// Private overview of community photo submissions, protected with the same EXPORT_KEY secret as the signup export.
// GET  /api/submissions?key=KEY            -> gallery page
// GET  /api/submissions?key=KEY&id=12      -> the photo itself (add &dl=1 to download)
// POST /api/submissions?key=KEY  id=12     -> delete that submission
import { ensureTable } from './submit.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = () => new Response('Not found', { status: 404 });

function allowed(request, env) {
  const key = new URL(request.url).searchParams.get('key') || '';
  return env.EXPORT_KEY && key === env.EXPORT_KEY;
}

export async function onRequestGet({ request, env }) {
  if (!allowed(request, env)) return nf();
  if (!env.DB) return new Response('Database not connected', { status: 503 });
  await ensureTable(env.DB);
  const u = new URL(request.url), key = u.searchParams.get('key'), id = u.searchParams.get('id');

  if (id) {
    const row = await env.DB.prepare('SELECT mime, photo FROM submissions WHERE id = ?1').bind(Number(id)).first();
    if (!row) return nf();
    const ext = row.mime === 'image/png' ? 'png' : row.mime === 'image/webp' ? 'webp' : 'jpg';
    const headers = { 'content-type': row.mime, 'cache-control': 'private, no-store' };
    if (u.searchParams.get('dl')) headers['content-disposition'] = `attachment; filename="cloudly-community-${Number(id)}.${ext}"`;
    return new Response(new Uint8Array(row.photo), { headers });
  }

  const { results } = await env.DB.prepare('SELECT id, created_at, name, email, lang, country, size FROM submissions ORDER BY id DESC').all();
  const k = encodeURIComponent(key);
  const cards = results.map(r => `
    <figure>
      <a href="?key=${k}&id=${r.id}" target="_blank"><img src="?key=${k}&id=${r.id}" loading="lazy" alt=""></a>
      <figcaption><b>${esc(r.name)}</b><span>${esc(r.email || 'geen e-mail')}</span><span>${esc(r.created_at.slice(0, 16).replace('T', ' '))} · ${esc(r.lang)} ${esc(r.country)} · ${Math.round(r.size / 1024)} kB</span>
        <span class="row"><a href="?key=${k}&id=${r.id}&dl=1">Download</a>
        <form method="post" action="?key=${k}" onsubmit="return confirm('Foto ${r.id} definitief verwijderen?')"><input type="hidden" name="id" value="${r.id}"><button>Verwijderen</button></form></span>
      </figcaption>
    </figure>`).join('');
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Community-inzendingen · Cloudly</title><style>
body{margin:0;font:15px/1.5 system-ui,sans-serif;background:#F4F9FD;color:#123D33;padding:24px}
h1{font-weight:500;margin:0 0 4px}p{margin:0 0 20px;color:#4F6F66}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
figure{margin:0;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px -20px rgba(18,61,51,.4)}
img{display:block;width:100%;aspect-ratio:1;object-fit:cover;background:#eee}
figcaption{padding:10px 12px;display:grid;gap:2px}figcaption span{color:#4F6F66;font-size:13px;word-break:break-all}
.row{display:flex;gap:12px;align-items:center;margin-top:6px}.row a{color:#E8437A;font-weight:600}
button{border:0;background:none;color:#4F6F66;text-decoration:underline;cursor:pointer;font:inherit;padding:0}
</style></head><body><h1>Community-inzendingen</h1><p>${results.length} foto's. Alleen zichtbaar met de geheime sleutel. Foto's die je niet gebruikt kun je hier verwijderen.</p><div class="grid">${cards || '<p>Nog geen inzendingen.</p>'}</div></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function onRequestPost({ request, env }) {
  if (!allowed(request, env)) return nf();
  if (!env.DB) return new Response('Database not connected', { status: 503 });
  const form = await request.formData();
  const id = Number(form.get('id'));
  if (id) await env.DB.prepare('DELETE FROM submissions WHERE id = ?1').bind(id).run();
  return Response.redirect(request.url, 303);
}
