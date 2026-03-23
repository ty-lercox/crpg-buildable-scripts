import { listRepoScripts } from '../lib/repo';
import { validateLoadedRepoScripts } from '../lib/validation';

function parseArgs(argv: string[]): { help: boolean; onlyScriptIds: string[] } {
  let help = false;
  let onlyScriptIds: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      help = true;
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
    throw new Error(`Unknown argument: ${token}`);
  }

  return { help, onlyScriptIds };
}

function printUsage(): void {
  console.log('Usage: npm run validate-repo -- [--only scriptId[,scriptId]]');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const scripts = listRepoScripts(process.cwd(), args.onlyScriptIds);
  validateLoadedRepoScripts(scripts);
  console.log(`[validate-repo] ok scripts=${scripts.length}`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error('[validate-repo] failed', message);
  process.exitCode = 1;
});
