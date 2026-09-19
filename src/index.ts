import { fetchRecentEmails } from './gmail/fetchEmails.js';
import { createCareerClassifierAgent } from './ai/agent.js';
import { createFollowUpAgent } from './ai/followUpGenerator.js';
import { classifyEmailsBatch } from './ai/classifier.js';
import { evaluatePreFilter } from './filters/careerEmailFilter.js';
import { verifyTableExists } from './db/dynamodb.js';
import { applicationService } from './db/applicationService.js';
import type { ApplicationRecord } from './db/types.js';
import { config } from './config/env.js';

async function main(): Promise<void> {
  console.log('========================================');
  console.log('CareerPilot — Phase 4: Follow-up Intelligence');
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

    // 4. Application Persistence to DynamoDB (Phase 3)
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

    // 5. Phase 4: Follow-Up Intelligence & AI Draft Generation
    console.log('4. Evaluating Follow-Up Intelligence & Generating AI Drafts...\n');
    const followUpAgent = createFollowUpAgent();
    const updatedApplications = await applicationService.evaluateAllApplicationsForFollowUp(followUpAgent);

    // 6. Print Concise CLI Summary
    console.log('========================================');
    console.log('CareerPilot — Phase 4 Execution Summary');
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

    const eligibleApps = updatedApplications.filter((app) => app.followUpEligible);
    console.log('Follow-Up Intelligence (Phase 4):');
    console.log(`  Total applications evaluated: ${updatedApplications.length}`);
    console.log(`  Eligible for follow-up      : ${eligibleApps.length}\n`);

    if (eligibleApps.length > 0) {
      console.log('Recommended Follow-Ups & AI Generated Drafts:');
      console.log('========================================');
      for (const app of eligibleApps) {
        console.log(`Company : ${app.company}`);
        console.log(`Role    : ${app.role}`);
        console.log(`Status  : ${app.status}`);
        console.log(`Reason  : ${app.followUpReason}`);

        if (app.followUpDraft) {
          console.log('\n--- AI Generated Draft (Review Before Sending) ---');
          console.log(`Subject: ${app.followUpDraft.subject}\n`);
          console.log(app.followUpDraft.body);
          console.log('--------------------------------------------------');
        }
        console.log('========================================');
      }
    } else {
      console.log('No applications currently require a follow-up email.');
    }

    console.log('\n[HUMAN-IN-THE-LOOP MANDATORY]');
    console.log('CareerPilot will NEVER automatically send emails. Drafts are generated and saved for candidate review.');

    console.log('\n========================================');
  } catch (error: unknown) {
    console.error('\n========================================');
    console.error('CareerPilot Phase 4 Error');
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

