const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function appendCsvRow(filePath, headers, rowObj) {
  ensureDir(path.dirname(filePath));
  const exists = fs.existsSync(filePath);
  const row = headers.map((h) => escapeCsv(rowObj[h] ?? '')).join(',');
  if (!exists) {
    const headerLine = headers.join(',');
    fs.appendFileSync(filePath, headerLine + '\n' + row + '\n');
  } else {
    fs.appendFileSync(filePath, row + '\n');
  }
}

module.exports = { appendCsvRow };
