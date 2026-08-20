import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const normativeName = '现代化高性能可复用BOM编辑器组件.md';
const legacyName = '现代化高性能可定制智能BOM编辑器组件 官方落地白皮书（生产级）.md';
const normativePath = resolve(root, normativeName);
const legacyPath = resolve(root, legacyName);
const failures = [];

function toPortablePath(path) {
  return path.replaceAll('\\', '/');
}

function requireCondition(condition, message) {
  if (!condition) failures.push(message);
}

function readRequired(path) {
  requireCondition(existsSync(path), `Missing required file: ${path}`);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

const normative = readRequired(normativePath);
const legacy = readRequired(legacyPath);

requireCondition(
  normative.includes('本仓库唯一工程规范源（Single Source of Truth）'),
  'Normative whitepaper is missing its single-source-of-truth marker.',
);

let previousIndex = -1;
for (let section = 0; section <= 19; section += 1) {
  const heading = `# ${section}. `;
  const index = normative.indexOf(heading);
  requireCondition(index >= 0, `Missing normative section ${section}.`);
  requireCondition(index > previousIndex, `Normative section ${section} is out of order.`);
  previousIndex = index;
}

const fenceCount = normative.match(/^```/gm)?.length ?? 0;
requireCondition(fenceCount % 2 === 0, `Unmatched code fence count: ${fenceCount}.`);
requireCondition(!/[�]/u.test(normative), 'Normative whitepaper contains replacement characters.');
requireCondition(!/\b(?:TODO|TBD)\b/u.test(normative), 'Normative whitepaper contains unresolved placeholders.');

requireCondition(
  legacy.startsWith('# （已废弃）'),
  'Legacy whitepaper is not clearly marked as deprecated.',
);
requireCondition(
  legacy.includes(`./${normativeName}`),
  'Legacy whitepaper does not link to the normative whitepaper.',
);

function collectMarkdownFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
      continue;
    }

    const absoluteEntry = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(absoluteEntry));
    } else if (extname(entry.name).toLowerCase() === '.md') {
      files.push(toPortablePath(relative(root, absoluteEntry)));
    }
  }

  return files;
}

const markdownFiles = collectMarkdownFiles(root);

for (const requiredDocument of [
  'docs/研发落地实施计划.md',
  'docs/需求追踪矩阵.md',
  'docs/adr/README.md',
]) {
  requireCondition(
    markdownFiles.includes(requiredDocument),
    `Missing required governance document: ${requiredDocument}`,
  );
}

const deliveryPlan = readRequired(resolve(root, 'docs/研发落地实施计划.md'));
for (let phase = 0; phase <= 9; phase += 1) {
  requireCondition(deliveryPlan.includes(`F${phase}`), `Delivery plan is missing phase F${phase}.`);
}

const traceability = readRequired(resolve(root, 'docs/需求追踪矩阵.md'));
const requirementIds = [
  ...traceability.matchAll(/^\| (REQ-(?:[0-9]{2}|AI)-[0-9]{3})\s*\|/gmu),
].map((match) => match[1]);
const uniqueRequirementIds = new Set(requirementIds);
requireCondition(
  requirementIds.length === uniqueRequirementIds.size,
  'Traceability matrix contains duplicate REQ IDs.',
);
for (let section = 0; section <= 19; section += 1) {
  const prefix = `REQ-${String(section).padStart(2, '0')}-`;
  requireCondition(
    requirementIds.some((id) => id.startsWith(prefix)),
    `Traceability matrix has no requirement for normative section ${section}.`,
  );
}
requireCondition(
  requirementIds.filter((id) => id.startsWith('REQ-AI-')).length === 3,
  'Traceability matrix must contain exactly three optional AI requirements.',
);

for (let adr = 1; adr <= 9; adr += 1) {
  const prefix = `${String(adr).padStart(4, '0')}-`;
  const adrFile = markdownFiles.find(
    (file) => file.startsWith('docs/adr/') && file.split('/').at(-1)?.startsWith(prefix),
  );
  requireCondition(Boolean(adrFile), `Missing ADR ${prefix}*.md`);
  if (!adrFile) continue;

  const adrContent = readRequired(resolve(root, adrFile));
  for (const requiredSection of [
    '- 状态：',
    '## 上下文',
    '## 决策',
    '## 后果',
    '## 被否决方案',
    '## 验证方式',
  ]) {
    requireCondition(
      adrContent.includes(requiredSection),
      `${adrFile} is missing required ADR section: ${requiredSection}`,
    );
  }
}

for (const relativeFile of markdownFiles) {
  const absoluteFile = resolve(root, relativeFile);
  const content = readRequired(absoluteFile);
  const links = content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g);

  for (const [, rawTarget] of links) {
    if (/^(?:https?:|mailto:|#)/u.test(rawTarget)) continue;
    const withoutAnchor = rawTarget.split('#', 1)[0];
    if (!withoutAnchor) continue;

    let decodedTarget;
    try {
      decodedTarget = decodeURIComponent(withoutAnchor);
    } catch {
      failures.push(`Invalid URL encoding in ${relativeFile}: ${rawTarget}`);
      continue;
    }

    const linkedPath = resolve(dirname(absoluteFile), decodedTarget);
    requireCondition(existsSync(linkedPath), `Broken local link in ${relativeFile}: ${rawTarget}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Documentation checks passed (${markdownFiles.length} files, ${uniqueRequirementIds.size} requirements, ${fenceCount} normative code fences, sections 0-19).`,
  );
}
