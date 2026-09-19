import assert from 'node:assert/strict';
import { evaluateFollowUpEligibility } from '../ai/followUpEvaluator.js';
import { generateFollowUpDraft } from '../ai/followUpGenerator.js';
import { ApplicationService } from '../db/applicationService.js';
import type { IApplicationRepository } from '../db/applicationRepository.js';
import type { ApplicationRecord } from '../db/types.js';

class InMemoryApplicationRepository implements IApplicationRepository {
  public store = new Map<string, ApplicationRecord>();

  async findById(applicationId: string): Promise<ApplicationRecord | null> {
    return this.store.get(applicationId) || null;
  }

  async save(record: ApplicationRecord): Promise<void> {
    this.store.set(record.applicationId, record);
  }

  async listAll(): Promise<ApplicationRecord[]> {
    return Array.from(this.store.values());
  }
}

/**
 * Mock Strands Agent for test execution (avoids real Bedrock calls).
 */
function createMockAgent(mockOutput: { subject: string; body: string; reasoning: string }) {
  return {
    invoke: async (_prompt: string) => {
      return {
        structuredOutput: mockOutput,
      };
    },
  } as any;
}

export async function runPhase4Tests(): Promise<void> {
  console.log('\n--- Running Phase 4 Tests ---');

  const refDate = new Date('2026-09-19T12:00:00Z');

  // Test 1: REJECTED status -> Not eligible
  const rejectedRecord: ApplicationRecord = {
    applicationId: 'app_tech_engineer',
    company: 'TechCorp',
    role: 'Engineer',
    status: 'REJECTED',
    lastActivityAt: '2026-08-01T10:00:00Z',
    sourceEmailId: 'e1',
    sourceThreadId: 't1',
    processedEmailIds: ['e1'],
    emailCount: 1,
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
  };
  const resRejected = evaluateFollowUpEligibility(rejectedRecord, refDate);
  assert.equal(resRejected.isEligible, false, 'REJECTED application must be ineligible for follow-up');

  // Test 2: OFFER status -> Not eligible
  const offerRecord: ApplicationRecord = {
    ...rejectedRecord,
    applicationId: 'app_offer_company',
    status: 'OFFER',
  };
  const resOffer = evaluateFollowUpEligibility(offerRecord, refDate);
  assert.equal(resOffer.isEligible, false, 'OFFER application must be ineligible for follow-up');

  // Test 3: Recent APPLIED status (5 days ago, threshold 14) -> Not eligible
  const recentAppliedRecord: ApplicationRecord = {
    ...rejectedRecord,
    applicationId: 'app_amazon_swe',
    company: 'Amazon',
    role: 'SWE Intern',
    status: 'APPLIED',
    lastActivityAt: '2026-09-14T12:00:00Z', // 5 days ago relative to 2026-09-19
  };
  const resRecentApplied = evaluateFollowUpEligibility(recentAppliedRecord, refDate);
  assert.equal(resRecentApplied.isEligible, false, 'Recent application (< 14 days) must be ineligible');

  // Test 4: Stale APPLIED status (20 days ago, threshold 14) -> Eligible
  const staleAppliedRecord: ApplicationRecord = {
    ...rejectedRecord,
    applicationId: 'app_google_swe',
    company: 'Google',
    role: 'SWE Intern',
    status: 'APPLIED',
    lastActivityAt: '2026-08-25T12:00:00Z', // 25 days ago
  };
  const resStaleApplied = evaluateFollowUpEligibility(staleAppliedRecord, refDate);
  assert.equal(resStaleApplied.isEligible, true, 'Application >= 14 days old must be eligible for follow-up');
  assert.equal(resStaleApplied.recommendedType, 'APPLICATION_STATUS_CHECK');

  // Test 5: OA_RECEIVED with pending future deadline -> Not eligible
  const pendingOaRecord: ApplicationRecord = {
    ...rejectedRecord,
    applicationId: 'app_meta_oa',
    company: 'Meta',
    role: 'Product Designer',
    status: 'OA_RECEIVED',
    deadline: '2026-09-25T23:59:59Z', // Future deadline relative to 2026-09-19
    lastActivityAt: '2026-09-10T12:00:00Z',
  };
  const resPendingOa = evaluateFollowUpEligibility(pendingOaRecord, refDate);
  assert.equal(resPendingOa.isEligible, false, 'OA with pending deadline must be ineligible');

  // Test 6: OA_RECEIVED with past deadline & passed waiting threshold -> Eligible
  const expiredOaRecord: ApplicationRecord = {
    ...rejectedRecord,
    applicationId: 'app_meta_oa_expired',
    company: 'Meta',
    role: 'Product Designer',
    status: 'OA_RECEIVED',
    deadline: '2026-09-05T23:59:59Z', // Past deadline
    lastActivityAt: '2026-09-01T12:00:00Z', // 18 days ago
  };
  const resExpiredOa = evaluateFollowUpEligibility(expiredOaRecord, refDate);
  assert.equal(resExpiredOa.isEligible, true, 'OA with expired deadline & passed threshold must be eligible');

  // Test 7: AI Draft Generation with Mocked Strands Agent
  const mockDraftOutput = {
    subject: 'Following Up: Software Engineer Intern Application - Google',
    body: 'Dear Google Recruiting Team,\n\nI hope this email finds you well. I am following up on my application for the Software Engineer Intern position submitted recently. I remain very enthusiastic about the opportunity to contribute to Google.\n\nThank you for your time and consideration.\n\nBest regards,\nCandidate',
    reasoning: 'Polite, enthusiastic status inquiry using verified company and role context without hallucinating recruiter names.',
  };
  const mockAgent = createMockAgent(mockDraftOutput);

  const draftResult = await generateFollowUpDraft(mockAgent, staleAppliedRecord, resStaleApplied.reason);
  assert.equal(draftResult.subject, mockDraftOutput.subject);
  assert.equal(draftResult.body, mockDraftOutput.body);
  assert.ok(draftResult.generatedAt, 'generatedAt timestamp must be populated');

  // Test 8: End-to-End ApplicationService Follow-Up Evaluation & Persistence
  const repo = new InMemoryApplicationRepository();
  await repo.save(staleAppliedRecord);
  await repo.save(recentAppliedRecord);
  await repo.save(rejectedRecord);

  const service = new ApplicationService(repo);
  const updatedRecords = await service.evaluateAllApplicationsForFollowUp(mockAgent, refDate);

  assert.equal(updatedRecords.length, 3);
  
  const googleApp = updatedRecords.find((r) => r.company === 'Google');
  assert.ok(googleApp);
  assert.equal(googleApp.followUpEligible, true);
  assert.equal(googleApp.followUpStatus, 'DRAFTED');
  assert.equal(googleApp.followUpDraft?.subject, mockDraftOutput.subject);
  assert.ok(googleApp.lastFollowUpEvaluatedAt);

  const techCorpApp = updatedRecords.find((r) => r.company === 'TechCorp');
  assert.ok(techCorpApp);
  assert.equal(techCorpApp.followUpEligible, false);
  assert.equal(techCorpApp.followUpStatus, 'NOT_RECOMMENDED');
  assert.equal(techCorpApp.followUpDraft, null);

  console.log('✓ Phase 4 Tests Passed Successfully!');
}
