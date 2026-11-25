import { getDb, getSettings, updateSettings } from '../../lib/db.js';
import { method, readJson, clean, send, errorResponse } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';
import { newSalt, hashPin } from '../../lib/crypto.js';

export default async function handler(req, res) {
  try {
    method(req, ['POST']);
    if (!requireAdmin(req, res)) return;
    const body = await readJson(req);
    const db = getDb();

    const patch = {
      title: clean(body.title, 120) || 'Pemilihan Ketua OSIS',
      period: clean(body.period, 120),
      voting_open: !!body.votingOpen,
      leaderboard_public: !!body.leaderboardPublic
    };

    if (body.newPin !== undefined && String(body.newPin).length > 0) {
      const pin = clean(body.newPin, 64);
      if (pin.length < 4) return send(res, 400, { ok: false, error: 'PIN minimal 4 karakter.' });
      const salt = newSalt();
      patch.pin_salt = salt;
      patch.pin_hash = hashPin(pin, salt);
    }

    await updateSettings(db, patch);
    await getSettings(db);
    send(res, 200, { ok: true });
  } catch (err) { errorResponse(res, err); }
}
