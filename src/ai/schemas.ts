import { z } from 'zod';

/**
 * Controlled categories for career and recruiting emails.
 */
export const CareerEmailTypeEnum = z.enum([
  'APPLICATION_CONFIRMATION',
  'OA_INVITATION',
  'OA_REMINDER',
  'INTERVIEW_INVITATION',
  'INTERVIEW_UPDATE',
  'OFFER',
  'REJECTION',
  'APPLICATION_UPDATE',
  'FOLLOW_UP_OR_RESPONSE',
  'JOB_RECOMMENDATION',
  'RECRUITER_OUTREACH',
  'OTHER_CAREER',
  'NOT_CAREER_RELATED',
]);

export type CareerEmailType = z.infer<typeof CareerEmailTypeEnum>;

/**
 * Controlled application lifecycle statuses.
 */
export const ApplicationStatusEnum = z.enum([
  'APPLIED',
  'OA_RECEIVED',
  'OA_COMPLETED',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
  'UNKNOWN',
  'NOT_APPLICABLE',
]);

export type ApplicationStatus = z.infer<typeof ApplicationStatusEnum>;

/**
 * Zod schema for structured career email analysis produced by Strands Agent via Bedrock.
 */
export const CareerEmailAnalysisSchema = z.object({
  isCareerRelated: z
    .boolean()
    .describe('True if the email relates to jobs, internships, recruiting, or career opportunities.'),

  isApplicationRelated: z
    .boolean()
    .describe(
      'True ONLY if this email represents an actual application submitted or in-progress by the candidate. Must be FALSE for generic job recommendations, job alerts, or general outreach.'
    ),

  emailType: CareerEmailTypeEnum.describe('The specific category of the career email.'),

  company: z
    .string()
    .nullable()
    .describe('The name of the hiring organization or company, or null if missing/not applicable.'),

  role: z
    .string()
    .nullable()
    .describe('The job title or internship role, or null if missing/not applicable.'),

  status: ApplicationStatusEnum.describe(
    'The active application status represented by this email. Must be NOT_APPLICABLE if isApplicationRelated is false.'
  ),

  actionRequired: z
    .boolean()
    .describe(
      'True if the candidate is explicitly requested to take an action (e.g. complete OA, schedule interview, submit forms).'
    ),

  deadline: z
    .string()
    .nullable()
    .describe(
      'The action or assessment deadline in YYYY-MM-DD format (or explicit date string from email), or null if no deadline.'
    ),

  eventDate: z
    .string()
    .nullable()
    .describe('The scheduled interview or event date/time if mentioned in the email, or null if none.'),

  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Confidence score between 0.0 and 1.0 reflecting how strongly the email text supports this classification.'),

  reasoning: z
    .string()
    .describe('A concise 1-2 sentence evidence-based explanation for the classification.'),
});

export type CareerEmailAnalysis = z.infer<typeof CareerEmailAnalysisSchema>;
