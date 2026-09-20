import assert from 'node:assert/strict';
import { evaluatePreFilter } from '../filters/careerEmailFilter.js';
import { ApplicationService, generateApplicationId } from '../db/applicationService.js';
import type { IApplicationRepository } from '../db/applicationRepository.js';
import type { ApplicationRecord } from '../db/types.js';
import type { GmailEmail } from '../gmail/types.js';
import type { CareerEmailAnalysis } from '../ai/schemas.js';

class InMemoryApplicationRepository implements IApplicationRepository {
  public store = new Map<string, any>();

  async findById(applicationId: string): Promise<ApplicationRecord | null> {
    if (applicationId.startsWith('META#')) return null;
    return this.store.get(applicationId) || null;
  }

  async save(record: ApplicationRecord): Promise<void> {
    this.store.set(record.applicationId, record);
  }

  async listAll(): Promise<ApplicationRecord[]> {
    return Array.from(this.store.values()).filter((r: any) => !r.applicationId?.startsWith('META#'));
  }

  async getIgnoredEmailIds(): Promise<string[]> {
    const item = this.store.get('META#ignoredEmails');
    return Array.isArray(item?.ignoredEmailIds) ? item.ignoredEmailIds : [];
  }

  async addIgnoredEmailIds(emailIds: string[]): Promise<void> {
    if (emailIds.length === 0) return;
    const existing = await this.getIgnoredEmailIds();
    const combined = [...existing];
    for (const id of emailIds) {
      if (!combined.includes(id)) {
        combined.push(id);
      }
    }
    const capped = combined.length > 1000 ? combined.slice(combined.length - 1000) : combined;
    this.store.set('META#ignoredEmails', {
      applicationId: 'META#ignoredEmails',
      ignoredEmailIds: capped,
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function runPhase3Tests(): Promise<void> {
  console.log('\n--- Running Phase 1–3 Tests ---');

  // Test 1: Pre-filter evaluation
  const nonCareerEmail: GmailEmail = {
    id: 'msg_1',
    threadId: 't1',
    subject: 'Your security code for login',
    snippet: 'Use code 123456 to verify',
    bodyText: 'Use code 123456 to verify your login',
    from: 'no-reply@security.com',
    to: 'user@example.com',
    date: '2026-09-10T10:00:00Z',
    labels: [],
  };

  const preFilterResult = evaluatePreFilter(nonCareerEmail);
  assert.equal(preFilterResult.shouldProcessWithAI, false, 'Pre-filter should skip security code email');

  const careerEmail: GmailEmail = {
    id: 'msg_2',
    threadId: 't2',
    subject: 'Thank you for applying to Microsoft',
    snippet: 'We received your application for Software Engineer Intern',
    bodyText: 'Thank you for applying to Microsoft for Software Engineer Intern',
    from: 'careers@microsoft.com',
    to: 'user@example.com',
    date: '2026-09-10T10:00:00Z',
    labels: [],
  };
  assert.equal(evaluatePreFilter(careerEmail).shouldProcessWithAI, true, 'Pre-filter should accept application email');

  // Test 2: Application ID generation & deduplication
  const appId1 = generateApplicationId('Microsoft', 'Software Engineering Intern');
  const appId2 = generateApplicationId('Microsoft LLC', 'software engineering intern');
  assert.equal(appId1, 'app_microsoft_softwareengineeringintern');
  assert.equal(appId2, 'app_microsoftllc_softwareengineeringintern');

  // Test 3: Application Service status progression & idempotency
  const repo = new InMemoryApplicationRepository();
  const service = new ApplicationService(repo);

  const analysisApplied: CareerEmailAnalysis = {
    isCareerRelated: true,
    isApplicationRelated: true,
    emailType: 'APPLICATION_CONFIRMATION',
    company: 'Stripe',
    role: 'Backend Intern',
    status: 'APPLIED',
    actionRequired: false,
    deadline: null,
    eventDate: null,
    confidence: 0.95,
    reasoning: 'Confirmed application submission.',
  };

  const email1: GmailEmail = {
    id: 'stripe_email_1',
    threadId: 'thread_stripe_1',
    subject: 'Application Received',
    snippet: 'Stripe application received',
    bodyText: 'Thank you for applying',
    from: 'recruiting@stripe.com',
    date: '2026-09-01T10:00:00Z',
    labels: [],
  };

  // Process APPLIED email
  const res1 = await service.processCareerEmail(email1, analysisApplied);
  assert.equal(res1.action, 'CREATED');
  assert.equal(res1.application?.status, 'APPLIED');
  assert.equal(res1.application?.emailCount, 1);

  // Idempotency test: reprocessing email1
  const resDuplicate = await service.processCareerEmail(email1, analysisApplied);
  assert.equal(resDuplicate.action, 'SKIPPED_DUPLICATE');

  // Forward Status Progression: Update status to INTERVIEW
  const analysisInterview: CareerEmailAnalysis = {
    isCareerRelated: true,
    isApplicationRelated: true,
    emailType: 'INTERVIEW_INVITATION',
    company: 'Stripe',
    role: 'Backend Intern',
    status: 'INTERVIEW',
    actionRequired: true,
    deadline: null,
    eventDate: '2026-09-20T15:00:00Z',
    confidence: 0.98,
    reasoning: 'Interview scheduled.',
  };

  const email2: GmailEmail = {
    id: 'stripe_email_2',
    threadId: 'thread_stripe_1',
    subject: 'Interview Invitation',
    snippet: 'Interview with Stripe team',
    bodyText: 'Let us schedule your interview',
    from: 'recruiting@stripe.com',
    date: '2026-09-05T10:00:00Z',
    labels: [],
  };

  const res2 = await service.processCareerEmail(email2, analysisInterview);
  assert.equal(res2.action, 'UPDATED');
  assert.equal(res2.application?.status, 'INTERVIEW');
  assert.equal(res2.application?.emailCount, 2);

  // Disallow Status Downgrade: Trying to process an older APPLIED email
  const email3: GmailEmail = {
    id: 'stripe_email_3',
    threadId: 'thread_stripe_1',
    subject: 'Late confirmation email',
    snippet: 'Late confirmation',
    bodyText: 'Late confirmation',
    from: 'recruiting@stripe.com',
    date: '2026-09-02T10:00:00Z',
    labels: [],
  };

  const res3 = await service.processCareerEmail(email3, analysisApplied);
  assert.equal(res3.action, 'UPDATED');
  assert.equal(res3.application?.status, 'INTERVIEW', 'Status must remain INTERVIEW and not downgrade to APPLIED');

  console.log('✓ Phase 1–3 Tests Passed Successfully!');
}
