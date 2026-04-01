const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function collectTestFiles(rootDir) {
  const files = [];

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.test.js')) {
        files.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return files.sort();
}

const repoRoot = path.resolve(__dirname, '..');
const testsRoot = path.join(repoRoot, 'dist', 'tests');

if (!fs.existsSync(testsRoot) || !fs.statSync(testsRoot).isDirectory()) {
  console.error(`[run-node-tests] missing compiled tests directory: ${testsRoot}`);
  process.exit(1);
}

const testFiles = collectTestFiles(testsRoot);
if (testFiles.length === 0) {
  console.error(`[run-node-tests] no compiled test files found under: ${testsRoot}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
