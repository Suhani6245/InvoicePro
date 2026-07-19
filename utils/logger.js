const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, 'app.log');

const write = (level, message) => {
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  // Console output (visible in Render logs)
  if (level === 'ERROR') console.error(line.trim());
  else console.log(line.trim());

  // Best-effort file logging (non-blocking, ignored if filesystem is read-only)
  fs.appendFile(logFile, line, () => {});
};

module.exports = {
  info: (msg) => write('INFO', msg),
  warn: (msg) => write('WARN', msg),
  error: (msg) => write('ERROR', msg),
};
