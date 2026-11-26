import { getDb, getSettings, getCandidates } from '../../lib/db.js';
import { method, send, errorResponse } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';

const PAGE = 1000;

export default async function handler(req, res) {
  try {
    method(req, ['GET']);
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const [settings, candidates] = await Promise.all([getSettings(db), getCandidates(db)]);

    const votes = [];
    let from = 0;
    while (true) {
      const { data, error } = await db.from('votes').select('*')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      votes.push(...(data || []));
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }

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
      votes,
      published: settings.published_snapshot
    }, null, 2));
  } catch (err) { errorResponse(res, err); }
}
