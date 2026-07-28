/**
 * ProBoy-MD :: Automation Engine
 * ============================================================================
 * A tiny, generic IF/THEN rule engine. Not tied to any one feature — it's
 * the shared foundation future commands (`.channelwatch`, `.targetpost`,
 * `.statuswatch`, etc.) can register rules against instead of each
 * reinventing their own event/condition/action plumbing.
 *
 * CONCEPTS
 *   event      - a string name something in the bot emits, e.g. 'message',
 *                'channelPost', 'reactionCountReached', 'userActivity'.
 *   condition  - (payload) => boolean. Decide if this rule should fire.
 *   action     - async (payload, ctx) => void. What happens when it fires.
 *
 * USAGE
 *   const automationEngine = require('../../utils/automationEngine');
 *
 *   automationEngine.registerRule({
 *     name: 'welcome-vip-caller',
 *     event: 'channelPost',
 *     condition: (payload) => payload.channelId === '123@newsletter',
 *     action: async (payload, ctx) => {
 *       await ctx.sock.sendMessage(ctx.ownerJid, { text: `New post in VIP channel: ${payload.text}` });
 *     }
 *   });
 *
 *   // elsewhere, whenever that kind of thing happens:
 *   await automationEngine.triggerEvent('channelPost', { channelId, text }, { sock, ownerJid });
 *
 * This engine intentionally does NOT ship pre-built rules for
 * channelwatch/targetpost/statuswatch/etc — those are still open, documented
 * feature slots (see PROMPT.MD §18) to be built as focused commands on top
 * of this engine, rather than guessed at and shipped half-working.
 * ============================================================================
 */

const logger = require('./logger');

const rules = []; // { name, event, condition, action }

function registerRule({ name, event, condition, action }) {
  if (!event || typeof action !== 'function') {
    throw new Error('registerRule requires at least { event, action }');
  }
  rules.push({
    name: name || `rule_${rules.length + 1}`,
    event,
    condition: typeof condition === 'function' ? condition : () => true,
    action
  });
  logger.log('AUTOMATION', `Registered rule "${name || event}" for event "${event}"`);
}

function unregisterRule(name) {
  const idx = rules.findIndex(r => r.name === name);
  if (idx === -1) return false;
  rules.splice(idx, 1);
  return true;
}

function listRules() {
  return rules.map(r => ({ name: r.name, event: r.event }));
}

/**
 * Fire an event. Every matching rule's condition is checked; matching
 * rules run their action. Each rule is isolated — one throwing never
 * blocks the others.
 */
async function triggerEvent(eventName, payload = {}, ctx = {}) {
  const matches = rules.filter(r => r.event === eventName);
  if (!matches.length) return;

  for (const rule of matches) {
    try {
      if (!rule.condition(payload)) continue;
      await rule.action(payload, ctx);
      logger.log('AUTOMATION', `Rule "${rule.name}" fired for event "${eventName}"`);
    } catch (error) {
      logger.error('AUTOMATION', `Rule "${rule.name}" failed:`, error);
    }
  }
}

module.exports = { registerRule, unregisterRule, listRules, triggerEvent };
