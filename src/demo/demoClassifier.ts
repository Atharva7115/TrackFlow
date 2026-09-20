import type { CareerEmailAnalysis } from '../ai/schemas.js';
import type { ApplicationRecord, FollowUpDraftRecord } from '../db/types.js';
import type { GmailEmail } from '../gmail/types.js';

/**
 * Deterministic mock classifier for Demo Mode.
 * Returns structured objects matching CareerEmailAnalysisSchema without invoking Amazon Bedrock.
 */
export function getMockEmailAnalysis(email: GmailEmail): CareerEmailAnalysis {
  switch (email.id) {
    case 'demo_email_google':
      return {
        isCareerRelated: true,
        isApplicationRelated: true,
        emailType: 'APPLICATION_CONFIRMATION',
        company: 'Google',
        role: 'Software Engineer Intern',
        status: 'APPLIED',
        actionRequired: false,
        deadline: null,
        eventDate: null,
        confidence: 0.98,
        reasoning: 'Email confirms receipt of application for Software Engineer Intern position at Google.',
      };

    case 'demo_email_microsoft':
      return {
        isCareerRelated: true,
        isApplicationRelated: true,
        emailType: 'OA_INVITATION',
        company: 'Microsoft',
        role: 'Software Engineering Intern',
        status: 'OA_RECEIVED',
        actionRequired: true,
        deadline: '2026-09-25',
        eventDate: null,
        confidence: 0.97,
        reasoning: 'Invitation for online assessment with completion deadline of September 25, 2026.',
      };

    case 'demo_email_amazon':
      return {
        isCareerRelated: true,
        isApplicationRelated: true,
        emailType: 'INTERVIEW_INVITATION',
        company: 'Amazon',
        role: 'SDE Intern',
        status: 'INTERVIEW',
        actionRequired: true,
        deadline: null,
        eventDate: '2026-09-28',
        confidence: 0.99,
        reasoning: 'Technical interview invitation scheduled for September 28, 2026.',
      };

    case 'demo_email_meta':
      return {
        isCareerRelated: true,
        isApplicationRelated: true,
        emailType: 'APPLICATION_CONFIRMATION',
        company: 'Meta',
        role: 'Software Engineer Intern',
        status: 'APPLIED',
        actionRequired: false,
        deadline: null,
        eventDate: null,
        confidence: 0.96,
        reasoning: 'Confirmed receipt of application submitted in mid-August.',
      };

    default:
      return {
        isCareerRelated: true,
        isApplicationRelated: true,
        emailType: 'APPLICATION_CONFIRMATION',
        company: 'Sample Company',
        role: 'Software Engineer',
        status: 'APPLIED',
        actionRequired: false,
        deadline: null,
        eventDate: null,
        confidence: 0.90,
        reasoning: 'Default mock analysis for demo sample email.',
      };
  }
}

/**
 * Deterministic mock draft generator for Demo Mode follow-up drafts.
 * Zero network calls, zero Bedrock API usage.
 */
export function getMockFollowUpDraft(record: ApplicationRecord): FollowUpDraftRecord {
  return {
    subject: `Following Up: ${record.role} Application - ${record.company}`,
    body: `Dear ${record.company} Recruiting Team,\n\nI hope this email finds you well.\n\nI am writing to follow up on my application for the ${record.role} position submitted on August 15, 2026. I remain very enthusiastic about the opportunity to contribute to ${record.company} and would welcome any updates on the application status or next steps.\n\nThank you for your time and consideration.\n\nBest regards,\nCandidate`,
    generatedAt: new Date().toISOString(),
    reasoning: `Polite, professional status check inquiry for ${record.company} after waiting period without hallucinating recruiter names.`,
  };
}
