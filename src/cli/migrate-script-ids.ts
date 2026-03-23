import { createFirestoreCatalogStore } from '../lib/firestore';
import {
  applyScriptIdMigration,
  formatScriptIdMigrationResult,
  readMigrationManifest,
  writeScriptIdMigrationReport,
} from '../lib/migration';
import { DEFAULT_MIGRATION_REPORT_PATH } from '../lib/types';
import { resolveRepoRoot } from '../lib/repo';

function parseArgs(argv: string[]): {
  help: boolean;
  dryRun: boolean;
  manifestPath?: string;
  reportPath: string;
  updatedBy: string | null;
} {
  let help = false;
  let dryRun = true;
  let manifestPath: string | undefined;
  let reportPath = DEFAULT_MIGRATION_REPORT_PATH;
  let updatedBy: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }
    if (token === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (token === '--apply') {
      dryRun = false;
      continue;
    }
    if (token === '--manifest') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --manifest');
      }
      manifestPath = value;
      index += 1;
      continue;
    }
    if (token === '--report') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --report');
      }
      reportPath = value;
      index += 1;
      continue;
    }
    if (token === '--updated-by') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --updated-by');
      }
      updatedBy = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return { help, dryRun, manifestPath, reportPath, updatedBy };
}

function printUsage(): void {
  console.log(
    'Usage: node dist/cli/migrate-script-ids.js [--dry-run|--apply] [--manifest imports/script-id-migration.json] [--report artifacts/script-id-migration.json] [--updated-by id]'
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const repoRoot = resolveRepoRoot();
  const manifest = readMigrationManifest(repoRoot, args.manifestPath);
  const store = createFirestoreCatalogStore();
  const result = await applyScriptIdMigration(store, manifest, {
    dryRun: args.dryRun,
    updatedBy: args.updatedBy,
    manifestPath: args.manifestPath ?? null,
  });
  const written = writeScriptIdMigrationReport(result, repoRoot, args.reportPath);
  console.log(formatScriptIdMigrationResult(result));
  console.log(`[migrate-script-ids] report=${written.jsonPath}`);
  console.log(`[migrate-script-ids] markdown=${written.markdownPath}`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error('[migrate-script-ids] failed', message);
  process.exitCode = 1;
});
