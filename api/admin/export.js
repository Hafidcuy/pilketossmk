import { getDb, getSettings, getCandidates } from '../../lib/db.js';
import { method, send, errorResponse } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  try {
    method(req, ['GET']);
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const [settings, candidates, votes] = await Promise.all([
      getSettings(db), getCandidates(db), db.from('votes').select('*').order('created_at', { ascending: false })
    ]);
    if (votes.error) throw votes.error;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pilketos-data.json"');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({
      exportedAt: new Date().toISOString(),
      config: {
        title: settings.title, period: settings.period,
        votingOpen: settings.voting_open, leaderboardPublic: settings.leaderboard_public
      },
      candidates,
      votes: votes.data || [],
      published: settings.published_snapshot
    }, null, 2));
  } catch (err) { errorResponse(res, err); }
}
