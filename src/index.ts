import { fetchRecentEmails } from './gmail/fetchEmails.js';
import { createCareerClassifierAgent } from './ai/agent.js';
import { classifyEmailsBatch } from './ai/classifier.js';
import { evaluatePreFilter } from './filters/careerEmailFilter.js';
import { verifyTableExists } from './db/dynamodb.js';
import { applicationService } from './db/applicationService.js';
import type { ApplicationRecord } from './db/types.js';
import { config } from './config/env.js';

async function main(): Promise<void> {
  console.log('========================================');
  console.log('CareerPilot — Phase 3: Application Tracker');
  console.log('========================================');
  console.log('AI Provider : Amazon Bedrock');
  console.log(`Model       : Claude 3 Haiku (${config.bedrockModelId})`);
  console.log(`Region      : ${config.awsRegion}`);
  console.log('Cost Model  : Pay-per-token');
  console.log('Budget      : AWS promotional credits');
  console.log(`Max Batch   : ${config.aiMaxEmails} emails per run`);
  console.log('========================================\n');

  try {
    // 0. Verify DynamoDB table connection
    console.log(`Checking DynamoDB table "${config.dynamoDbTableName}" in ${config.awsRegion}...`);
    await verifyTableExists();
    console.log('DynamoDB table verified.\n');

    // 1. Ingest emails from Gmail
    console.log(`1. Ingesting emails from Gmail (query: "${config.gmailQuery}", maxResults: ${config.gmailMaxResults})...\n`);
    const allEmails = await fetchRecentEmails();

    if (allEmails.length === 0) {
      console.log('No emails found matching the Gmail query.');
      console.log('========================================');
      return;
    }

    // 2. Pre-filter obvious noise
    const candidates = [];
    let preFilterSkipped = 0;

    for (const email of allEmails) {
      const decision = evaluatePreFilter(email);
      if (decision.shouldProcessWithAI) {
        candidates.push(email);
      } else {
        preFilterSkipped++;
      }
    }

    // 3. AI Classification on cost-controlled batch
    const batchToProcess = candidates.slice(0, config.aiMaxEmails);
    console.log(`2. Running AI classification on ${batchToProcess.length} candidate emails (${config.bedrockModelId})...\n`);

    const agent = createCareerClassifierAgent();
    const classifiedResults = await classifyEmailsBatch(agent, batchToProcess);

    // 4. Application Persistence to DynamoDB
    console.log('3. Persisting application updates to Amazon DynamoDB...\n');

    let careerEmailCount = 0;
    let applicationRelatedCount = 0;
    let jobRecCount = 0;
    let newAppsCount = 0;
    let updatedAppsCount = 0;
    let skippedDbCount = 0;
    const trackedApplications: ApplicationRecord[] = [];

    for (const item of classifiedResults) {
      if (!item.analysis) {
        skippedDbCount++;
        continue;
      }

      const analysis = item.analysis;
      if (analysis.isCareerRelated) {
        careerEmailCount++;
      }

      if (analysis.emailType === 'JOB_RECOMMENDATION') {
        jobRecCount++;
      }

      if (analysis.isApplicationRelated) {
        applicationRelatedCount++;
      }

      const processResult = await applicationService.processCareerEmail(item.email, analysis);

      if (processResult.action === 'CREATED') {
        newAppsCount++;
        if (processResult.application) trackedApplications.push(processResult.application);
      } else if (processResult.action === 'UPDATED') {
        updatedAppsCount++;
        if (processResult.application) trackedApplications.push(processResult.application);
      } else {
        skippedDbCount++;
      }
    }

    // 5. Print Concise CLI Summary
    console.log('========================================');
    console.log('CareerPilot — Phase 3 Execution Summary');
    console.log('========================================\n');

    console.log(`Emails fetched: ${allEmails.length}`);
    console.log(`Pre-filter skipped: ${preFilterSkipped}`);
    console.log(`AI analyzed: ${batchToProcess.length}`);
    console.log(`Career emails: ${careerEmailCount}`);
    console.log(`Application-related: ${applicationRelatedCount}`);
    console.log(`Job recommendations skipped: ${jobRecCount}\n`);

    console.log('DynamoDB Persistence:');
    console.log(`  New applications: ${newAppsCount}`);
    console.log(`  Updated applications: ${updatedAppsCount}`);
    console.log(`  Skipped (non-app / duplicates): ${skippedDbCount}\n`);

    if (trackedApplications.length > 0) {
      console.log('Active Applications Ingested:');
      console.log('----------------------------------------');
      // Deduplicate by applicationId for display
      const displayed = new Map<string, ApplicationRecord>();
      for (const app of trackedApplications) {
        displayed.set(app.applicationId, app);
      }

      for (const app of displayed.values()) {
        console.log(`Company : ${app.company}`);
        console.log(`Role    : ${app.role}`);
        console.log(`Status  : ${app.status}`);
        if (app.deadline) {
          console.log(`Deadline: ${app.deadline}`);
        }
        if (app.eventDate) {
          console.log(`Event   : ${app.eventDate}`);
        }
        console.log(`Emails  : ${app.emailCount}`);
        console.log('----------------------------------------');
      }
    } else {
      console.log('No new application state updates recorded in this run.');
    }

    console.log('\n========================================');
  } catch (error: unknown) {
    console.error('\n========================================');
    console.error('CareerPilot Phase 3 Error');
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
