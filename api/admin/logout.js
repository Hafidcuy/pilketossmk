import { method, send, errorResponse } from '../../lib/http.js';
import { clearSession } from '../../lib/auth.js';

export default async function handler(req, res) {
  try {
    method(req, ['POST']);
    clearSession(req, res);
    send(res, 200, { ok: true });
  } catch (err) { errorResponse(res, err); }
}
