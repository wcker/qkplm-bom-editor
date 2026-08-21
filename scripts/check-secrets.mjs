import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

const binaryExtensions = new Set([
  '.gif',
  '.gz',
  '.ico',
  '.jpeg',
  '.jpg',
  '.pdf',
  '.png',
  '.webp',
  '.zip'
]);

const forbiddenPath = /(^|\/)\.env(?:\.[^/]+)?$/i;
const forbiddenExtensions = new Set(['.key', '.pem', '.p12', '.pfx']);
const patterns = [
  ['private-key', /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g],
  ['aws-access-key', /AKIA[0-9A-Z]{16}/g],
  ['github-token', /(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/g],
  ['google-api-key', /AIza[0-9A-Za-z_-]{35}/g],
  ['npm-token', /npm_[A-Za-z0-9]{20,}/g],
  ['slack-token', /xox[baprs]-[A-Za-z0-9-]{10,}/g]
];

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const findings = [];

for (const file of files) {
  const extension = extname(file).toLowerCase();
  if (forbiddenPath.test(file) || forbiddenExtensions.has(extension)) {
    findings.push({ file, rule: 'forbidden-sensitive-file' });
    continue;
  }
  if (binaryExtensions.has(extension) || statSync(file).size > 2 * 1024 * 1024) {
    continue;
  }

  const bytes = readFileSync(file);
  if (bytes.includes(0)) {
    continue;
  }
  const content = bytes.toString('utf8');
  for (const [rule, pattern] of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      findings.push({ file, rule });
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`Secret scan failed: ${finding.rule} in ${finding.file}`);
  }
  process.exit(1);
}

console.log(`Secret scan passed for ${files.length} tracked files.`);
