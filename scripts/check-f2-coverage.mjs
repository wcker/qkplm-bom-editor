import { spawnSync } from 'node:child_process';

const coverageTarget = '95';

const suites = [
  {
    name: 'model diff',
    include: '**/packages/model/dist/diff.js',
    tests: ['packages/model/test/diff.test.mjs'],
  },
  {
    name: 'model indexes',
    include: '**/packages/model/dist/indexes.js',
    tests: [
      'packages/model/test/snapshot-index.test.mjs',
      'packages/transaction/test/index-equivalence.test.mjs',
    ],
  },
  {
    name: 'transaction engine',
    include: '**/packages/transaction/dist/engine.js',
    tests: [
      'packages/transaction/test/transaction-engine.test.mjs',
      'packages/transaction/test/index-equivalence.test.mjs',
    ],
  },
];

for (const suite of suites) {
  console.log(`[f2:coverage] ${suite.name}`);
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-test-coverage',
      `--test-coverage-branches=${coverageTarget}`,
      `--test-coverage-include=${suite.include}`,
      '--test',
      ...suite.tests,
    ],
    { stdio: 'inherit' },
  );
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
