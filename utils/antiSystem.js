/**
 * ProBoy-MD :: Anti-System (AntiLink + AntiCall)
 * ============================================================================
 * BUGS THIS FILE FIXES (found while auditing the old handler.js):
 *
 * 1) ANTILINK was defined but was being invoked from `proboy.js` via a
 *    fire-and-forget `.then()` AFTER `handleMessage` had already fully
 *    processed the message (command routing, everything). That race let
 *    a link sit in the group and be visible/processed before deletion,
 *    and any error was silently swallowed by `.catch(()=>{})`.
 *    FIX: antilink is now invoked synchronously, first, inside
 *    handleMessage — before command routing — exactly like every other
 *    anti-feature (antitag, antigroupmention, antiall).
 *
 * 2) ANTICALL read `config.anticall || config.defaultGroupSettings.anticall`
 *    — both are static values baked into config.js at deploy time. There
 *    was no command/toggle that could ever change this at runtime, so the
 *    feature was permanently whatever config.js said (effectively always
 *    off, since neither field defaults to true).
 *    FIX: anticall is now a DB-backed GLOBAL setting (calls aren't scoped
 *    to a single group — they ring the bot's own number — so a single
 *    global on/off makes more sense than a per-group setting). Falls back
 *    to `config.defaultGroupSettings.anticall` only if nothing has been
 *    set in the DB yet. Toggle it with `.anticall on` / `.anticall off`
 *    (commands/owner/anticall.js).
 * ============================================================================
 */

const config = require('../config');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// ANTILINK
// ---------------------------------------------------------------------------

const LINK_PATTERN = /(https?:\/\/)?([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.)+[a-zA-Z]{2,}(\/[^\s]*)?/i;

/**
 * @returns {boolean} true if the message was a link and was fully handled
 * (deleted/warned/kicked) — caller should stop further processing.
 */
async function handleAntilink(sock, msg, groupMetadata, deps) {
  const { getDb, isOwner, isAdmin, isBotAdmin } = deps;
  try {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    const groupSettings = getDb(sock).getGroupSettings(from);
    if (!groupSettings || !groupSettings.antilink) return false;

    const body = msg.message?.conversation ||
                 msg.message?.extendedTextMessage?.text ||
                 msg.message?.imageMessage?.caption ||
                 msg.message?.videoMessage?.caption || '';

    if (!LINK_PATTERN.test(body)) return false;

    try {
      const match = body.match(LINK_PATTERN);
      const urlLike = match ? match[0] : null;
      if (urlLike && Array.isArray(groupSettings.antilinkWhitelist) && groupSettings.antilinkWhitelist.length) {
        const normalized = urlLike.startsWith('http') ? urlLike : `https://${urlLike}`;
        const hostname = new URL(normalized).hostname.toLowerCase();
        const allow = groupSettings.antilinkWhitelist
          .map(d => String(d || '').trim().toLowerCase())
          .some(d => hostname === d || hostname.endsWith(`.${d}`));
        if (allow) return false;
      }
    } catch (err) {
      logger.warn('ANTILINK', 'Whitelist parsing failed, proceeding with block:', err?.message);
    }

    // Owner bypass + group admin bypass
    const senderIsAdmin = await isAdmin(sock, sender, from, groupMetadata);
    if (senderIsAdmin || isOwner(sender)) return false;

    const botIsAdmin = await isBotAdmin(sock, from, groupMetadata);
    if (!botIsAdmin) {
      logger.log('ANTILINK', `Bot is not admin in ${from}, cannot enforce.`);
      return false;
    }

    const action = (groupSettings.antilinkAction || 'delete').toLowerCase();

    try {
      await sock.sendMessage(from, { delete: msg.key });
    } catch (e) {
      logger.error('ANTILINK', 'Failed to delete offending message:', e);
    }

    if (action === 'warn') {
      const warnData = getDb(sock).addWarning(from, sender, 'Anti-link policy violation');
      const maxWarnings = config.maxWarnings || 3;
      if (warnData.count >= maxWarnings) {
        await sock.groupParticipantsUpdate(from, [sender], 'remove');
        await sock.sendMessage(from, { text: `🔗 *Anti-Link* triggered.\n@${sender.split('@')[0]} was kicked for reaching max warnings.`, mentions: [sender] });
      } else {
        await sock.sendMessage(from, { text: `🔗 *Anti-Link* triggered.\nWarning ${warnData.count}/${maxWarnings}. Link removed.`, mentions: [sender] });
      }
    } else if (action === 'kick') {
      await sock.groupParticipantsUpdate(from, [sender], 'remove');
      await sock.sendMessage(from, { text: `🔗 *Anti-Link* triggered.\nLink removed and @${sender.split('@')[0]} kicked.`, mentions: [sender] });
    } else {
      await sock.sendMessage(from, { text: `🔗 *Anti-Link* triggered.\nLink removed from @${sender.split('@')[0]}.`, mentions: [sender] });
    }

    return true;
  } catch (error) {
    logger.error('ANTILINK', 'Handler error:', error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// ANTICALL
// ---------------------------------------------------------------------------

/** Read the effective anticall state: DB global setting, falling back to config default. */
function isAntiCallEnabled(sock, deps) {
  const { getDb } = deps;
  const dbValue = getDb(sock).getGlobalSetting('anticall');
  if (typeof dbValue === 'boolean') return dbValue;
  return Boolean(config.defaultGroupSettings?.anticall);
}

/** Toggle anticall globally. Used by commands/owner/anticall.js */
function setAntiCallEnabled(sock, deps, enabled) {
  const { getDb } = deps;
  return getDb(sock).setGlobalSetting('anticall', Boolean(enabled));
}

/**
 * Wire up the incoming-call listener. Call once per socket, right after
 * the socket is created (same as before).
 */
function initializeAntiCall(sock, deps) {
  if (!sock?.ev) return;
  logger.log('ANTICALL', 'Module armed.');

  sock.ev.on('call', async (calls) => {
    try {
      if (!isAntiCallEnabled(sock, deps)) return;

      for (const call of calls) {
        if (call.status !== 'offer') continue;
        logger.log('ANTICALL', `Rejecting incoming call from ${call.from}`);
        try {
          await sock.rejectCall(call.id, call.from);
        } catch (e) {
          logger.error('ANTICALL', 'rejectCall failed:', e);
        }
        try {
          await sock.sendMessage(call.from, {
            text: '🚫 *Policy:* Voice and video calls are not permitted on this number. You have been blocked.'
          });
        } catch (e) { /* best effort */ }
        try {
          await sock.updateBlockStatus(call.from, 'block');
        } catch (e) {
          logger.error('ANTICALL', 'updateBlockStatus failed:', e);
        }
      }
    } catch (err) {
      logger.error('ANTICALL', 'Call handler crashed:', err);
    }
  });
}

module.exports = {
  handleAntilink,
  initializeAntiCall,
  isAntiCallEnabled,
  setAntiCallEnabled
};
