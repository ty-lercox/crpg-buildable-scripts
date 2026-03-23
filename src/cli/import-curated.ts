import { createFirestoreCatalogStore } from '../lib/firestore';
import { formatImportCuratedResult, importCuratedScripts } from '../lib/importCurated';

function parseArgs(argv: string[]): { help: boolean; manifestPath?: string; importAll: boolean } {
  let help = false;
  let manifestPath: string | undefined;
  let importAll = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }
    if (token === '--all') {
      importAll = true;
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
    throw new Error(`Unknown argument: ${token}`);
  }

  return { help, manifestPath, importAll };
}

function printUsage(): void {
  console.log('Usage: npm run import-curated -- [--manifest imports/initial-curated.json] [--all]');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const store = createFirestoreCatalogStore();
  const result = await importCuratedScripts(store, { manifestPath: args.manifestPath, importAll: args.importAll });
  console.log(formatImportCuratedResult(result));
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error('[import-curated] failed', message);
  process.exitCode = 1;
});
