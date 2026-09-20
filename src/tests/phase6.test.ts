import './testSafety.js';
import assert from 'node:assert/strict';
import { runPipeline } from '../pipeline/runPipeline.js';
import { handler, handleScheduledRun } from '../lambda/scheduledPipeline.js';
import { ApplicationService } from '../db/applicationService.js';
import type { IApplicationRepository } from '../db/applicationRepository.js';
import type { ApplicationRecord } from '../db/types.js';
import type { GmailEmail } from '../gmail/types.js';
import type { CareerEmailAnalysis } from '../ai/schemas.js';

class InMemoryApplicationRepository implements IApplicationRepository {
  public store = new Map<string, any>();

  async findById(applicationId: string): Promise<ApplicationRecord | null> {
    if (applicationId.startsWith('META#')) return null;
    return (this.store.get(applicationId) as ApplicationRecord) || null;
  }

  async save(record: ApplicationRecord): Promise<void> {
    this.store.set(record.applicationId, record);
  }

  async listAll(): Promise<ApplicationRecord[]> {
    return Array.from(this.store.values()).filter(
      (r: any) => !r.applicationId?.startsWith('META#')
    ) as ApplicationRecord[];
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

export async function runPhase6Tests(): Promise<void> {
  console.log('\n--- Running Phase 6 Automation, Memory & Lambda Tests ---');

  // Test 1: Candidates already in processedEmailIds are NOT sent to the classifier
  {
    const repo = new InMemoryApplicationRepository();
    const existingApp: ApplicationRecord = {
      applicationId: 'app_apple_swe',
      company: 'Apple',
      role: 'SWE',
      status: 'APPLIED',
      lastActivityAt: '2026-09-01T10:00:00Z',
      sourceEmailId: 'email_app_1',
      sourceThreadId: 't1',
      processedEmailIds: ['email_app_1'],
      emailCount: 1,
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-01T10:00:00Z',
    };
    await repo.save(existingApp);

    let classifierInvocations = 0;
    const mockClassifierAgentFactory = () => ({
      invoke: async () => {
        classifierInvocations++;
        return { structuredOutput: {} };
      },
    });

    const mockEmails: GmailEmail[] = [
      {
        id: 'email_app_1',
        threadId: 't1',
        subject: 'Thank you for applying to Apple',
        snippet: 'Application received',
        from: 'recruiting@apple.com',
        date: '2026-09-01T10:00:00Z',
        labels: [],
      },
    ];

    const appService = new ApplicationService(repo);
    const summary = await runPipeline({
      appService,
      fetchEmailsFn: async () => mockEmails,
      classifierAgentFactory: mockClassifierAgentFactory,
      followUpAgentFactory: () => ({ invoke: async () => ({ structuredOutput: {} }) }),
      verifyTableFn: async () => true,
    });

    assert.equal(summary.alreadyProcessedSkipped, 1, 'Should detect already processed email');
    assert.equal(classifierInvocations, 0, 'Classifier must NOT be called for already processed email');
    console.log('✓ Test 1 Passed: Candidates in processedEmailIds are not sent to classifier');
  }

  // Test 2: Candidates in the ignored list are NOT sent to the classifier
  {
    const repo = new InMemoryApplicationRepository();
    await repo.addIgnoredEmailIds(['ignored_email_99']);

    let classifierInvocations = 0;
    const mockClassifierAgentFactory = () => ({
      invoke: async () => {
        classifierInvocations++;
        return { structuredOutput: {} };
      },
    });

    const mockEmails: GmailEmail[] = [
      {
        id: 'ignored_email_99',
        threadId: 't99',
        subject: 'Job Recommendation: 5 new software roles',
        snippet: 'Jobs you might like',
        from: 'alerts@jobright.ai',
        date: '2026-09-10T10:00:00Z',
        labels: [],
      },
    ];

    const appService = new ApplicationService(repo);
    const summary = await runPipeline({
      appService,
      fetchEmailsFn: async () => mockEmails,
      classifierAgentFactory: mockClassifierAgentFactory,
      followUpAgentFactory: () => ({ invoke: async () => ({ structuredOutput: {} }) }),
      verifyTableFn: async () => true,
    });

    assert.equal(summary.alreadyProcessedSkipped, 1, 'Should skip candidate in ignored list');
    assert.equal(classifierInvocations, 0, 'Classifier must NOT be called for ignored email');
    console.log('✓ Test 2 Passed: Candidates in ignored list are not sent to classifier');
  }

  // Test 3: A non-application classification adds the email ID to the ignored list
  {
    const repo = new InMemoryApplicationRepository();
    const appService = new ApplicationService(repo);

    const nonAppAnalysis: CareerEmailAnalysis = {
      isCareerRelated: true,
      isApplicationRelated: false,
      emailType: 'JOB_RECOMMENDATION',
      company: null,
      role: null,
      status: 'NOT_APPLICABLE',
      actionRequired: false,
      deadline: null,
      eventDate: null,
      confidence: 0.95,
      reasoning: 'Weekly job newsletter.',
    };

    const email: GmailEmail = {
      id: 'newsletter_123',
      threadId: 't123',
      subject: 'Top Jobs For You',
      snippet: 'Recommendations from LinkedIn',
      from: 'jobs-listings@linkedin.com',
      date: '2026-09-12T10:00:00Z',
      labels: [],
    };

    const res = await appService.processCareerEmail(email, nonAppAnalysis);
    assert.equal(res.action, 'SKIPPED_NOT_APPLICATION');

    const ignoredList = await repo.getIgnoredEmailIds();
    assert.ok(ignoredList.includes('newsletter_123'), 'Email ID must be added to ignored list');
    console.log('✓ Test 3 Passed: Non-application classification adds ID to ignored list');
  }

  // Test 4: A classifier failure does NOT add the ID to the ignored list
  {
    const repo = new InMemoryApplicationRepository();
    const appService = new ApplicationService(repo);

    const mockEmails: GmailEmail[] = [
      {
        id: 'failing_email_404',
        threadId: 'tfail',
        subject: 'Important update on your submission',
        snippet: 'Update regarding your application',
        from: 'recruiting@corp.com',
        date: '2026-09-14T10:00:00Z',
        labels: [],
      },
    ];

    const mockClassifierAgentFactory = () => ({
      invoke: async () => {
        throw new Error('Bedrock rate limit exceeded');
      },
    });

    await runPipeline({
      appService,
      fetchEmailsFn: async () => mockEmails,
      classifierAgentFactory: mockClassifierAgentFactory,
      followUpAgentFactory: () => ({ invoke: async () => ({ structuredOutput: {} }) }),
      verifyTableFn: async () => true,
    });

    const ignoredList = await repo.getIgnoredEmailIds();
    assert.equal(ignoredList.includes('failing_email_404'), false, 'Failed classification must NOT be added to ignored list');
    console.log('✓ Test 4 Passed: Classifier failure does NOT add ID to ignored list (allows retry)');
  }

  // Test 5: Deduplication happens before slicing to AI_MAX_EMAILS
  {
    const repo = new InMemoryApplicationRepository();
    const knownIds: string[] = [];
    for (let i = 1; i <= 10; i++) {
      knownIds.push(`known_email_${i}`);
    }
    await repo.addIgnoredEmailIds(knownIds);

    const emailList: GmailEmail[] = [];
    // 10 known emails
    for (let i = 1; i <= 10; i++) {
      emailList.push({
        id: `known_email_${i}`,
        threadId: `t_${i}`,
        subject: `Known Email ${i}`,
        snippet: `Snippet ${i}`,
        from: 'test@example.com',
        date: '2026-09-01T10:00:00Z',
        labels: [],
      });
    }
    // 3 new emails
    for (let i = 1; i <= 3; i++) {
      emailList.push({
        id: `fresh_email_${i}`,
        threadId: `tfresh_${i}`,
        subject: `New Application Confirmation ${i}`,
        snippet: `Application received ${i}`,
        from: `careers@company${i}.com`,
        date: '2026-09-18T10:00:00Z',
        labels: [],
      });
    }

    const classifiedEmailIds: string[] = [];
    const mockClassifierAgentFactory = () => ({
      invoke: async (prompt: string) => {
        for (let i = 1; i <= 3; i++) {
          if (prompt.includes(`fresh_email_${i}`) || prompt.includes(`New Application Confirmation ${i}`)) {
            classifiedEmailIds.push(`fresh_email_${i}`);
          }
        }
        return {
          structuredOutput: {
            isCareerRelated: true,
            isApplicationRelated: true,
            emailType: 'APPLICATION_CONFIRMATION',
            company: 'Company Fresh',
            role: 'Intern',
            status: 'APPLIED',
            actionRequired: false,
            deadline: null,
            eventDate: null,
            confidence: 0.9,
            reasoning: 'Applied.',
          },
        };
      },
    });

    const appService = new ApplicationService(repo);
    const summary = await runPipeline({
      appService,
      fetchEmailsFn: async () => emailList,
      classifierAgentFactory: mockClassifierAgentFactory,
      followUpAgentFactory: () => ({ invoke: async () => ({ structuredOutput: {} }) }),
      verifyTableFn: async () => true,
    });

    assert.equal(summary.alreadyProcessedSkipped, 10, 'Must skip all 10 known emails before slicing');
    assert.equal(summary.aiAnalyzed, 3, 'Must analyze all 3 fresh emails (within max batch limit of 5)');
    console.log('✓ Test 5 Passed: Deduplication happens before slicing to AI_MAX_EMAILS');
  }

  // Test 6: The META#ignoredEmails item never appears in listAll() results or follow-up evaluation
  {
    const repo = new InMemoryApplicationRepository();
    await repo.addIgnoredEmailIds(['ignored_1', 'ignored_2']);

    const validApp: ApplicationRecord = {
      applicationId: 'app_netflix_swe',
      company: 'Netflix',
      role: 'SWE',
      status: 'APPLIED',
      lastActivityAt: '2026-08-01T10:00:00Z',
      sourceEmailId: 'e_net',
      sourceThreadId: 't_net',
      processedEmailIds: ['e_net'],
      emailCount: 1,
      createdAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-08-01T10:00:00Z',
    };
    await repo.save(validApp);

    const allApps = await repo.listAll();
    assert.equal(allApps.length, 1);
    assert.equal(allApps[0].applicationId, 'app_netflix_swe');
    assert.ok(!allApps.some((a) => a.applicationId.startsWith('META#')), 'META# item must never appear in listAll()');

    const singleApp = await repo.findById('META#ignoredEmails');
    assert.equal(singleApp, null, 'findById must return null for META# keys');

    const appService = new ApplicationService(repo);
    const followUps = await appService.evaluateAllApplicationsForFollowUp();
    assert.equal(followUps.length, 1);
    assert.equal(followUps[0].company, 'Netflix');
    console.log('✓ Test 6 Passed: META# items never appear in listAll() or follow-up evaluation');
  }

  // Test 7: Ignored list is capped at 1000, oldest dropped
  {
    const repo = new InMemoryApplicationRepository();
    const batch1: string[] = [];
    for (let i = 1; i <= 900; i++) {
      batch1.push(`old_email_${i}`);
    }
    await repo.addIgnoredEmailIds(batch1);

    const batch2: string[] = [];
    for (let i = 1; i <= 200; i++) {
      batch2.push(`new_email_${i}`);
    }
    await repo.addIgnoredEmailIds(batch2);

    const list = await repo.getIgnoredEmailIds();
    assert.equal(list.length, 1000, 'Ignored list must be capped at 1000');
    assert.equal(list[0], 'old_email_101', 'Oldest 100 items should have been dropped');
    assert.equal(list[999], 'new_email_200', 'Newest item must be at the end');
    console.log('✓ Test 7 Passed: Ignored list is capped at 1000, oldest dropped');
  }

  // Test 8: runPipeline() returns the structured summary and never calls process.exit
  {
    const repo = new InMemoryApplicationRepository();
    const appService = new ApplicationService(repo);

    const summary = await runPipeline({
      appService,
      fetchEmailsFn: async () => [],
      verifyTableFn: async () => true,
    });

    assert.equal(summary.status, 'SUCCESS');
    assert.equal(typeof summary.timestamp, 'string');
    assert.equal(summary.emailsFetched, 0);
    console.log('✓ Test 8 Passed: runPipeline returns structured summary without process.exit');
  }

  // Test 9: handleScheduledRun re-throws on pipeline failure and returns summary on success
  {
    let rethrown = false;
    try {
      await handleScheduledRun(async () => {
        throw new Error('Fatal DynamoDB Connection Error');
      });
    } catch (err) {
      rethrown = true;
      assert.equal((err as Error).message, 'Fatal DynamoDB Connection Error');
    }
    assert.equal(rethrown, true, 'Handler must re-throw on failure');

    const successRes = await handleScheduledRun(async () => ({
      status: 'SUCCESS',
      timestamp: '2026-09-20T10:00:00Z',
      emailsFetched: 5,
      preFilterSkipped: 1,
      alreadyProcessedSkipped: 2,
      aiAnalyzed: 2,
      careerEmailCount: 2,
      applicationRelatedCount: 2,
      jobRecCount: 0,
      newAppsCount: 1,
      updatedAppsCount: 1,
      skippedDbCount: 0,
      followUpsEvaluated: 3,
      followUpsEligible: 1,
    }));

    assert.equal(successRes.statusCode, 200);
    assert.equal(successRes.body.status, 'SUCCESS');
    assert.equal(successRes.body.metrics?.aiAnalyzed, 2);
    console.log('✓ Test 9 Passed: Handler re-throws on failure and returns summary on success');
  }

  // Test 9b: Production handler function signature safety check
  {
    // The AWS Lambda Node.js runtime always passes (event, context, callback).
    // The production handler must declare exactly two parameters (_event, _context)
    // so the runtime's third callback argument can never be used as a custom runner.
    assert.equal(
      handler.length,
      2,
      'Production handler must declare exactly two parameters (_event, _context)'
    );
    console.log('✓ Test 9b Passed: Production handler declares exactly 2 parameters (immune to runtime callback injection)');
  }

  // Test 10: An existing draft is not regenerated on a second run; no Bedrock draft call is made
  {
    const repo = new InMemoryApplicationRepository();
    const draftedApp: ApplicationRecord = {
      applicationId: 'app_uber_swe',
      company: 'Uber',
      role: 'SWE Intern',
      status: 'APPLIED',
      lastActivityAt: '2026-08-01T10:00:00Z', // Old -> Eligible
      sourceEmailId: 'e_uber_1',
      sourceThreadId: 't_uber_1',
      processedEmailIds: ['e_uber_1'],
      emailCount: 1,
      followUpEligible: true,
      followUpReason: 'Waiting threshold passed',
      followUpStatus: 'DRAFTED',
      followUpDraft: {
        subject: 'Following Up: SWE Intern Application - Uber',
        body: 'Existing saved draft body text...',
        generatedAt: '2026-09-01T10:00:00Z',
      },
      createdAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-08-01T10:00:00Z',
    };
    await repo.save(draftedApp);

    let draftBedrockCalls = 0;
    const mockFollowUpAgent = {
      invoke: async () => {
        draftBedrockCalls++;
        return {
          structuredOutput: {
            subject: 'New Subject',
            body: 'New Body',
            reasoning: 'New Reasoning',
          },
        };
      },
    };

    const appService = new ApplicationService(repo);
    const updatedRecords = await appService.evaluateAllApplicationsForFollowUp(mockFollowUpAgent);

    assert.equal(draftBedrockCalls, 0, 'Must NOT invoke Bedrock for application with existing draft');
    assert.equal(updatedRecords[0].followUpDraft?.subject, 'Following Up: SWE Intern Application - Uber');
    console.log('✓ Test 10 Passed: Existing draft is not regenerated on second run (0 Bedrock calls)');
  }

  // Test 11: Two consecutive runs with no new emails result in zero Bedrock calls total
  {
    const repo = new InMemoryApplicationRepository();
    const appService = new ApplicationService(repo);

    const staticEmails: GmailEmail[] = [
      {
        id: 'msg_app_google',
        threadId: 't_g',
        subject: 'Thanks for applying to Google',
        snippet: 'Application received',
        from: 'recruiting@google.com',
        date: '2026-09-10T10:00:00Z',
        labels: [],
      },
      {
        id: 'msg_rec_linkedin',
        threadId: 't_l',
        subject: 'Job Recommendation: Senior Developer',
        snippet: 'Job alert',
        from: 'jobs@linkedin.com',
        date: '2026-09-10T11:00:00Z',
        labels: [],
      },
    ];

    let classifierCalls = 0;
    const mockClassifierFactory = () => ({
      invoke: async (prompt: string) => {
        classifierCalls++;
        if (prompt.includes('Google')) {
          return {
            structuredOutput: {
              isCareerRelated: true,
              isApplicationRelated: true,
              emailType: 'APPLICATION_CONFIRMATION',
              company: 'Google',
              role: 'SWE Intern',
              status: 'APPLIED',
              actionRequired: false,
              deadline: null,
              eventDate: null,
              confidence: 0.98,
              reasoning: 'Applied to Google.',
            },
          };
        }
        return {
          structuredOutput: {
            isCareerRelated: true,
            isApplicationRelated: false,
            emailType: 'JOB_RECOMMENDATION',
            company: null,
            role: null,
            status: 'NOT_APPLICABLE',
            actionRequired: false,
            deadline: null,
            eventDate: null,
            confidence: 0.95,
            reasoning: 'Job rec.',
          },
        };
      },
    });

    let draftCalls = 0;
    const mockDraftFactory = () => ({
      invoke: async () => {
        draftCalls++;
        return {
          structuredOutput: {
            subject: 'Draft Subject',
            body: 'Draft Body',
            reasoning: 'Draft Reasoning',
          },
        };
      },
    });

    // Run 1: Initial ingestion
    const run1 = await runPipeline({
      appService,
      fetchEmailsFn: async () => staticEmails,
      classifierAgentFactory: mockClassifierFactory,
      followUpAgentFactory: mockDraftFactory,
      verifyTableFn: async () => true,
    });

    assert.equal(run1.aiAnalyzed, 2, 'Run 1 should analyze 2 fresh emails');
    assert.equal(classifierCalls, 2);

    // Run 2: Scheduled run 3 hours later (exact same emails in inbox)
    const run2 = await runPipeline({
      appService,
      fetchEmailsFn: async () => staticEmails,
      classifierAgentFactory: mockClassifierFactory,
      followUpAgentFactory: mockDraftFactory,
      verifyTableFn: async () => true,
    });

    assert.equal(run2.alreadyProcessedSkipped, 2, 'Run 2 should skip both emails via memory');
    assert.equal(run2.aiAnalyzed, 0, 'Run 2 should send 0 emails to Bedrock');
    assert.equal(classifierCalls, 2, 'Total classifier calls must remain 2 (0 in Run 2)');
    assert.equal(draftCalls, 0, 'Total draft calls must remain 0');
    console.log('✓ Test 11 Passed: Consecutive runs with no new emails result in 0 Bedrock calls');
  }

  // Test 12 (a): An existing draft survives when the application becomes ineligible (e.g. status changes to REJECTED)
  {
    const repo = new InMemoryApplicationRepository();
    const existingDraft = {
      subject: 'Following Up: Frontend Intern - Meta',
      body: 'Dear Meta Team, following up on my application...',
      generatedAt: '2026-08-15T10:00:00Z',
    };

    const rejectedApp: ApplicationRecord = {
      applicationId: 'app_meta_frontend_intern',
      company: 'Meta',
      role: 'Frontend Intern',
      status: 'REJECTED',
      lastActivityAt: '2026-08-01T10:00:00Z',
      sourceEmailId: 'e_rej_1',
      sourceThreadId: 't_rej_1',
      processedEmailIds: ['e_rej_1'],
      emailCount: 1,
      followUpEligible: false,
      followUpStatus: 'NOT_RECOMMENDED',
      followUpDraft: existingDraft,
      createdAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-08-01T10:00:00Z',
    };
    await repo.save(rejectedApp);

    let draftCalls = 0;
    const mockFollowUpAgent = {
      invoke: async () => {
        draftCalls++;
        return { structuredOutput: { subject: 'new', body: 'new', reasoning: 'new' } };
      },
    };

    const appService = new ApplicationService(repo);
    const updated = await appService.evaluateFollowUpForApplication(rejectedApp, mockFollowUpAgent);

    assert.equal(draftCalls, 0, 'Zero Bedrock draft calls must be made for ineligible application');
    assert.equal(updated.followUpEligible, false);
    assert.equal(updated.followUpStatus, 'NOT_RECOMMENDED');
    assert.deepEqual(updated.followUpDraft, existingDraft, 'Existing draft must survive when application becomes ineligible');
    console.log('✓ Test 12 Passed: Existing draft survives when application becomes ineligible (0 Bedrock calls)');
  }

  // Test 13 (b): Human-set statuses (SENT, DISMISSED) are left unchanged, while machine-owned statuses (like NONE) are re-evaluated
  {
    const repo = new InMemoryApplicationRepository();
    const humanSetStatuses = ['SENT', 'DISMISSED'] as const;

    for (let i = 0; i < humanSetStatuses.length; i++) {
      const statusVal = humanSetStatuses[i];
      const testApp: ApplicationRecord = {
        applicationId: `app_human_${statusVal.toLowerCase()}`,
        company: `Company ${statusVal}`,
        role: 'SWE Intern',
        status: 'APPLIED',
        lastActivityAt: '2026-07-01T10:00:00Z', // Very old -> would normally be eligible if machine-owned
        sourceEmailId: `e_human_${i}`,
        sourceThreadId: `t_human_${i}`,
        processedEmailIds: [`e_human_${i}`],
        emailCount: 1,
        followUpEligible: false,
        followUpStatus: statusVal,
        followUpDraft: {
          subject: `Draft for ${statusVal}`,
          body: `Body for ${statusVal}`,
          generatedAt: '2026-07-01T10:00:00Z',
        },
        createdAt: '2026-07-01T10:00:00Z',
        updatedAt: '2026-07-01T10:00:00Z',
      };
      await repo.save(testApp);
    }

    // Also add an app with machine-owned status 'NONE'
    const noneApp: ApplicationRecord = {
      applicationId: 'app_machine_none',
      company: 'Company NONE',
      role: 'SWE Intern',
      status: 'APPLIED',
      lastActivityAt: '2026-07-01T10:00:00Z', // Old -> eligible
      sourceEmailId: 'e_none_1',
      sourceThreadId: 't_none_1',
      processedEmailIds: ['e_none_1'],
      emailCount: 1,
      followUpEligible: false,
      followUpStatus: 'NONE',
      createdAt: '2026-07-01T10:00:00Z',
      updatedAt: '2026-07-01T10:00:00Z',
    };
    await repo.save(noneApp);

    let draftCalls = 0;
    const mockFollowUpAgent = {
      invoke: async () => {
        draftCalls++;
        return { structuredOutput: { subject: 'Draft for NONE', body: 'Body for NONE', reasoning: 'Reason for NONE' } };
      },
    };

    const appService = new ApplicationService(repo);
    const results = await appService.evaluateAllApplicationsForFollowUp(mockFollowUpAgent);

    assert.equal(draftCalls, 1, 'Zero Bedrock calls for SENT/DISMISSED, exactly 1 call for machine-owned NONE');
    assert.equal(results.length, 3);

    const sentApp = results.find(a => a.company === 'Company SENT');
    assert.ok(sentApp);
    assert.equal(sentApp.followUpStatus, 'SENT', 'SENT status must remain untouched');
    assert.equal(sentApp.followUpEligible, false, 'followUpEligible for SENT must remain false');

    const dismissedApp = results.find(a => a.company === 'Company DISMISSED');
    assert.ok(dismissedApp);
    assert.equal(dismissedApp.followUpStatus, 'DISMISSED', 'DISMISSED status must remain untouched');
    assert.equal(dismissedApp.followUpEligible, false, 'followUpEligible for DISMISSED must remain false');

    const evaluatedNoneApp = results.find(a => a.company === 'Company NONE');
    assert.ok(evaluatedNoneApp);
    assert.equal(evaluatedNoneApp.followUpStatus, 'DRAFTED', 'NONE status must be re-evaluated and become DRAFTED when eligible');
    assert.equal(evaluatedNoneApp.followUpEligible, true, 'followUpEligible must become true');
    assert.equal(evaluatedNoneApp.followUpDraft?.subject, 'Draft for NONE');

    console.log('✓ Test 13 Passed: Human-set statuses (SENT, DISMISSED) are untouched, and machine status (NONE) is re-evaluated');
  }

  // Test 14 (c): A DRAFTED draft with edited text keeps the edited text on a re-run
  {
    const repo = new InMemoryApplicationRepository();
    const candidateEditedDraft = {
      subject: 'Custom Candidate Subject Line - Edited by User',
      body: 'Dear Team, I have customized this email body personally.',
      generatedAt: '2026-09-01T10:00:00Z',
      reasoning: 'Candidate manual edit',
    };

    const editedApp: ApplicationRecord = {
      applicationId: 'app_palantir_swe',
      company: 'Palantir',
      role: 'SWE Intern',
      status: 'APPLIED',
      lastActivityAt: '2026-08-01T10:00:00Z', // Old -> Eligible
      sourceEmailId: 'e_pal_1',
      sourceThreadId: 't_pal_1',
      processedEmailIds: ['e_pal_1'],
      emailCount: 1,
      followUpEligible: true,
      followUpReason: 'Waiting threshold passed',
      followUpStatus: 'DRAFTED',
      followUpDraft: candidateEditedDraft,
      createdAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-08-01T10:00:00Z',
    };
    await repo.save(editedApp);

    let draftCalls = 0;
    const mockFollowUpAgent = {
      invoke: async () => {
        draftCalls++;
        return {
          structuredOutput: {
            subject: 'Overwritten Bedrock Subject',
            body: 'Overwritten Bedrock Body',
            reasoning: 'Overwritten',
          },
        };
      },
    };

    const appService = new ApplicationService(repo);
    const updated = await appService.evaluateFollowUpForApplication(editedApp, mockFollowUpAgent);

    assert.equal(draftCalls, 0, 'Must NOT invoke Bedrock for application with existing edited draft');
    assert.deepEqual(updated.followUpDraft, candidateEditedDraft, 'Edited draft text must be preserved exactly on re-run');
    assert.equal(updated.followUpDraft?.subject, 'Custom Candidate Subject Line - Edited by User');
    assert.equal(updated.followUpDraft?.body, 'Dear Team, I have customized this email body personally.');
    console.log('✓ Test 14 Passed: A DRAFTED draft with edited text keeps the edited text on re-run');
  }

  // Test 15: Real creation path (processCareerEmail) -> follow-up evaluation -> DRAFTED
  {
    const repo = new InMemoryApplicationRepository();
    const appService = new ApplicationService(repo);

    const email: GmailEmail = {
      id: 'msg_real_creation_stripe_1',
      threadId: 'th_real_creation_stripe_1',
      snippet: 'Thanks for applying to Stripe Software Engineer Intern position.',
      subject: 'Thank you for applying to Stripe',
      from: 'recruiting@stripe.com',
      date: '2026-08-01T10:00:00Z',
      labels: ['INBOX'],
    };

    const analysis: CareerEmailAnalysis = {
      isCareerRelated: true,
      isApplicationRelated: true,
      emailType: 'APPLICATION_CONFIRMATION',
      company: 'Stripe',
      role: 'Software Engineer Intern',
      status: 'APPLIED',
      deadline: null,
      eventDate: null,
      actionRequired: false,
      confidence: 0.98,
      reasoning: 'Applied to SWE intern role',
    };

    // Step 1: Create application via the real production ApplicationService.processCareerEmail path
    const processResult = await appService.processCareerEmail(email, analysis);
    assert.equal(processResult.action, 'CREATED');
    assert.ok(processResult.application);

    // Verify initial creation state
    const initialApp = await repo.findById(processResult.application.applicationId);
    assert.ok(initialApp);

    let draftCalls = 0;
    const mockFollowUpAgent = {
      invoke: async () => {
        draftCalls++;
        return {
          structuredOutput: {
            subject: 'Following Up on Stripe Application - Software Engineer Intern',
            body: 'Dear Stripe Recruiting Team,\n\nI am following up on my application for Software Engineer Intern.',
            reasoning: 'Standard 7+ day follow-up recommendation',
          },
        };
      },
    };

    // Step 2: Call evaluateAllApplicationsForFollowUp with reference date 14 days later (eligible)
    const futureReferenceDate = new Date('2026-08-15T10:00:00Z');
    const evaluatedResults = await appService.evaluateAllApplicationsForFollowUp(mockFollowUpAgent, futureReferenceDate);

    assert.equal(evaluatedResults.length, 1);
    const updatedApp = evaluatedResults[0];

    assert.equal(draftCalls, 1, 'Mock Bedrock agent must be invoked to generate follow-up draft');
    assert.equal(updatedApp.followUpEligible, true, 'Application must be marked followUpEligible');
    assert.equal(updatedApp.followUpStatus, 'DRAFTED', 'Application followUpStatus must become DRAFTED');
    assert.ok(updatedApp.followUpDraft, 'followUpDraft must be populated');
    assert.equal(updatedApp.followUpDraft?.subject, 'Following Up on Stripe Application - Software Engineer Intern');

    // Also verify persistence in repository
    const storedApp = await repo.findById(processResult.application.applicationId);
    assert.ok(storedApp);
    assert.equal(storedApp.followUpStatus, 'DRAFTED');
    assert.equal(storedApp.followUpEligible, true);
    assert.equal(storedApp.followUpDraft?.subject, 'Following Up on Stripe Application - Software Engineer Intern');

    console.log('✓ Test 15 Passed: Real creation path (processCareerEmail) correctly evaluates to DRAFTED after eligibility threshold');
  }

  console.log('\n========================================');
  console.log('ALL PHASE 6 TESTS PASSED SUCCESSFULLY!');
  console.log('========================================\n');
}

// Direct execution support if run standalone via tsx
if (process.argv[1] && process.argv[1].endsWith('phase6.test.ts')) {
  runPhase6Tests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
