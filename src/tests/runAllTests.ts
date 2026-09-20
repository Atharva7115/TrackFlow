import './testSafety.js';
import { runPhase3Tests } from './phase3.test.js';
import { runPhase4Tests } from './phase4.test.js';
import { runPhase5Tests } from './phase5.test.js';
import { runPhase6Tests } from './phase6.test.js';

async function main() {
  console.log('========================================');
  console.log('CareerPilot — Suite Test Execution');
  console.log('========================================');

  try {
    await runPhase3Tests();
    await runPhase4Tests();
    await runPhase5Tests();
    await runPhase6Tests();
    console.log('\n========================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY! (0 Bedrock API calls made during tests)');
    console.log('========================================\n');
  } catch (err: unknown) {
    console.error('\n========================================');
    console.error('TEST FAILURE DETECTED:');
    console.error(err instanceof Error ? err.stack || err.message : err);
    console.error('========================================\n');
    process.exit(1);
  }
}

main();
