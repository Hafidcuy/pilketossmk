import { getDb, updateSettings, getTally } from '../../lib/db.js';
import { method, send, errorResponse } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  try {
    method(req, ['POST']);
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const { tally, total } = await getTally(db);
    const at = new Date().toISOString();
    await updateSettings(db, {
      results_published: true,
      published_snapshot: { total, counts: tally },
      published_at: at
    });
    send(res, 200, { ok: true, at, total });
  } catch (err) { errorResponse(res, err); }
}
