import { hmac, safeEqual, b64urlJson, parseB64url, sha256, secret } from './crypto.js';
import { send } from './http.js';

const COOKIE = 'pilketos_admin';
const MAX_AGE = 15 * 60; // 15 menit

export function ipHash(req) {
  // Platform (Vercel) menambahkan IP asli di akhir daftar X-Forwarded-For.
  // Pakai nilai terakhir agar tidak bisa di-spoof lewat header buatan.
  const chain = String(req.headers['x-forwarded-for'] || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const ip = req.headers['x-real-ip'] || chain[chain.length - 1] || 'unknown';
  return sha256(secret() + ':' + ip);
}

function secureFlag(req) {
  return String(req.headers['x-forwarded-proto'] || '').includes('https') || process.env.VERCEL === '1';
}

export function createSession(req, res) {
  const payload = b64urlJson({ admin: true, iat: Date.now(), exp: Date.now() + MAX_AGE * 1000 });
  const token = payload + '.' + hmac(payload);
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; ${secureFlag(req) ? 'Secure; ' : ''}Max-Age=${MAX_AGE}`);
}

export function clearSession(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; ${secureFlag(req) ? 'Secure; ' : ''}Max-Age=0`);
}

export function verifySession(req) {
  const raw = String(req.headers.cookie || '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(COOKIE + '='));
  if (!raw) return false;
  const token = raw.slice(COOKIE.length + 1);
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra) return false;
  if (!safeEqual(sig, hmac(payload))) return false;
  try {
    const data = parseB64url(payload);
    return data.admin === true && Number(data.exp) > Date.now();
  } catch { return false; }
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // request dari server/too
  try {
    const host = String(req.headers.host || '').split(':')[0];
    return new URL(origin).hostname === host || new URL(origin).host === req.headers.host;
  } catch { return false; }
}

export function requireAdmin(req, res) {
  if (!sameOrigin(req)) {
    send(res, 403, { ok: false, error: 'Origin tidak diizinkan.' });
    return false;
  }
  if (String(req.headers['x-requested-with'] || '') !== 'XMLHttpRequest') {
    send(res, 403, { ok: false, error: 'Permintaan tidak diizinkan.' });
    return false;
  }
  if (!verifySession(req)) {
    send(res, 401, { ok: false, error: 'Sesi admin berakhir. Silakan login kembali.' });
    return false;
  }
  return true;
}
