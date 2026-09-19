import assert from 'node:assert/strict';
import { handleApiRequest } from '../api/routes.js';
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

export async function runPhase5Tests(): Promise<void> {
  console.log('\n--- Running Phase 5 API & State Persistence Tests ---');

  const repo = new InMemoryApplicationRepository();

  // Seed sample application into repository
  const testRecord: ApplicationRecord = {
    applicationId: 'app_meta_frontend_intern',
    company: 'Meta',
    role: 'Frontend Engineer Intern',
    status: 'APPLIED',
    lastActivityAt: '2026-08-01T10:00:00Z',
    sourceEmailId: 'msg_meta_1',
    sourceThreadId: 'thread_meta_1',
    processedEmailIds: ['msg_meta_1'],
    emailCount: 1,
    followUpEligible: true,
    followUpReason: 'No update received for 30+ days.',
    followUpStatus: 'DRAFTED',
    followUpDraft: {
      subject: 'Following Up: Frontend Engineer Intern Application - Meta',
      body: 'Dear Meta Recruiting Team,\n\nI am writing to follow up on my application...',
      generatedAt: '2026-09-01T10:00:00Z',
    },
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
  };

  await repo.save(testRecord);

  // Test 1: GET /applications
  const getRes = await handleApiRequest('GET', '/applications', null, repo);
  assert.equal(getRes.statusCode, 200, 'GET /applications must return HTTP 200');
  const getBody = JSON.parse(getRes.body);
  assert.ok(Array.isArray(getBody.applications), 'Response must contain applications array');
  const found = getBody.applications.find((a: ApplicationRecord) => a.applicationId === testRecord.applicationId);
  assert.ok(found, 'Seeded test record must be present in GET list');

  // Test 2: GET /applications/:id
  const getOneRes = await handleApiRequest('GET', `/applications/${testRecord.applicationId}`, null, repo);
  assert.equal(getOneRes.statusCode, 200, 'GET /applications/:id must return HTTP 200');
  const getOneBody = JSON.parse(getOneRes.body);
  assert.equal(getOneBody.application?.company, 'Meta');

  // Test 3: PATCH /applications/:id/follow-up with UPDATE_DRAFT
  const updatedSubject = 'Updated Subject: Frontend Role at Meta';
  const updatedBody = 'Updated email draft text by candidate...';
  const patchDraftRes = await handleApiRequest(
    'PATCH',
    `/applications/${testRecord.applicationId}/follow-up`,
    JSON.stringify({
      action: 'UPDATE_DRAFT',
      draft: { subject: updatedSubject, body: updatedBody },
    }),
    repo
  );
  assert.equal(patchDraftRes.statusCode, 200);
  const patchDraftBody = JSON.parse(patchDraftRes.body);
  assert.equal(patchDraftBody.application.followUpDraft.subject, updatedSubject);
  assert.equal(patchDraftBody.application.followUpDraft.body, updatedBody);

  // Test 4: PATCH /applications/:id/follow-up with MARK_SENT
  const patchSentRes = await handleApiRequest(
    'PATCH',
    `/applications/${testRecord.applicationId}/follow-up`,
    JSON.stringify({ action: 'MARK_SENT' }),
    repo
  );
  assert.equal(patchSentRes.statusCode, 200);
  const patchSentBody = JSON.parse(patchSentRes.body);
  assert.equal(patchSentBody.application.followUpStatus, 'SENT', 'Status must be updated to SENT');
  assert.equal(patchSentBody.application.followUpEligible, false, 'Eligible must be set to false when marked sent');

  // Test 5: PATCH /applications/:id/follow-up with DISMISS
  const patchDismissRes = await handleApiRequest(
    'PATCH',
    `/applications/${testRecord.applicationId}/follow-up`,
    JSON.stringify({ action: 'DISMISS' }),
    repo
  );
  assert.equal(patchDismissRes.statusCode, 200);
  const patchDismissBody = JSON.parse(patchDismissRes.body);
  assert.equal(patchDismissBody.application.followUpStatus, 'DISMISSED', 'Status must be updated to DISMISSED');
  assert.equal(patchDismissBody.application.followUpEligible, false);

  console.log('✓ Phase 5 API & Persistence Tests Passed Successfully!');
}

