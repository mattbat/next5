// Runs every check before a commit (REQUIREMENTS.md Q-1, Q-7), one step at a
// time and stopping at the first failure:
//   lint → type check → unit tests (with coverage) → bundle → end-to-end
// Steps run one after another on purpose: running them side by side on a
// 4-core machine made browser tests time out now and then.
// The bundle step skips `tsc` because the type check already ran.
import { spawnSync } from 'node:child_process';

const steps = [
  ['Lint', 'npx eslint .'],
  ['Type check', 'npx tsc'],
  ['Unit tests', 'npx vitest run --coverage'],
  ['Build', 'npx vite build'],
  ['End-to-end tests', 'npx playwright test'],
];

const start = Date.now();
const summary = [];
for (const [name, command] of steps) {
  const stepStart = Date.now();
  console.log(`\n── ${name} ──`);
  const { status } = spawnSync(command, { shell: true, stdio: 'inherit' });
  const seconds = ((Date.now() - stepStart) / 1000).toFixed(0);
  summary.push(`${status === 0 ? '✓' : '✖'} ${name} ${seconds}s`);
  if (status !== 0) {
    process.exitCode = 1;
    break;
  }
}
console.log(`\n${summary.join('\n')}\nTotal ${((Date.now() - start) / 1000).toFixed(0)}s`);
