import assert from 'node:assert/strict';
import { runDemoPipeline } from '../demo/demoRunner.js';
import { demoRepository } from '../demo/demoStore.js';
import { handleApiRequest } from '../api/routes.js';

export async function runDemoTests(): Promise<void> {
  console.log('\n--- Running Demo Mode Verification Tests ---');

  demoRepository.clear();
  const records = await runDemoPipeline();

  // Test 1: Exactly 4 sample applications populated
  assert.equal(records.length, 4, 'Demo pipeline must populate exactly 4 sample application records');

  // Test 2: Google Application verification
  const google = records.find((r) => r.company === 'Google');
  assert.ok(google, 'Google application record must exist');
  assert.equal(google.status, 'APPLIED');

  // Test 3: Microsoft Application verification
  const microsoft = records.find((r) => r.company === 'Microsoft');
  assert.ok(microsoft, 'Microsoft application record must exist');
  assert.equal(microsoft.status, 'OA_RECEIVED');
  assert.equal(microsoft.deadline, '2026-09-25');

  // Test 4: Amazon Application verification
  const amazon = records.find((r) => r.company === 'Amazon');
  assert.ok(amazon, 'Amazon application record must exist');
  assert.equal(amazon.status, 'INTERVIEW');
  assert.equal(amazon.eventDate, '2026-09-28');

  // Test 5: Meta Application verification (Follow-up eligible)
  const meta = records.find((r) => r.company === 'Meta');
  assert.ok(meta, 'Meta application record must exist');
  assert.equal(meta.status, 'APPLIED');
  assert.equal(meta.followUpEligible, true, 'Meta application must be follow-up eligible');
  assert.equal(meta.followUpStatus, 'DRAFTED');
  assert.ok(meta.followUpDraft?.subject, 'Follow-up draft subject must be present');
  assert.ok(meta.followUpDraft?.body, 'Follow-up draft body must be present');

  // Test 6: API endpoint integration with Demo Store (GET /applications)
  const getRes = await handleApiRequest('GET', '/applications', null, demoRepository);
  assert.equal(getRes.statusCode, 200);
  const getBody = JSON.parse(getRes.body);
  assert.equal(getBody.applications.length, 4);

  // Test 7: API endpoint integration with Demo Store (PATCH MARK_SENT)
  const patchRes = await handleApiRequest(
    'PATCH',
    `/applications/${meta.applicationId}/follow-up`,
    JSON.stringify({ action: 'MARK_SENT' }),
    demoRepository
  );
  assert.equal(patchRes.statusCode, 200);
  const patchBody = JSON.parse(patchRes.body);
  assert.equal(patchBody.application.followUpStatus, 'SENT');
  assert.equal(patchBody.application.followUpEligible, false);

  console.log('✓ Demo Mode Verification Tests Passed Successfully!');
}
