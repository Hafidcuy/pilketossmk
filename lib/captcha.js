import sharp from 'sharp';
import { getDb } from './db.js';
import { hmac, safeEqual, b64urlJson, parseB64url, randomToken, sha256 } from './crypto.js';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const COLORS = ['#192335', '#2f57ef', '#2142c4'];

function randomChar() { return CHARS[Math.floor(Math.random() * CHARS.length)]; }
function random(min, max) { return Math.random() * (max - min) + min; }

function renderSvg(answer) {
  let inner = '';
  for (let i = 0; i < 2; i++) {
    inner += `<line x1="${random(0,160).toFixed(1)}" y1="${random(0,48).toFixed(1)}" x2="${random(0,160).toFixed(1)}" y2="${random(0,48).toFixed(1)}" stroke="#a9b6d8" stroke-opacity=".25" stroke-width="1"/>`;
  }
  for (let i = 0; i < 8; i++) {
    inner += `<circle cx="${random(0,160).toFixed(1)}" cy="${random(0,48).toFixed(1)}" r="${random(.6,1.6).toFixed(1)}" fill="#2f57ef" fill-opacity=".35"/>`;
  }
  Array.from(answer).forEach((ch, i) => {
    const angle = random(-6, 6).toFixed(1);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const y = 33;
    inner += `<text x="${17 + i * 28}" y="${y}" font-family="sans-serif" font-size="27" font-weight="bold" fill="${color}" transform="rotate(${angle} ${17 + i * 28} ${y})">${ch}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="48" viewBox="0 0 160 48"><rect width="160" height="48" rx="8" fill="#f7f9fc"/>${inner}</svg>`;
}

export async function createCaptcha() {
  const answer = Array.from({ length: 5 }, randomChar).join('');
  const payload = b64urlJson({ a: answer, e: Date.now() + 5 * 60 * 1000, n: randomToken(8) });
  const token = payload + '.' + hmac(payload);
  // Rasterisasi ke PNG agar jawaban tidak bisa dibaca dari markup SVG.
  const png = await sharp(Buffer.from(renderSvg(answer))).png().toBuffer();
  return { token, image: 'data:image/png;base64,' + png.toString('base64') };
}

export async function verifyCaptcha(token, answer) {
  if (!token || !answer) return false;
  const [payload, sig, extra] = String(token).split('.');
  if (!payload || !sig || extra) return false;
  if (!safeEqual(sig, hmac(payload))) return false;

  let data;
  try { data = parseB64url(payload); } catch { return false; }
  if (Number(data.e) < Date.now()) return false;
  if (String(answer).trim().toUpperCase() !== String(data.a).toUpperCase()) return false;

  // Token hanya boleh dipakai sekali (anti replay).
  const db = getDb();
  const { error } = await db.from('captcha_used').insert({ token_hash: sha256(String(token)) });
  return !error;
}
