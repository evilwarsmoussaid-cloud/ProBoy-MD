/**
 * ProBoy-MD :: Button Manager
 * ============================================================================
 * A universal framework so ANY command can define buttons whose clicks do
 * ANY of three things:
 *
 *   1. COMMAND button  — clicking it runs an existing bot command, exactly
 *      like `.commandname args` was typed. (id: `cmd_<command...>`)
 *
 *   2. CUSTOM SCRIPT button — clicking it runs an arbitrary function you
 *      register yourself: send whatever message, call whatever API, do
 *      whatever you want. This is the "buttons run custom script" feature.
 *      (id: `fn_<actionId>`)
 *
 *   3. REPLY button — a one-off shortcut for "just send this fixed text
 *      back" without writing a full handler. Sugar on top of #2.
 *
 * HOW TO USE THIS IN A COMMAND (see commands/utility/check.js for a full
 * working example, and PROMPT.MD §17 for the full write-up):
 *
 *   const buttonManager = require('../../utils/buttonManager');
 *   const { sendInteractiveMessage } = require('../../utils/gifted-btns');
 *
 *   // Register a custom action once (top of the file, runs at load time):
 *   buttonManager.registerAction('demo_hello', async (sock, msg, extra) => {
 *     await extra.reply('You pressed the custom button! I can do anything here.');
 *   });
 *
 *   // Then, inside execute():
 *   await sendInteractiveMessage(sock, from, {
 *     text: 'Pick one:',
 *     interactiveButtons: [
 *       buttonManager.commandButton('👑 Owner', '.owner'),
 *       buttonManager.customButton('✨ Custom', 'demo_hello'),
 *       buttonManager.replyButton('👋 Say Hi', 'Hello there!')
 *     ]
 *   }, { quoted: msg });
 *
 * `handler.js` calls `buttonManager.dispatch(sock, msg, extra)` once per
 * incoming button click, before falling back to any legacy button-handling
 * code already in the repo (so nothing that used to work stops working).
 * ============================================================================
 */

const logger = require('./logger');
const { extractButtonIdFromMessage } = require('./button');

// actionId -> async (sock, msg, extra, meta) => void
const registry = new Map();
let replyCounter = 0;

/**
 * Register a custom-script button action. Call this once, typically at
 * module load time in whichever command file defines the button.
 * @param {string} actionId - unique id, e.g. 'demo_hello'
 * @param {Function} handlerFn - async (sock, msg, extra, meta) => void
 */
function registerAction(actionId, handlerFn) {
  if (!actionId || typeof handlerFn !== 'function') {
    throw new Error('registerAction requires an actionId and a handler function');
  }
  registry.set(actionId, handlerFn);
}

function isRegistered(actionId) {
  return registry.has(actionId);
}

// ---------------------------------------------------------------------------
// Button builders — return { name, buttonParamsJson } ready for
// interactiveButtons, using the same native_flow shape as gifted-btns.js.
// ---------------------------------------------------------------------------

/** A button that executes an existing bot command when tapped. */
function commandButton(displayText, command) {
  const cmd = command.startsWith('.') || command.startsWith('/') || command.startsWith('#')
    ? command
    : `.${command}`;
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: displayText, id: `cmd_${cmd}` })
  };
}

/** A button that runs a custom-registered script when tapped. */
function customButton(displayText, actionId) {
  if (!isRegistered(actionId)) {
    logger.warn('BUTTON', `customButton() built for unregistered action "${actionId}" — register it with buttonManager.registerAction() before sending.`);
  }
  return {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({ display_text: displayText, id: `fn_${actionId}` })
  };
}

/** A button that just sends a fixed reply — sugar over customButton(). */
function replyButton(displayText, replyText) {
  const actionId = `reply_${Date.now()}_${replyCounter++}`;
  registerAction(actionId, async (sock, msg, extra) => {
    await extra.reply(replyText);
  });
  return customButton(displayText, actionId);
}

// ---------------------------------------------------------------------------
// Dispatch — called from handler.js for every incoming button click.
// ---------------------------------------------------------------------------

/**
 * @returns {boolean} true if this click was recognized and handled here.
 * Callers should stop further processing when this returns true.
 */
async function dispatch(sock, msg, extra) {
  const buttonId = extractButtonIdFromMessage(msg);
  if (!buttonId) return false;

  if (buttonId.startsWith('fn_')) {
    const actionId = buttonId.slice(3);
    const handlerFn = registry.get(actionId);
    if (!handlerFn) {
      logger.warn('BUTTON', `No custom action registered for "${actionId}"`);
      return false;
    }
    try {
      await handlerFn(sock, msg, extra, null);
      logger.log('BUTTON', `Ran custom action "${actionId}"`);
      return true;
    } catch (error) {
      logger.error('BUTTON', `Custom action "${actionId}" threw:`, error);
      try { await extra.reply(`❌ Button action failed: ${error.message}`); } catch {}
      return true; // still "handled" — we don't want legacy layers to also fire
    }
  }

  // cmd_ buttons are intentionally left to the existing command-routing
  // layer in handler.js / utils/button.js (already battle-tested), so we
  // don't duplicate that logic here — just report "not handled by us".
  return false;
}

module.exports = {
  registerAction,
  isRegistered,
  commandButton,
  customButton,
  replyButton,
  dispatch
};
