/**
 * ProBoy-MD :: Channel Manager
 * ============================================================================
 * Loads the managed auto-reaction targets from a REMOTE JSON file — never
 * hardcoded in code. Source of truth:
 *
 *   https://proboy.vercel.app/bot/ids.json
 *
 * Shape:
 *   [ { "id": "<jid>", "name": "<label>", "number": "<owner number>" } ]
 *
 * `id` is the only field that matters functionally — `name`/`number` are
 * just for humans reading `.channelinfo` output. Add/remove entries any
 * time in that JSON file; the bot picks up changes automatically on the
 * next refresh cycle (default: every 5 minutes), no redeploy needed.
 *
 * `id` can be:
 *   - a newsletter JID  (ends with @newsletter)      -> channel automation
 *   - a group JID       (ends with @g.us)             -> group auto-react
 *   - a user JID/LID     (ends with @s.whatsapp.net /
 *                          @lid)                       -> user auto-react
 *
 * SAFE BY DESIGN:
 *   - Fetch failures never throw — last known good list is kept, or an
 *     empty list if nothing has ever loaded successfully.
 *   - A short in-memory cache avoids hammering the endpoint.
 * ============================================================================
 */

const logger = require('./logger');
const scheduler = require('./scheduler');

const REMOTE_URL = 'https://proboy.vercel.app/bot/ids.json';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let state = {
  raw: [],           // exact entries as fetched
  byId: new Map(),    // id -> entry
  newsletters: [],    // entries whose id ends with @newsletter
  groups: [],         // entries whose id ends with @g.us
  users: [],          // entries whose id ends with @s.whatsapp.net or @lid
  lastFetchedAt: 0,
  lastError: null
};

function classify(id) {
  if (typeof id !== 'string') return null;
  if (id.endsWith('@newsletter')) return 'newsletter';
  if (id.endsWith('@g.us')) return 'group';
  if (id.endsWith('@s.whatsapp.net') || id.endsWith('@lid')) return 'user';
  return null;
}

function rebuildIndexes(entries) {
  const byId = new Map();
  const newsletters = [];
  const groups = [];
  const users = [];

  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string') continue;
    const id = entry.id.trim();
    if (!id) continue;
    const type = classify(id);
    if (!type) continue;

    const normalized = { id, name: entry.name || id, number: entry.number || null, type };
    byId.set(id, normalized);
    if (type === 'newsletter') newsletters.push(normalized);
    else if (type === 'group') groups.push(normalized);
    else if (type === 'user') users.push(normalized);
  }

  return { byId, newsletters, groups, users };
}

/**
 * Fetch the remote ids.json and refresh in-memory state.
 * Never throws — logs and keeps the previous good state on failure.
 */
async function refresh() {
  try {
    const res = await fetch(REMOTE_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Remote config is not an array');

    const { byId, newsletters, groups, users } = rebuildIndexes(data);
    state = {
      raw: data,
      byId,
      newsletters,
      groups,
      users,
      lastFetchedAt: Date.now(),
      lastError: null
    };
    logger.log('CHANNEL', `Loaded ${data.length} managed entries (${newsletters.length} channels, ${groups.length} groups, ${users.length} users)`);
  } catch (err) {
    state.lastError = err?.message || String(err);
    logger.error('CHANNEL', `Failed to refresh remote config, keeping last known list (${state.raw.length} entries):`, err);
  }
}

/** Start the periodic refresh cycle. Call once at boot. */
function start() {
  scheduler.schedule('channelManager:refresh', REFRESH_INTERVAL_MS, refresh, { runImmediately: true });
}

function isManaged(jid) {
  return state.byId.has(jid);
}

function getEntry(jid) {
  return state.byId.get(jid) || null;
}

function getNewsletters() { return state.newsletters.slice(); }
function getGroups() { return state.groups.slice(); }
function getUsers() { return state.users.slice(); }
function getAll() { return state.raw.slice(); }

function getStatus() {
  return {
    total: state.raw.length,
    newsletters: state.newsletters.length,
    groups: state.groups.length,
    users: state.users.length,
    lastFetchedAt: state.lastFetchedAt,
    lastError: state.lastError
  };
}

module.exports = {
  start,
  refresh,
  isManaged,
  getEntry,
  getNewsletters,
  getGroups,
  getUsers,
  getAll,
  getStatus,
  REMOTE_URL
};
