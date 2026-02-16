const { execFile } = require('child_process');

function parseBool(raw) {
  return /^(1|true|yes|on)$/i.test(String(raw || '').trim());
}

function notifyMacOS({ title, message }) {
  if (process.platform !== 'darwin') return;
  if (!parseBool(process.env.MACOS_NOTIFICATIONS)) return;
  const t = String(title || 'AmazonSender');
  const m = String(message || '');
  const script = `display notification ${JSON.stringify(m)} with title ${JSON.stringify(t)}`;
  execFile('osascript', ['-e', script], () => {});
}

module.exports = { notifyMacOS };

