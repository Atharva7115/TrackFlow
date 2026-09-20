import { runPipeline, type PipelineExecutionSummary } from '../pipeline/runPipeline.js';

export interface LambdaExecutionReport {
  statusCode: number;
  body: {
    status: 'SUCCESS' | 'FAILED';
    timestamp: string;
    durationMs: number;
    metrics?: {
      emailsFetched: number;
      preFilterSkipped: number;
      alreadyProcessedSkipped: number;
      aiAnalyzed: number;
      careerEmails: number;
      applicationRelated: number;
      jobRecommendationsIgnored: number;
      newApplications: number;
      updatedApplications: number;
      skippedDb: number;
      followUpsEvaluated: number;
      followUpsEligible: number;
    };
    error?: string;
  };
}

/**
 * Core execution logic for scheduled pipeline run with structured logging and metrics.
 * Re-throws caught errors so the invocation is officially registered as failed in CloudWatch.
 */
export async function handleScheduledRun(
  runner: () => Promise<PipelineExecutionSummary> = runPipeline
): Promise<LambdaExecutionReport> {
  const startTime = Date.now();
  console.log('[CareerPilot Lambda] Scheduled pipeline execution started.');

  try {
    const summary = await runner();
    const durationMs = Date.now() - startTime;

    console.log('[CareerPilot Lambda] Pipeline execution completed successfully.', {
      durationMs,
      emailsFetched: summary.emailsFetched,
      preFilterSkipped: summary.preFilterSkipped,
      alreadyProcessedSkipped: summary.alreadyProcessedSkipped,
      aiAnalyzed: summary.aiAnalyzed,
      newApps: summary.newAppsCount,
      updatedApps: summary.updatedAppsCount,
      followUpsEligible: summary.followUpsEligible,
    });

    return {
      statusCode: 200,
      body: {
        status: 'SUCCESS',
        timestamp: summary.timestamp,
        durationMs,
        metrics: {
          emailsFetched: summary.emailsFetched,
          preFilterSkipped: summary.preFilterSkipped,
          alreadyProcessedSkipped: summary.alreadyProcessedSkipped,
          aiAnalyzed: summary.aiAnalyzed,
          careerEmails: summary.careerEmailCount,
          applicationRelated: summary.applicationRelatedCount,
          jobRecommendationsIgnored: summary.jobRecCount,
          newApplications: summary.newAppsCount,
          updatedApplications: summary.updatedAppsCount,
          skippedDb: summary.skippedDbCount,
          followUpsEvaluated: summary.followUpsEvaluated,
          followUpsEligible: summary.followUpsEligible,
        },
      },
    };
  } catch (error: unknown) {
    const durationMs = Date.now() - startTime;
    if (error instanceof Error) {
      console.error('[CareerPilot Lambda Error] Scheduled pipeline failed:', {
        message: error.message,
        stack: error.stack,
        durationMs,
      });
    } else {
      console.error('[CareerPilot Lambda Error] Scheduled pipeline failed with unknown error:', error);
    }

    // Re-throw so AWS Lambda registers the invocation failure
    throw error;
  }
}

/**
 * AWS Lambda scheduled entrypoint for CareerPilot automated ingestion pipeline.
 * Triggered by EventBridge schedule (rate: 3 hours).
 * 
 * Signature strictly accepts (event, context) to avoid collision with runtime callback arguments.
 */
export async function handler(_event?: unknown, _context?: unknown): Promise<LambdaExecutionReport> {
  return handleScheduledRun(runPipeline);
}

// Local direct runner support if executed directly with tsx
if (process.argv[1] && process.argv[1].endsWith('scheduledPipeline.ts')) {
  handler().catch(() => process.exit(1));
}
