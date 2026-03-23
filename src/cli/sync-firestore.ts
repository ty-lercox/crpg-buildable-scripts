import { createFirestoreCatalogStore } from '../lib/firestore';
import { formatSyncResult, syncFirestoreScripts, writeSyncReport } from '../lib/sync';
import { DEFAULT_SYNC_REPORT_PATH } from '../lib/types';

function parseArgs(argv: string[]): {
  help: boolean;
  dryRun: boolean;
  onlyScriptIds: string[];
  reportPath: string;
  updatedBy: string | null;
} {
  let help = false;
  let dryRun = true;
  let onlyScriptIds: string[] = [];
  let reportPath = DEFAULT_SYNC_REPORT_PATH;
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
    if (token === '--only') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --only');
      }
      onlyScriptIds = value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
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

  return { help, dryRun, onlyScriptIds, reportPath, updatedBy };
}

function printUsage(): void {
  console.log('Usage: npm run sync-firestore -- [--dry-run|--apply] [--only scriptId[,scriptId]] [--report artifacts/sync-report.json] [--updated-by id]');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const store = createFirestoreCatalogStore();
  const result = await syncFirestoreScripts(store, {
    dryRun: args.dryRun,
    onlyScriptIds: args.onlyScriptIds,
    updatedBy: args.updatedBy,
  });
  const written = writeSyncReport(result, undefined, args.reportPath);
  console.log(formatSyncResult(result));
  console.log(`[sync-firestore] report=${written.jsonPath}`);
  console.log(`[sync-firestore] markdown=${written.markdownPath}`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error('[sync-firestore] failed', message);
  process.exitCode = 1;
});
