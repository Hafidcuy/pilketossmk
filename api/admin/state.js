import { getDb, getSettings, getCandidates, getTally } from '../../lib/db.js';
import { method, send, errorResponse } from '../../lib/http.js';
import { requireAdmin, ipHash } from '../../lib/auth.js';

export default async function handler(req, res) {
  try {
    method(req, ['GET']);
    if (!requireAdmin(req, res)) return;
    const db = getDb();
    const [settings, candidates, { tally, total }] = await Promise.all([
      getSettings(db), getCandidates(db), getTally(db)
    ]);
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count: fails } = await db.from('login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash(req)).eq('success', false).gte('created_at', since);

    send(res, 200, {
      ok: true,
      config: {
        title: settings.title,
        period: settings.period,
        votingOpen: settings.voting_open,
        leaderboardPublic: settings.leaderboard_public,
        resultsPublished: settings.results_published,
        publishedAt: settings.published_at
      },
      candidates,
      tally,
      total,
      failedAttempts: fails || 0,
      sessionExpiresIn: 15 * 60
    });
  } catch (err) { errorResponse(res, err); }
}
