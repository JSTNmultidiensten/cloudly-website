// POST /api/shopify-webhook  <- Shopify webhook "Order payment" (orders/paid), JSON format.
// Checks Shopify's signature with the secret SHOPIFY_WEBHOOK_SECRET, then stores the order in the sales table
// so it shows up on the live dashboard (/live). Duplicate deliveries are ignored (unique ref per order).
import { ensureSales } from './sales.js';

const ok = (s = 200) => new Response(s === 200 ? 'ok' : 'error', { status: s });

async function validSignature(secret, raw, header) {
  if (!secret || !header) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, raw));
  let bin = ''; for (const b of sig) bin += String.fromCharCode(b);
  const expected = btoa(bin);
  if (expected.length !== header.length) return false;
  let diff = 0; for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

// "Strawberry Cloud 12-pack", "Tray 12 x 250 ml", "24 blikjes" -> 12 / 12 / 24 cans per item
function cansPerItem(item) {
  const text = [item.title, item.variant_title, item.name, item.sku].filter(Boolean).join(' ');
  const m = text.match(/(\d{1,3})\s*(?:x\b|×|-?\s*pack|blikjes|blikken|blik|cans?\b|stuks)/i);
  const n = m ? Number(m[1]) : 1;
  return n > 1 && n <= 96 ? n : 1;
}

function channelOf(order) {
  const s = String(order.source_name || '').toLowerCase();
  if (s.includes('tiktok')) return 'tiktok';
  if (s === 'pos') return 'winkel';
  return 'webshop';
}

export async function onRequestPost({ request, env }) {
  const raw = await request.arrayBuffer();
  if (!(await validSignature(env.SHOPIFY_WEBHOOK_SECRET, raw, request.headers.get('x-shopify-hmac-sha256')))) return ok(401);
  if (!env.DB) return ok(503);
  let o;
  try { o = JSON.parse(new TextDecoder().decode(raw)); } catch (e) { return ok(400); }
  if (!o || !o.id) return ok(400);
  if (o.test) return ok(); // Shopify test notifications are not real sales

  await ensureSales(env.DB);
  const addr = o.shipping_address || o.billing_address || {};
  const cans = (o.line_items || []).reduce((n, it) => n + (Number(it.quantity) || 0) * cansPerItem(it), 0);
  const amount = Number(o.current_subtotal_price ?? o.subtotal_price ?? o.total_price ?? 0) || 0;
  const lat = Number.isFinite(Number(addr.latitude)) && addr.latitude !== null ? Number(addr.latitude) : null;
  const lon = Number.isFinite(Number(addr.longitude)) && addr.longitude !== null ? Number(addr.longitude) : null;

  await env.DB.prepare(
    'INSERT OR IGNORE INTO sales (created_at, channel, ref, city, country, lat, lon, cans, amount, note) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)'
  ).bind(
    o.processed_at || o.created_at || new Date().toISOString(),
    channelOf(o),
    'shopify:' + o.id,
    String(addr.city || '').slice(0, 60),
    String(addr.country_code || '').slice(0, 2),
    lat, lon, cans, Math.round(amount * 100) / 100,
    String(o.name || '').slice(0, 40)
  ).run();
  return ok();
}
