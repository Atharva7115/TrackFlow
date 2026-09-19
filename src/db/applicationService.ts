import type { GmailEmail } from '../gmail/types.js';
import type { CareerEmailAnalysis, ApplicationStatus } from '../ai/schemas.js';
import type { ApplicationRecord, ApplicationProcessResult } from './types.js';
import { IApplicationRepository, applicationRepository } from './applicationRepository.js';

/**
 * Status hierarchy ranking to enforce safe forward-only status progression.
 * Lower ranking events (e.g. delayed confirmation email) will NEVER downgrade
 * higher active stages (e.g. INTERVIEW, OFFER, REJECTED).
 */
const STATUS_PRECEDENCE: Record<ApplicationStatus, number> = {
  UNKNOWN: 0,
  NOT_APPLICABLE: 0,
  APPLIED: 1,
  OA_RECEIVED: 2,
  OA_COMPLETED: 3,
  INTERVIEW: 4,
  OFFER: 5,
  REJECTED: 6,
};

/**
 * Normalizes strings by removing non-alphanumeric characters and converting to lowercase.
 */
function normalizeIdentifier(str: string | null | undefined, fallback: string): string {
  if (!str) return fallback;
  const cleaned = str.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * Deterministically generates an applicationId for Phase 3 based on company and normalized role.
 * 
 * NOTE (MVP Deduplication Strategy):
 * Matches emails for the same company and role into a unified application record.
 * Limitation: Slight company naming differences (e.g. "Google LLC" vs "Google") or missing role
 * descriptions may map to distinct records or fallback to thread IDs.
 */
export function generateApplicationId(
  company: string | null | undefined,
  role: string | null | undefined,
  threadId?: string
): string {
  const normCompany = normalizeIdentifier(company, '');
  const normRole = normalizeIdentifier(role, 'general');

  if (normCompany) {
    return `app_${normCompany}_${normRole}`;
  }

  if (threadId) {
    return `app_thread_${threadId}`;
  }

  return `app_unspecified_${Date.now()}`;
}

export class ApplicationService {
  constructor(private readonly repo: IApplicationRepository = applicationRepository) {}

  /**
   * Processes a single analyzed email into an application record in DynamoDB.
   */
  async processCareerEmail(
    email: GmailEmail,
    analysis: CareerEmailAnalysis
  ): Promise<ApplicationProcessResult> {
    // 1. Filter out non-application emails and job recommendations
    if (!analysis.isApplicationRelated || analysis.status === 'NOT_APPLICABLE' || analysis.emailType === 'JOB_RECOMMENDATION') {
      return {
        action: 'SKIPPED_NOT_APPLICATION',
        reason: `Email is not an active application lifecycle event (type: ${analysis.emailType}, status: ${analysis.status}).`,
      };
    }

    const companyName = analysis.company?.trim() || 'Unknown Company';
    const roleName = analysis.role?.trim() || 'General Application';
    const applicationId = generateApplicationId(analysis.company, analysis.role, email.threadId);

    // 2. Fetch existing application record
    const existing = await this.repo.findById(applicationId);

    const nowIso = new Date().toISOString();
    const emailTimestamp = email.date ? new Date(email.date).toISOString() : nowIso;

    // 3. Idempotency check: Ignore duplicate processing of the exact same email ID
    if (existing) {
      if (existing.processedEmailIds && existing.processedEmailIds.includes(email.id)) {
        return {
          action: 'SKIPPED_DUPLICATE',
          application: existing,
          reason: `Email ID '${email.id}' was already processed into application '${applicationId}'.`,
        };
      }

      // 4. Safe Status Progression: Disallow downgrading
      const currentRank = STATUS_PRECEDENCE[existing.status] ?? 0;
      const incomingRank = STATUS_PRECEDENCE[analysis.status] ?? 0;

      let nextStatus = existing.status;
      if (incomingRank > currentRank) {
        nextStatus = analysis.status;
      }

      const updatedRecord: ApplicationRecord = {
        ...existing,
        status: nextStatus,
        deadline: analysis.deadline || existing.deadline || null,
        eventDate: analysis.eventDate || existing.eventDate || null,
        lastActivityAt: emailTimestamp,
        sourceEmailId: email.id,
        sourceThreadId: email.threadId || existing.sourceThreadId,
        processedEmailIds: [...(existing.processedEmailIds || []), email.id],
        emailCount: (existing.emailCount || 1) + 1,
        notes: analysis.reasoning || existing.notes,
        updatedAt: nowIso,
      };

      if (analysis.emailType === 'APPLICATION_CONFIRMATION' && !existing.applicationDate) {
        updatedRecord.applicationDate = emailTimestamp;
      }

      await this.repo.save(updatedRecord);
      return {
        action: 'UPDATED',
        application: updatedRecord,
      };
    }

    // 5. Create new ApplicationRecord
    const initialStatus: ApplicationStatus =
      analysis.status === 'UNKNOWN'
        ? 'APPLIED'
        : analysis.status;

    const newRecord: ApplicationRecord = {
      applicationId,
      company: companyName,
      role: roleName,
      status: initialStatus,
      applicationDate: analysis.emailType === 'APPLICATION_CONFIRMATION' ? emailTimestamp : null,
      deadline: analysis.deadline || null,
      eventDate: analysis.eventDate || null,
      lastActivityAt: emailTimestamp,
      sourceEmailId: email.id,
      sourceThreadId: email.threadId,
      processedEmailIds: [email.id],
      emailCount: 1,
      notes: analysis.reasoning,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await this.repo.save(newRecord);
    return {
      action: 'CREATED',
      application: newRecord,
    };
  }

  /**
   * Phase 4: Evaluates follow-up eligibility for a specific application record and generates AI draft if eligible.
   */
  async evaluateFollowUpForApplication(
    application: ApplicationRecord,
    followUpAgent?: any,
    referenceDate: Date = new Date()
  ): Promise<ApplicationRecord> {
    const { evaluateFollowUpEligibility } = await import('../ai/followUpEvaluator.js');
    const decision = evaluateFollowUpEligibility(application, referenceDate);

    const nowIso = new Date().toISOString();
    let draftRecord = application.followUpDraft || null;

    if (decision.isEligible && followUpAgent) {
      try {
        const { generateFollowUpDraft } = await import('../ai/followUpGenerator.js');
        draftRecord = await generateFollowUpDraft(followUpAgent, application, decision.reason);
      } catch (err: unknown) {
        console.warn(`[CareerPilot FollowUp] Could not generate draft for ${application.company}:`, err instanceof Error ? err.message : err);
      }
    }

    const updatedRecord: ApplicationRecord = {
      ...application,
      followUpEligible: decision.isEligible,
      followUpReason: decision.reason,
      followUpStatus: decision.isEligible ? (draftRecord ? 'DRAFTED' : 'RECOMMENDED') : 'NOT_RECOMMENDED',
      followUpDraft: draftRecord,
      lastFollowUpEvaluatedAt: nowIso,
      updatedAt: nowIso,
    };

    await this.repo.save(updatedRecord);
    return updatedRecord;
  }

  /**
   * Phase 4: Evaluates follow-up eligibility for all applications in DynamoDB.
   */
  async evaluateAllApplicationsForFollowUp(
    followUpAgent?: any,
    referenceDate: Date = new Date()
  ): Promise<ApplicationRecord[]> {
    const allApps = await this.repo.listAll();
    const results: ApplicationRecord[] = [];

    for (const app of allApps) {
      const updated = await this.evaluateFollowUpForApplication(app, followUpAgent, referenceDate);
      results.push(updated);
    }

    return results;
  }
}

export const applicationService = new ApplicationService();
