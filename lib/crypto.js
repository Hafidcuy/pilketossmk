import crypto from 'node:crypto';

export function secret() {
  return process.env.SESSION_SECRET ||
    (process.env.SUPABASE_SERVICE_ROLE_KEY || 'pilketos-smkkrian1').slice(0, 64);
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

export function hmac(text) {
  return crypto.createHmac('sha256', secret()).update(String(text)).digest('base64url');
}

export function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export function b64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function parseB64url(value) {
  return JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
}

export function newSalt() { return randomToken(16); }

export function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), String(salt), 64).toString('hex');
}

export function verifyPinHash(pin, salt, expected) {
  if (!expected) return false;
  return safeEqual(hashPin(pin, salt), expected);
}

export function voterKey(nama, kelas, jurusan) {
  const normalized = [nama, kelas, jurusan]
    .map((s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim())
    .join('|');
  return sha256(secret() + ':' + normalized);
}
