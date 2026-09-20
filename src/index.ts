import { runPipeline } from './pipeline/runPipeline.js';
import { config } from './config/env.js';

async function main(): Promise<void> {
  console.log('========================================');
  console.log('CareerPilot — Application Tracking Pipeline');
  console.log('========================================');
  console.log('AI Provider : Amazon Bedrock');
  console.log(`Model       : Claude 3 Haiku (${config.bedrockModelId})`);
  console.log(`Region      : ${config.awsRegion}`);
  console.log('Cost Model  : Pay-per-token');
  console.log('Budget      : AWS promotional credits');
  console.log(`Max Batch   : ${config.aiMaxEmails} emails per run`);
  console.log('========================================\n');

  try {
    const summary = await runPipeline();

    console.log('========================================');
    console.log('CareerPilot — Execution Summary');
    console.log('========================================\n');

    console.log(`Emails fetched             : ${summary.emailsFetched}`);
    console.log(`Pre-filter skipped (noise) : ${summary.preFilterSkipped}`);
    console.log(`Already processed (memory) : ${summary.alreadyProcessedSkipped}`);
    console.log(`AI analyzed with Bedrock   : ${summary.aiAnalyzed}`);
    console.log(`Career emails detected     : ${summary.careerEmailCount}`);
    console.log(`Application-related        : ${summary.applicationRelatedCount}`);
    console.log(`Job recommendations ignored: ${summary.jobRecCount}\n`);

    console.log('DynamoDB Persistence:');
    console.log(`  New applications: ${summary.newAppsCount}`);
    console.log(`  Updated applications: ${summary.updatedAppsCount}`);
    console.log(`  Skipped (non-app / duplicates): ${summary.skippedDbCount}\n`);

    console.log('Follow-Up Intelligence:');
    console.log(`  Total applications evaluated: ${summary.followUpsEvaluated}`);
    console.log(`  Eligible for follow-up      : ${summary.followUpsEligible}\n`);

    console.log('[HUMAN-IN-THE-LOOP MANDATORY]');
    console.log('CareerPilot will NEVER automatically send emails. Drafts are generated and saved for candidate review.');
    console.log('========================================\n');
  } catch (error: unknown) {
    console.error('\n========================================');
    console.error('CareerPilot Pipeline Execution Error');
    console.error('========================================');
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error('An unexpected error occurred:', error);
    }
    console.error('========================================\n');
    process.exit(1);
  }
}

main();
