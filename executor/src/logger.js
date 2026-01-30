const levels = ['error', 'warn', 'info', 'debug'];

function createLogger(level = 'info') {
  const minIdx = levels.indexOf(level);
  const shouldLog = (lvl) => levels.indexOf(lvl) <= minIdx;

  return {
    error: (...args) => shouldLog('error') && console.error(...args),
    warn: (...args) => shouldLog('warn') && console.warn(...args),
    info: (...args) => shouldLog('info') && console.log(...args),
    debug: (...args) => shouldLog('debug') && console.log(...args)
  };
}

module.exports = { createLogger };
