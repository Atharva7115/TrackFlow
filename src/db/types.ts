import type { ApplicationStatus } from '../ai/schemas.js';

export interface FollowUpDraftRecord {
  subject: string;
  body: string;
  generatedAt: string;
  reasoning?: string;
}

export type FollowUpStatus = 'NONE' | 'RECOMMENDED' | 'NOT_RECOMMENDED' | 'DRAFTED' | 'SENT' | 'DISMISSED';

/**
 * DynamoDB Application Record representing a single tracked internship/job application.
 */
export interface ApplicationRecord {
  applicationId: string;        // Partition key: e.g. app_microsoft_softwareengineeringintern
  company: string;             // Display company name e.g. "Microsoft"
  role: string;                // Display job title e.g. "Software Engineering Intern"
  status: ApplicationStatus;   // Current stage: APPLIED, OA_RECEIVED, OA_COMPLETED, INTERVIEW, OFFER, REJECTED, UNKNOWN
  applicationDate?: string | null;  // First recorded application submission date
  deadline?: string | null;         // Most recent active assessment / form deadline
  eventDate?: string | null;        // Most recent scheduled interview date/time
  lastActivityAt: string;      // ISO timestamp of the latest email processed
  sourceEmailId: string;       // Message ID of the latest email
  sourceThreadId: string;      // Gmail thread ID
  processedEmailIds: string[]; // Set of email IDs associated with this application for idempotency
  emailCount: number;          // Total number of lifecycle emails received
  notes?: string | null;       // Latest AI reasoning / evidence note
  followUpEligible?: boolean;  // Phase 4: True if follow-up is recommended based on intelligence logic
  followUpReason?: string | null; // Phase 4: Reason for follow-up decision
  followUpDraft?: FollowUpDraftRecord | null; // Phase 4: Generated AI email draft (subject + body)
  followUpStatus?: FollowUpStatus; // Phase 4: Follow-up stage state
  lastFollowUpEvaluatedAt?: string | null; // Phase 4: ISO timestamp of last follow-up evaluation
  createdAt: string;          // Timestamp when record was first created
  updatedAt: string;          // Timestamp when record was last updated
}

export type ApplicationAction = 'CREATED' | 'UPDATED' | 'SKIPPED_DUPLICATE' | 'SKIPPED_NOT_APPLICATION';

export interface ApplicationProcessResult {
  action: ApplicationAction;
  application?: ApplicationRecord;
  reason?: string;
}
