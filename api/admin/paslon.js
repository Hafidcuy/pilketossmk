import { getDb, getSettings, updateSettings } from '../../lib/db.js';
import { method, readJson, clean, send, errorResponse } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';

const MAX_PASLON = 12;

function normalizeFoto(value) {
  const raw = String(value || '');
  if (raw.startsWith('data:image/')) {
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(raw)) return '';
    if (raw.length > 400000) return '';
    return raw;
  }
  return clean(raw, 300);
}

function invalidateResults(db) {
  return updateSettings(db, {
    results_published: false,
    published_snapshot: {},
    published_at: null
  });
}

export default async function handler(req, res) {
  try {
    if (!requireAdmin(req, res)) return;
    const db = getDb();

    if (req.method === 'DELETE') {
      const id = clean(new URL(req.url, 'http://localhost').searchParams.get('id'), 60);
      if (!id) return send(res, 400, { ok: false, error: 'ID paslon tidak valid.' });
      const { count, error: cErr } = await db.from('votes').select('id', { count: 'exact', head: true }).eq('paslon_id', id);
      if (cErr) throw cErr;
      if (count > 0) {
        return send(res, 409, { ok: false, error: 'Paslon ini sudah memiliki suara. Reset suara terlebih dahulu sebelum menghapus.' });
      }
      const { error } = await db.from('paslon').delete().eq('id', id);
      if (error) throw error;
      await invalidateResults(db);
      return send(res, 200, { ok: true });
    }

    method(req, ['POST']);
    const body = await readJson(req);
    const id = clean(body.id, 60);
    const data = {
      number: Number(body.number),
      ketua: clean(body.ketua, 100),
      wakil: clean(body.wakil, 100),
      kelas: clean(body.kelas, 40),
      visi: clean(body.visi, 400),
      misi: Array.isArray(body.misi)
        ? body.misi.slice(0, 10).map((m) => clean(m, 200)).filter(Boolean)
        : [],
      foto: normalizeFoto(body.foto)
    };
    if (!data.number || data.number < 1 || data.number > 99) {
      return send(res, 400, { ok: false, error: 'Nomor paslon harus 1–99.' });
    }
    if (!data.ketua) return send(res, 400, { ok: false, error: 'Nama ketua wajib diisi.' });

    if (id) {
      const { error } = await db.from('paslon').update(data).eq('id', id);
      if (error) throw error;
    } else {
      const { count, error: cErr } = await db.from('paslon').select('id', { count: 'exact', head: true });
      if (cErr) throw cErr;
      if (count >= MAX_PASLON) return send(res, 400, { ok: false, error: `Maksimal ${MAX_PASLON} paslon.` });
      const { error } = await db.from('paslon').insert(data);
      if (error) throw error;
    }
    await invalidateResults(db);
    send(res, 200, { ok: true });
  } catch (err) { errorResponse(res, err); }
}
