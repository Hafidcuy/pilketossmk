import { getDb, getSettings, getCandidates } from '../lib/db.js';
import { method, send, errorResponse } from '../lib/http.js';

export default async function handler(req, res) {
  try {
    method(req, ['GET']);
    const db = getDb();
    const [settings, candidates] = await Promise.all([getSettings(db), getCandidates(db)]);

    const results = settings.leaderboard_public && settings.results_published
      ? { ...(settings.published_snapshot || {}), at: settings.published_at }
      : null;

    send(res, 200, {
      ok: true,
      config: {
        title: settings.title,
        period: settings.period,
        votingOpen: settings.voting_open,
        leaderboardPublic: settings.leaderboard_public,
        resultsPublished: settings.results_published
      },
      candidates: candidates.map((c) => ({
        id: c.id, number: c.number, ketua: c.ketua, wakil: c.wakil,
        kelas: c.kelas, visi: c.visi, misi: c.misi || [], foto: c.foto || ''
      })),
      results
    });
  } catch (err) { errorResponse(res, err); }
}
