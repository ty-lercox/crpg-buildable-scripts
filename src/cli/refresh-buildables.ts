import { createFirestoreCatalogStore } from '../lib/firestore';
import { formatBuildableRefreshResult, queueBuildableRefreshRequests } from '../lib/refresh';

function parseArgs(argv: string[]): {
  help: boolean;
  dryRun: boolean;
  onlyScriptIds: string[];
  updatedBy: string | null;
} {
  let help = false;
  let dryRun = false;
  let updatedBy: string | null = null;
  const onlyScriptIds: string[] = [];

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
      onlyScriptIds.push(
        ...value
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      );
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
    if (token.startsWith('-')) {
      throw new Error(`Unknown argument: ${token}`);
    }
    onlyScriptIds.push(token);
  }

  return { help, dryRun, onlyScriptIds, updatedBy };
}

function printUsage(): void {
  console.log(
    'Usage: npm run refresh-buildables -- [--dry-run] [--updated-by id] [--only scriptId[,scriptId]] [scriptId ...]'
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const store = createFirestoreCatalogStore();
  const result = await queueBuildableRefreshRequests(store, {
    dryRun: args.dryRun,
    onlyScriptIds: args.onlyScriptIds,
    updatedBy: args.updatedBy,
  });

  console.log(formatBuildableRefreshResult(result));
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error('[refresh-buildables] failed', message);
  process.exitCode = 1;
});
