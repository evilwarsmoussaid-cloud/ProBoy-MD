/**
 * ProBoy-MD :: Scheduler
 * ============================================================================
 * Minimal named-interval task runner. Not a cron parser — just a safe
 * wrapper around setInterval that:
 *   - prevents duplicate named tasks
 *   - catches errors so one failing task never kills the process
 *   - supports running a task immediately + on an interval
 *   - can be stopped / listed (useful for future .channelwatch etc.)
 * ============================================================================
 */

const logger = require('./logger');

const tasks = new Map(); // name -> { intervalId, intervalMs }

/**
 * Schedule a named recurring task.
 * @param {string} name - unique task name
 * @param {number} intervalMs - how often to run
 * @param {Function} fn - async function to run
 * @param {Object} opts - { runImmediately?: boolean }
 */
function schedule(name, intervalMs, fn, opts = {}) {
  if (!name || typeof fn !== 'function') return;
  if (tasks.has(name)) return; // idempotent — don't double-schedule

  const safeRun = async () => {
    try {
      await fn();
    } catch (err) {
      logger.error('SCHEDULER', `Task "${name}" failed:`, err);
    }
  };

  if (opts.runImmediately !== false) safeRun();

  const intervalId = setInterval(safeRun, intervalMs);
  if (intervalId.unref) intervalId.unref(); // never keep process alive just for this
  tasks.set(name, { intervalId, intervalMs });
  logger.log('SCHEDULER', `Scheduled "${name}" every ${Math.round(intervalMs / 1000)}s`);
}

function stop(name) {
  const task = tasks.get(name);
  if (!task) return false;
  clearInterval(task.intervalId);
  tasks.delete(name);
  return true;
}

function stopAll() {
  for (const name of Array.from(tasks.keys())) stop(name);
}

function list() {
  return Array.from(tasks.keys());
}

module.exports = { schedule, stop, stopAll, list };
