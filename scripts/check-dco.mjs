import { execFileSync } from 'node:child_process';

const [base, head] = process.argv.slice(2);
const shaPattern = /^[0-9a-f]{40}$/i;

if (!shaPattern.test(base ?? '') || !shaPattern.test(head ?? '')) {
  throw new Error('Usage: node scripts/check-dco.mjs <base-sha> <head-sha>');
}

const commits = execFileSync('git', ['rev-list', '--reverse', `${base}..${head}`], {
  encoding: 'utf8'
}).trim().split('\n').filter(Boolean);
const signOffPattern = /^Signed-off-by:\s+.+\s+<[^<>\s]+@[^<>\s]+>\s*$/im;
const missingSignOff = commits.filter((commit) => {
  const message = execFileSync('git', ['show', '-s', '--format=%B', commit], {
    encoding: 'utf8'
  });
  return !signOffPattern.test(message);
});

if (missingSignOff.length > 0) {
  console.error(`DCO check failed: ${missingSignOff.length} commit(s) are missing a Signed-off-by trailer.`);
  for (const commit of missingSignOff) {
    console.error(`- ${commit}`);
  }
  process.exit(1);
}

console.log(`DCO check passed for ${commits.length} commit(s).`);
