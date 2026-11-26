import { getDb, getSettings, updateSettings } from '../../lib/db.js';
import { method, readJson, send, errorResponse } from '../../lib/http.js';
import { verifyCaptcha } from '../../lib/captcha.js';
import { verifyPinHash, newSalt, hashPin } from '../../lib/crypto.js';
import { createSession, ipHash } from '../../lib/auth.js';

const MAX_FAILS = 5;
const WINDOW_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  try {
    method(req, ['POST']);
    const body = await readJson(req);
    const db = getDb();
    const ip = ipHash(req);
    const since = new Date(Date.now() - WINDOW_MS).toISOString();

    const { count, error: countErr } = await db.from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ip).eq('success', false).gte('created_at', since);
    if (countErr) throw countErr;
    if (count >= MAX_FAILS) {
      return send(res, 429, { ok: false, error: 'Terlalu banyak percobaan gagal. Coba lagi dalam beberapa menit.' });
    }

    if (!(await verifyCaptcha(body.captchaToken, body.captchaAnswer))) {
      return send(res, 400, { ok: false, error: 'Kode captcha salah atau sudah digunakan.' });
    }

    let settings = await getSettings(db);
    if (!settings.pin_hash) {
      const salt = newSalt();
      const pin = process.env.ADMIN_INITIAL_PIN;
      if (!pin) throw new Error('ADMIN_INITIAL_PIN belum diatur di Environment Variables Vercel.');
      settings = await updateSettings(db, { pin_salt: salt, pin_hash: hashPin(pin, salt) });
    }

    const ok = verifyPinHash(body.pin, settings.pin_salt, settings.pin_hash);
    await db.from('login_attempts').insert({ ip_hash: ip, success: ok });

    if (!ok) {
      return send(res, 401, {
        ok: false,
        error: `PIN salah. Sisa percobaan: ${Math.max(0, MAX_FAILS - (count + 1))}.`
      });
    }

    createSession(req, res);
    send(res, 200, { ok: true });
  } catch (err) { errorResponse(res, err); }
}
