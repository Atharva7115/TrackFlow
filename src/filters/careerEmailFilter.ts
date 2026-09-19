import type { GmailEmail } from '../gmail/types.js';

export interface FilterDecision {
  shouldProcessWithAI: boolean;
  reason?: string;
}

/**
 * Known obvious non-career patterns (e.g. OTPs, account security alerts, food delivery, rideshare, billing receipts).
 * Kept intentionally conservative so that any ambiguous or potential recruiter email is forwarded to the AI.
 */
const OBVIOUS_NON_CAREER_PATTERNS = [
  /\b(otp|one-time password|two-factor authentication|2-step verification)\b/i,
  /\b(password reset|your security code|security alert|new login from)\b/i,
  /\b(your uber ride|your lyft ride|doordash order|swiggy order|zomato order)\b/i,
  /\b(statement is ready|your monthly bill|receipt for your payment|invoice payment received)\b/i,
];

/**
 * Lightweight pre-filter to skip obviously irrelevant emails (security alerts, receipts) before invoking AI.
 * 
 * NOTE: If there is ANY doubt or ambiguity, this returns true so the AI agent can make the final determination.
 */
export function evaluatePreFilter(email: GmailEmail): FilterDecision {
  const subjectAndSnippet = `${email.subject} ${email.snippet}`.toLowerCase();

  for (const pattern of OBVIOUS_NON_CAREER_PATTERNS) {
    if (pattern.test(subjectAndSnippet)) {
      return {
        shouldProcessWithAI: false,
        reason: 'Skipped by lightweight pre-filter (obvious non-career transactional/security email).',
      };
    }
  }

  return {
    shouldProcessWithAI: true,
  };
}
