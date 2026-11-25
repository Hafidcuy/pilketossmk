import { getDb, updateSettings } from '../../lib/db.js';
import { method, send, errorResponse } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  try {
    method(req, ['POST']);
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    await db.from('votes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await db.from('captcha_used').delete().neq('token_hash', '');
    await updateSettings(db, {
      voting_open: true,
      results_published: false,
      published_snapshot: {},
      published_at: null
    });
    send(res, 200, { ok: true });
  } catch (err) { errorResponse(res, err); }
}
