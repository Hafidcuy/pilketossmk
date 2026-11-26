import fs from 'node:fs';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { CAPTCHA_FONT_BASE64 } from './captcha-font.js';
import { getDb } from './db.js';
import { hmac, safeEqual, b64urlJson, parseB64url, randomToken, sha256 } from './crypto.js';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const COLORS = ['#192335', '#2f57ef', '#2142c4'];
const FONT_PATH = '/tmp/pilketos-captcha-font.ttf';
let fontReady = false;

function randomChar() { return CHARS[Math.floor(Math.random() * CHARS.length)]; }
function random(min, max) { return Math.random() * (max - min) + min; }

function ensureFont() {
  if (fontReady) return;
  if (!fs.existsSync(FONT_PATH)) {
    fs.writeFileSync(FONT_PATH, Buffer.from(CAPTCHA_FONT_BASE64, 'base64'));
  }
  GlobalFonts.registerFromPath(FONT_PATH, 'CaptchaFont');
  fontReady = true;
}

function renderPng(answer) {
  ensureFont();
  const canvas = createCanvas(160, 48);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f7f9fc';
  ctx.fillRect(0, 0, 160, 48);

  ctx.strokeStyle = 'rgba(169,182,216,.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.moveTo(random(0, 160), random(0, 48));
    ctx.lineTo(random(0, 160), random(0, 48));
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(47,87,239,.35)';
  for (let i = 0; i < 8; i++) ctx.fillRect(random(0, 160), random(0, 48), 1.5, 1.5);

  ctx.font = 'bold 27px CaptchaFont';
  ctx.textBaseline = 'alphabetic';
  Array.from(answer).forEach((ch, i) => {
    const x = 17 + i * 28;
    ctx.save();
    ctx.translate(x, 33);
    ctx.rotate(random(-6, 6) * Math.PI / 180);
    ctx.fillStyle = COLORS[Math.floor(Math.random() * COLORS.length)];
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  return canvas.toBuffer('image/png');
}

export async function createCaptcha() {
  const answer = Array.from({ length: 5 }, randomChar).join('');
  const payload = b64urlJson({ a: answer, e: Date.now() + 5 * 60 * 1000, n: randomToken(8) });
  const token = payload + '.' + hmac(payload);
  return { token, image: 'data:image/png;base64,' + renderPng(answer).toString('base64') };
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
