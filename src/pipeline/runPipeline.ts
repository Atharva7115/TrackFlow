import { fetchRecentEmails } from '../gmail/fetchEmails.js';
import { createCareerClassifierAgent } from '../ai/agent.js';
import { createFollowUpAgent } from '../ai/followUpGenerator.js';
import { classifyEmailsBatch } from '../ai/classifier.js';
import { evaluatePreFilter } from '../filters/careerEmailFilter.js';
import { verifyTableExists } from '../db/dynamodb.js';
import { applicationService, ApplicationService } from '../db/applicationService.js';
import type { ApplicationRecord } from '../db/types.js';
import type { GmailEmail } from '../gmail/types.js';
import { config } from '../config/env.js';

export interface PipelineDependencies {
  appService?: ApplicationService;
  fetchEmailsFn?: () => Promise<GmailEmail[]>;
  classifierAgentFactory?: () => any;
  followUpAgentFactory?: () => any;
  verifyTableFn?: () => Promise<boolean>;
}

export interface PipelineExecutionSummary {
  status: 'SUCCESS';
  timestamp: string;
  emailsFetched: number;
  preFilterSkipped: number;
  alreadyProcessedSkipped: number;
  aiAnalyzed: number;
  careerEmailCount: number;
  applicationRelatedCount: number;
  jobRecCount: number;
  newAppsCount: number;
  updatedAppsCount: number;
  skippedDbCount: number;
  followUpsEvaluated: number;
  followUpsEligible: number;
  trackedApplications?: ApplicationRecord[];
}

/**
 * Reusable core pipeline execution logic for CareerPilot.
 * Orchestrates email ingestion, zero-cost deduplication, Bedrock classification,
 * DynamoDB persistence, and follow-up intelligence without calling process.exit().
 */
export async function runPipeline(deps: PipelineDependencies = {}): Promise<PipelineExecutionSummary> {
  const appService = deps.appService || applicationService;
  const fetchEmailsFn = deps.fetchEmailsFn || fetchRecentEmails;
  const classifierAgentFactory = deps.classifierAgentFactory || createCareerClassifierAgent;
  const followUpAgentFactory = deps.followUpAgentFactory || createFollowUpAgent;
  const verifyTableFn = deps.verifyTableFn || verifyTableExists;

  const timestamp = new Date().toISOString();

  // 0. Verify DynamoDB Table Connection
  await verifyTableFn();

  // 1. Ingest Emails from Gmail
  const allEmails = await fetchEmailsFn();

  if (allEmails.length === 0) {
    return {
      status: 'SUCCESS',
      timestamp,
      emailsFetched: 0,
      preFilterSkipped: 0,
      alreadyProcessedSkipped: 0,
      aiAnalyzed: 0,
      careerEmailCount: 0,
      applicationRelatedCount: 0,
      jobRecCount: 0,
      newAppsCount: 0,
      updatedAppsCount: 0,
      skippedDbCount: 0,
      followUpsEvaluated: 0,
      followUpsEligible: 0,
    };
  }

  // 2. Pre-filter obvious noise (OTPs, rides, receipts)
  const preFilterCandidates: GmailEmail[] = [];
  let preFilterSkipped = 0;

  for (const email of allEmails) {
    const decision = evaluatePreFilter(email);
    if (decision.shouldProcessWithAI) {
      preFilterCandidates.push(email);
    } else {
      preFilterSkipped++;
    }
  }

  // 3. Pre-AI Memory Deduplication: Drop already-processed and ignored emails BEFORE slicing
  const knownEmailIds = await appService.getAllKnownEmailIds();
  const freshCandidates: GmailEmail[] = [];
  let alreadyProcessedSkipped = 0;

  for (const candidate of preFilterCandidates) {
    if (knownEmailIds.has(candidate.id)) {
      alreadyProcessedSkipped++;
    } else {
      freshCandidates.push(candidate);
    }
  }

  // 4. AI Classification on Cost-Controlled Batch
  const batchToProcess = freshCandidates.slice(0, config.aiMaxEmails);
  let careerEmailCount = 0;
  let applicationRelatedCount = 0;
  let jobRecCount = 0;
  let newAppsCount = 0;
  let updatedAppsCount = 0;
  let skippedDbCount = 0;
  const trackedApplications: ApplicationRecord[] = [];

  if (batchToProcess.length > 0) {
    const agent = classifierAgentFactory();
    const classifiedResults = await classifyEmailsBatch(agent, batchToProcess);

    // 5. Application Persistence to DynamoDB
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

      const processResult = await appService.processCareerEmail(item.email, analysis);

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
  }

  // 6. Follow-Up Intelligence & AI Draft Generation
  const followUpAgent = followUpAgentFactory();
  const updatedApplications = await appService.evaluateAllApplicationsForFollowUp(followUpAgent);
  const eligibleApps = updatedApplications.filter((app) => app.followUpEligible);

  return {
    status: 'SUCCESS',
    timestamp,
    emailsFetched: allEmails.length,
    preFilterSkipped,
    alreadyProcessedSkipped,
    aiAnalyzed: batchToProcess.length,
    careerEmailCount,
    applicationRelatedCount,
    jobRecCount,
    newAppsCount,
    updatedAppsCount,
    skippedDbCount,
    followUpsEvaluated: updatedApplications.length,
    followUpsEligible: eligibleApps.length,
    trackedApplications,
  };
}
