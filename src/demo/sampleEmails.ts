import type { GmailEmail } from '../gmail/types.js';

/**
 * Representative sample career emails for Demo Mode.
 * No Gmail API or OAuth access required.
 */
export const DEMO_SAMPLE_EMAILS: GmailEmail[] = [
  {
    id: 'demo_email_google',
    threadId: 'thread_google_1',
    subject: 'Application Received — Software Engineer Intern',
    from: 'careers@google.com',
    to: 'candidate@example.com',
    date: '2026-09-10T10:00:00Z',
    snippet: 'Thank you for applying for the Software Engineer Intern position at Google.',
    bodyText: `Thank you for applying for the Software Engineer Intern position at Google.
We have received your application and our recruiting team will review it.`,
    labels: ['INBOX'],
  },
  {
    id: 'demo_email_microsoft',
    threadId: 'thread_microsoft_1',
    subject: 'Online Assessment Invitation — Software Engineering Intern',
    from: 'hiring@microsoft.com',
    to: 'candidate@example.com',
    date: '2026-09-12T14:30:00Z',
    snippet: 'You are invited to complete an online assessment for Microsoft.',
    bodyText: `Thank you for your application for the Software Engineering Intern position at Microsoft.
You are invited to complete an online assessment.
Please complete the assessment by September 25, 2026.`,
    labels: ['INBOX'],
  },
  {
    id: 'demo_email_amazon',
    threadId: 'thread_amazon_1',
    subject: 'Interview Invitation — SDE Intern',
    from: 'recruiting@amazon.com',
    to: 'candidate@example.com',
    date: '2026-09-15T09:00:00Z',
    snippet: 'We would like to invite you to an interview for the SDE Intern position at Amazon.',
    bodyText: `We would like to invite you to an interview for the SDE Intern position at Amazon.
Your technical interview is scheduled for September 28, 2026.`,
    labels: ['INBOX'],
  },
  {
    id: 'demo_email_meta',
    threadId: 'thread_meta_1',
    subject: 'Application Confirmation — Software Engineer Intern',
    from: 'careers@meta.com',
    to: 'candidate@example.com',
    date: '2026-08-15T10:00:00Z', // 35+ days ago to trigger follow-up eligibility rules
    snippet: 'Thank you for applying for the Software Engineer Intern position at Meta.',
    bodyText: `Thank you for applying for the Software Engineer Intern position at Meta.
Your application is currently under review by our team.`,
    labels: ['INBOX'],
  },
];
