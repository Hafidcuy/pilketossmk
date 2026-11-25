export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export async function readJson(req, maxBytes = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Permintaan terlalu besar.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Format JSON tidak valid.'), { status: 400 });
  }
}

export function clean(value, max = 300) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function method(req, allowed) {
  if (!allowed.includes(req.method)) {
    throw Object.assign(new Error('Metode tidak diizinkan.'), { status: 405 });
  }
}

export function errorResponse(res, err) {
  const status = err?.status || (err?.code === '23505' ? 409 : 500);
  const message = status === 500 && !err?.status
    ? 'Terjadi kesalahan pada server. Silakan coba lagi.'
    : (err?.message || 'Permintaan gagal.');
  if (status === 500) console.error(err);
  send(res, status, { ok: false, error: message });
}
