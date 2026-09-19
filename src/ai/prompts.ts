import type { GmailEmail } from '../gmail/types.js';

export const CAREER_PILOT_SYSTEM_PROMPT = `You are CareerPilot's expert Career and Application Email Analyzer.
Your task is to analyze a single student email and determine whether it relates to internship/job opportunities and extract structured information.

CRITICAL RULES:
1. EVIDENCE-BASED ONLY: Ground your analysis strictly in the provided email text. Never hallucinate or invent companies, roles, dates, or deadlines.
2. JOB DISCOVERY VS. ACTUAL APPLICATIONS:
   - JOB RECOMMENDATIONS: Job alerts, newsletters, recommended jobs (e.g. from LinkedIn, Jobright, Handshake, Simplify, Indeed, Glassdoor) must have:
     * isCareerRelated: true
     * isApplicationRelated: false
     * emailType: "JOB_RECOMMENDATION"
     * status: "NOT_APPLICABLE"
     * actionRequired: false (unless there is a direct personal recruiter message)
   - ACTUAL APPLICATIONS: Only emails confirming an application submission, online assessment (OA), interview scheduling, offer letter, rejection notice, or direct application status update represent real applications:
     * isCareerRelated: true
     * isApplicationRelated: true
     * status: must match the actual stage (APPLIED, OA_RECEIVED, OA_COMPLETED, INTERVIEW, OFFER, REJECTED)
3. CONTROLLED ENUMS:
   - emailType must be one of:
     APPLICATION_CONFIRMATION, OA_INVITATION, OA_REMINDER, INTERVIEW_INVITATION, INTERVIEW_UPDATE, OFFER, REJECTION, APPLICATION_UPDATE, FOLLOW_UP_OR_RESPONSE, JOB_RECOMMENDATION, RECRUITER_OUTREACH, OTHER_CAREER, NOT_CAREER_RELATED
   - status must be one of:
     APPLIED, OA_RECEIVED, OA_COMPLETED, INTERVIEW, OFFER, REJECTED, UNKNOWN, NOT_APPLICABLE
4. NULL VALUES:
   - Set company to null if not clearly specified.
   - Set role to null if not clearly specified.
   - Set deadline to null if no explicit submission/completion deadline is mentioned.
   - Set eventDate to null if no scheduled meeting/interview time is mentioned.
5. CONFIDENCE & REASONING:
   - confidence: A score between 0.0 and 1.0 reflecting how strongly the text supports your classification.
   - reasoning: A brief, 1-2 sentence evidence-based explanation (e.g., "The email explicitly confirms receipt of the candidate's application for the Software Engineer Intern role at Google.").`;

/**
 * Formats a normalized GmailEmail into a clean text prompt for Bedrock,
 * enforcing body length truncation limits safely.
 */
export function formatEmailPrompt(email: GmailEmail, maxBodyChars: number = 12000): string {
  let bodyContent = (email.bodyText || email.snippet || '').trim();

  if (bodyContent.length > maxBodyChars) {
    bodyContent = `${bodyContent.slice(0, maxBodyChars)}\n\n[... Email body truncated for length ...]`;
  }

  const labelsStr = email.labels && email.labels.length > 0 ? email.labels.join(', ') : 'None';

  return `Please analyze this email:

Subject: ${email.subject}
From: ${email.from}
To: ${email.to || '(Unknown)'}
Date: ${email.date}
Gmail Labels: ${labelsStr}
Snippet: ${email.snippet}

Body:
${bodyContent || '(Empty body)'}`;
}

export const CAREER_PILOT_FOLLOW_UP_PROMPT = `You are CareerPilot's professional Email Draft Assistant for student job applicants.
Your task is to draft a polite, professional, concise, and respectful follow-up email to a hiring team or recruiter for a specific job application.

CRITICAL ZERO-HALLUCINATION RULES:
1. NEVER invent or hallucinate recruiter names, interviewer names, dates, locations, or fake facts.
2. If the recruiter's name is NOT explicitly present in the provided notes or record, use a polite neutral greeting such as "Dear Hiring Team" or "Dear [Company Name] Recruiting Team".
3. Use ONLY the provided company name, job role, and verified event dates/notes.
4. Keep the tone polite, professional, concise (3-4 paragraphs max), and enthusiastic.
5. Emphasize candidate interest and inquire respectfully about the application timeline or next steps.
6. Provide a clear subject line and body text suitable for a human candidate to review before sending.`;

export interface ApplicationFollowUpContext {
  company: string;
  role: string;
  status: string;
  lastActivityAt: string;
  applicationDate?: string | null;
  deadline?: string | null;
  eventDate?: string | null;
  notes?: string | null;
  reason?: string;
}

export function formatFollowUpPrompt(context: ApplicationFollowUpContext): string {
  return `Please generate a professional follow-up email draft for the following job application context:

Company Name       : ${context.company}
Job Title / Role   : ${context.role}
Current Status     : ${context.status}
Last Activity Date : ${context.lastActivityAt}
Application Date   : ${context.applicationDate || 'N/A'}
Assessment Deadline: ${context.deadline || 'N/A'}
Interview Date     : ${context.eventDate || 'N/A'}
Recent Notes       : ${context.notes || 'N/A'}
Follow-Up Reason   : ${context.reason || 'Routine status check after waiting period'}

Draft a polite, tailored follow-up email for the candidate to review.`;
}

