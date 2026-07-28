/**
 * ProBoy-MD :: Logger
 * ============================================================================
 * Small, dependency-free tagged logger. Used by every new subsystem
 * (channelManager, reactionManager, buttonManager, antiSystem,
 * automationEngine, scheduler) so log output stays consistent and
 * greppable in production (`[CHANNEL]`, `[AUTOREACT]`, `[BUTTON]`, etc.)
 *
 * Does NOT replace the existing colored `line()` logger in proboy.js —
 * that one stays exactly as-is for boot/connection logs. This is only for
 * the new subsystems so they don't need to import proboy.js internals.
 * ============================================================================
 */

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[1;36m',
  green: '\x1b[1;32m',
  yellow: '\x1b[1;33m',
  red: '\x1b[1;31m',
  magenta: '\x1b[1;35m',
  blue: '\x1b[1;34m'
};

const TAG_COLORS = {
  CHANNEL: COLORS.cyan,
  AUTOREACT: COLORS.green,
  AUTOMATION: COLORS.magenta,
  BUTTON: COLORS.blue,
  ANTILINK: COLORS.yellow,
  ANTICALL: COLORS.yellow,
  SCHEDULER: COLORS.dim,
  ERROR: COLORS.red
};

function fmt(tag, msg) {
  const color = TAG_COLORS[tag] || COLORS.dim;
  return `${color}[${tag}]${COLORS.reset} ${msg}`;
}

function log(tag, ...args) {
  console.log(fmt(tag, args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')));
}

function warn(tag, ...args) {
  console.warn(fmt(tag, args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')));
}

function error(tag, ...args) {
  console.error(fmt('ERROR', `(${tag}) ` + args.map(a => (a?.message || a)).join(' ')));
}

module.exports = { log, warn, error };
