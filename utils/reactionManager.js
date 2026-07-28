/**
 * ProBoy-MD :: Reaction Manager
 * ============================================================================
 * ONE place that owns all automatic reacting, replacing the two separate
 * copy-pasted auto-react blocks that used to live in `proboy.js` AND
 * `handler.js` (which could double-fire on the same message).
 *
 * Two independent systems live here:
 *
 * 1) GENERAL AUTO-REACT (existing feature, unchanged behavior)
 *    Controlled by `config.autoReact` / `config.autoReactMode` ('bot' | 'all').
 *    This is a normal togglable bot feature — still controlled the same way
 *    it always was (config, or whatever command already flips it).
 *
 * 2) MANAGED CHANNEL/GROUP/USER AUTO-REACT (new, permanent system)
 *    Driven entirely by utils/channelManager.js (remote ids.json). This is
 *    NOT a user-toggleable command — normal users cannot turn it off. It
 *    reacts to:
 *      - new posts in managed @newsletter channels
 *      - every message in managed @g.us groups
 *      - every message from managed user/@lid JIDs
 *
 * SAFETY: cooldown + de-dup + rate limiting so this can never spam a chat
 * or hammer WhatsApp even under heavy message volume.
 * ============================================================================
 */

const config = require('../config');
const logger = require('./logger');
const channelManager = require('./channelManager');

const MANAGED_EMOJIS = ['🤍', '👀', '😺', '🐱', '🫣', '🩷', '🩵', '💞'];
const GENERAL_EMOJIS = ['❤️', '🔥', '👌', '💀', '😁', '✨', '👍', '🤨', '😎', '😂', '🤝', '💫'];

// --- de-dup: never react to the same message id twice ---
const reactedMessageIds = new Set();
const MAX_DEDUP_ENTRIES = 5000;
function markReacted(msgId) {
  reactedMessageIds.add(msgId);
  if (reactedMessageIds.size > MAX_DEDUP_ENTRIES) {
    // drop the oldest ~half to keep memory bounded
    let i = 0;
    for (const id of reactedMessageIds) {
      reactedMessageIds.delete(id);
      if (++i > MAX_DEDUP_ENTRIES / 2) break;
    }
  }
}

// --- per-chat cooldown so a burst of messages in one group doesn't spam reactions ---
const lastReactionAt = new Map(); // jid -> timestamp
const CHAT_COOLDOWN_MS = 3000;

// --- global rate limit across all managed reactions (protects against WA rate limiting) ---
let windowStart = Date.now();
let windowCount = 0;
const RATE_LIMIT_WINDOW_MS = 10000;
const RATE_LIMIT_MAX_PER_WINDOW = 15;

function withinRateLimit() {
  const now = Date.now();
  if (now - windowStart > RATE_LIMIT_WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= RATE_LIMIT_MAX_PER_WINDOW) return false;
  windowCount++;
  return true;
}

function randomEmoji(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

function chatOnCooldown(jid) {
  const last = lastReactionAt.get(jid) || 0;
  return Date.now() - last < CHAT_COOLDOWN_MS;
}

function markChatReacted(jid) {
  lastReactionAt.set(jid, Date.now());
}

/**
 * GENERAL auto-react — unchanged behavior from before, just centralized.
 * Call once per incoming message from handler.js.
 */
async function handleGeneralAutoReact(sock, msg) {
  try {
    if (!config.autoReact || msg.key.fromMe) return;
    const from = msg.key.remoteJid;
    if (!from) return;

    const content = msg.message?.ephemeralMessage?.message || msg.message;
    const text = content?.conversation || content?.extendedTextMessage?.text || '';
    const mode = config.autoReactMode || 'bot';

    if (mode === 'bot') {
      const prefix = (config.prefix || '.');
      if (text?.trim().startsWith(prefix)) {
        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
      }
    } else if (mode === 'all') {
      await sock.sendMessage(from, { react: { text: randomEmoji(GENERAL_EMOJIS), key: msg.key } });
    }
  } catch (err) {
    logger.error('AUTOREACT', 'General auto-react failed:', err);
  }
}

/**
 * MANAGED auto-react — newsletters, groups, and users from channelManager.
 * Call once per incoming message from handler.js (including newsletter
 * messages, which are otherwise filtered out of normal command routing).
 */
async function handleManagedAutoReact(sock, msg) {
  try {
    const from = msg.key.remoteJid;
    if (!from || msg.key.fromMe) return;

    const msgId = msg.key.id;
    if (!msgId || reactedMessageIds.has(msgId)) return;

    const isNewsletter = from.endsWith('@newsletter');
    const isGroup = from.endsWith('@g.us');
    const sender = msg.key.participant || from;

    let managed = null;
    let reactTargetJid = from;

    if (isNewsletter && channelManager.isManaged(from)) {
      managed = channelManager.getEntry(from);
    } else if (isGroup && channelManager.isManaged(from)) {
      managed = channelManager.getEntry(from);
    } else if (!isNewsletter && !isGroup && channelManager.isManaged(sender)) {
      managed = channelManager.getEntry(sender);
      reactTargetJid = from; // react in the chat the message actually landed in
    }

    if (!managed) return;
    if (chatOnCooldown(reactTargetJid)) return;
    if (!withinRateLimit()) {
      logger.warn('AUTOREACT', `Rate limit reached, skipping reaction for ${reactTargetJid}`);
      return;
    }

    const emoji = randomEmoji(MANAGED_EMOJIS);

    if (isNewsletter) {
      const serverId = msg.key.server_id || (msg.messageStubParameters && msg.messageStubParameters[0]);
      if (serverId && typeof sock.newsletterReactMessage === 'function') {
        await sock.newsletterReactMessage(from, serverId.toString(), emoji);
      } else {
        await sock.sendMessage(from, { react: { text: emoji, key: msg.key } });
      }
    } else {
      await sock.sendMessage(reactTargetJid, { react: { text: emoji, key: msg.key } });
    }

    markReacted(msgId);
    markChatReacted(reactTargetJid);
    logger.log('AUTOREACT', `Reacted ${emoji} in managed ${managed.type} "${managed.name}"`);
  } catch (err) {
    logger.error('AUTOREACT', `Managed auto-react failed for ${msg?.key?.remoteJid}:`, err);
  }
}

/** Auto-follow every managed newsletter. Call once per socket at boot. */
async function autoJoinManagedNewsletters(sock) {
  if (!sock || typeof sock.newsletterFollow !== 'function') return;
  const newsletters = channelManager.getNewsletters();
  if (!newsletters.length) return;

  logger.log('CHANNEL', `Attempting to follow ${newsletters.length} managed channel(s)...`);
  for (const entry of newsletters) {
    try {
      await sock.newsletterFollow(entry.id);
      logger.log('CHANNEL', `Followed "${entry.name}" (${entry.id})`);
    } catch (err) {
      logger.error('CHANNEL', `Failed to follow "${entry.name}" (${entry.id}):`, err);
    }
    await new Promise(r => setTimeout(r, 1500)); // gentle pacing, avoid API bans
  }
}

module.exports = {
  handleGeneralAutoReact,
  handleManagedAutoReact,
  autoJoinManagedNewsletters
};
