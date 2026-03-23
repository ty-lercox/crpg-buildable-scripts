import { createFirestoreCatalogStore } from '../lib/firestore';
import { DEFAULT_SCAN_REPORT_PATH } from '../lib/types';
import { scanFirestore, writeScanReport } from '../lib/scan';

function parseArgs(argv: string[]): { help: boolean; reportPath: string } {
  let help = false;
  let reportPath = DEFAULT_SCAN_REPORT_PATH;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      help = true;
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
    throw new Error(`Unknown argument: ${token}`);
  }

  return { help, reportPath };
}

function printUsage(): void {
  console.log('Usage: npm run scan-firestore -- [--report artifacts/firestore-scan.json]');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const store = createFirestoreCatalogStore();
  const report = await scanFirestore(store);
  const written = writeScanReport(report, undefined, args.reportPath);
  console.log(`[scan-firestore] scripts=${report.scriptCount} assignments=${report.assignmentCount} report=${written.jsonPath}`);
  console.log(`[scan-firestore] markdown=${written.markdownPath}`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error('[scan-firestore] failed', message);
  process.exitCode = 1;
});
