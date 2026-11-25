import { getDb, getSettings } from '../lib/db.js';
import { method, readJson, clean, send, errorResponse } from '../lib/http.js';
import { verifyCaptcha } from '../lib/captcha.js';
import { voterKey, randomToken } from '../lib/crypto.js';
import { ipHash } from '../lib/auth.js';

export default async function handler(req, res) {
  try {
    method(req, ['POST']);
    const body = await readJson(req);

    const nama = clean(body.nama, 80);
    const kelas = clean(body.kelas, 30);
    const jurusan = clean(body.jurusan, 60);
    const paslonId = clean(body.paslonId, 60);

    if (!nama || !kelas || !jurusan) {
      return send(res, 400, { ok: false, error: 'Nama lengkap, kelas, dan jurusan wajib diisi.' });
    }
    if (!paslonId) return send(res, 400, { ok: false, error: 'Pilih salah satu paslon.' });
    if (!(await verifyCaptcha(body.captchaToken, body.captchaAnswer))) {
      return send(res, 400, { ok: false, error: 'Kode captcha salah atau sudah digunakan.' });
    }

    const db = getDb();
    const settings = await getSettings(db);
    if (!settings.voting_open) return send(res, 403, { ok: false, error: 'Voting sedang ditutup panitia.' });

    const { data: paslon, error: pErr } = await db.from('paslon').select('id,ketua,wakil,number')
      .eq('id', paslonId).maybeSingle();
    if (pErr) throw pErr;
    if (!paslon) return send(res, 400, { ok: false, error: 'Paslon tidak ditemukan.' });

    const key = voterKey(nama, kelas, jurusan);
    const { data: existing, error: eErr } = await db.from('votes').select('id').eq('voter_key', key).maybeSingle();
    if (eErr) throw eErr;
    if (existing) return send(res, 409, { ok: false, error: 'Identitas ini sudah terdaftar memberikan suara.' });

    const ip = ipHash(req);
    const since = new Date(Date.now() - 3000).toISOString();
    const { count, error: cErr } = await db.from('votes')
      .select('id', { count: 'exact', head: true }).eq('ip_hash', ip).gte('created_at', since);
    if (cErr) throw cErr;
    if (count > 0) return send(res, 429, { ok: false, error: 'Terlalu cepat. Tunggu beberapa detik.' });

    const suffix = (randomToken(4).replace(/[^A-Z0-9]/gi, '').toUpperCase() ||
      Math.random().toString(36).slice(2, 6).toUpperCase()).slice(0, 4);
    const receipt = 'PKT-' + Date.now().toString(36).toUpperCase() + '-' + suffix;
    const { error: insertErr } = await db.from('votes').insert({
      voter_key: key, nama, kelas, jurusan, paslon_id: paslon.id, receipt, ip_hash: ip
    });
    if (insertErr) {
      if (insertErr.code === '23505') {
        return send(res, 409, { ok: false, error: 'Identitas ini sudah terdaftar memberikan suara.' });
      }
      throw insertErr;
    }

    // Hitungan publik memakai snapshot yang diterbitkan admin; suara baru belum langsung tampil.
    send(res, 200, {
      ok: true,
      receipt,
      paslon: `Paslon ${paslon.number} — ${paslon.ketua}${paslon.wakil ? ' & ' + paslon.wakil : ''}`
    });
  } catch (err) { errorResponse(res, err); }
}
