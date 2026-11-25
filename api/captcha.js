import { method, send, errorResponse } from '../lib/http.js';
import { createCaptcha } from '../lib/captcha.js';

export default async function handler(req, res) {
  try {
    method(req, ['GET']);
    send(res, 200, { ok: true, ...createCaptcha() });
  } catch (err) { errorResponse(res, err); }
}
