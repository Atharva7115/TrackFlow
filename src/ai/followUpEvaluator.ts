import type { ApplicationRecord } from '../db/types.js';
import { config } from '../config/env.js';

export interface FollowUpDecision {
  isEligible: boolean;
  reason: string;
  recommendedType?: 'APPLICATION_STATUS_CHECK' | 'POST_INTERVIEW_CHECK' | 'POST_OA_CHECK' | 'GENERAL_FOLLOW_UP';
}

/**
 * Evaluates whether an application is currently eligible for a follow-up email.
 * 
 * Rules:
 * 1. Exclude REJECTED and OFFER statuses immediately.
 * 2. Exclude UNKNOWN and NOT_APPLICABLE statuses.
 * 3. OA_RECEIVED with an active (pending/future) deadline is excluded (candidate must complete OA).
 *    If deadline is expired or past threshold without deadline, follow-up is recommended.
 * 4. Checks waiting period threshold against lastActivityAt (or applicationDate/eventDate):
 *    - APPLIED: configurable followUpDaysApplied (default 14 days)
 *    - OA_COMPLETED: configurable followUpDaysOaCompleted (default 7 days)
 *    - INTERVIEW: configurable followUpDaysInterview (default 7 days)
 *    - Default: configurable followUpDaysDefault (default 10 days)
 */
export function evaluateFollowUpEligibility(
  record: ApplicationRecord,
  referenceDate: Date = new Date()
): FollowUpDecision {
  const { status, lastActivityAt, deadline, eventDate } = record;

  // Rule 1 & 2: Exclude non-actionable or completed statuses
  if (status === 'REJECTED') {
    return {
      isEligible: false,
      reason: 'Application status is REJECTED. Follow-up is not appropriate.',
    };
  }

  if (status === 'OFFER') {
    return {
      isEligible: false,
      reason: 'Application status is OFFER. Follow-up for application status check is not applicable.',
    };
  }

  if (status === 'NOT_APPLICABLE' || status === 'UNKNOWN') {
    return {
      isEligible: false,
      reason: `Application status is ${status}. Follow-up is not applicable for untracked status.`,
    };
  }

  const nowMs = referenceDate.getTime();
  const lastActivityMs = new Date(lastActivityAt).getTime();
  const daysSinceLastActivity = (nowMs - lastActivityMs) / (1000 * 60 * 60 * 24);

  // Rule 3: OA_RECEIVED checks
  if (status === 'OA_RECEIVED') {
    if (deadline) {
      const deadlineMs = new Date(deadline).getTime();
      if (!isNaN(deadlineMs) && deadlineMs >= nowMs) {
        return {
          isEligible: false,
          reason: `OA deadline (${deadline}) is still pending. Follow-up is not recommended before the deadline.`,
        };
      }
    }

    // If deadline passed or no deadline, check if waiting threshold passed
    const thresholdDays = config.followUpDaysOaCompleted || 7;
    if (daysSinceLastActivity < thresholdDays) {
      return {
        isEligible: false,
        reason: `OA invitation received recently (${Math.floor(daysSinceLastActivity)} days ago). Waiting period is ${thresholdDays} days.`,
      };
    }

    return {
      isEligible: true,
      reason: `OA invitation was received ${Math.floor(daysSinceLastActivity)} days ago and waiting threshold (${thresholdDays} days) has passed.`,
      recommendedType: 'POST_OA_CHECK',
    };
  }

  // Rule 4: APPLIED status check
  if (status === 'APPLIED') {
    const thresholdDays = config.followUpDaysApplied || 14;
    if (daysSinceLastActivity < thresholdDays) {
      return {
        isEligible: false,
        reason: `Application submitted recently (${Math.floor(daysSinceLastActivity)} days ago). Minimum waiting period is ${thresholdDays} days.`,
      };
    }

    return {
      isEligible: true,
      reason: `No update received for ${Math.floor(daysSinceLastActivity)} days since application (threshold: ${thresholdDays} days).`,
      recommendedType: 'APPLICATION_STATUS_CHECK',
    };
  }

  // Rule 5: OA_COMPLETED status check
  if (status === 'OA_COMPLETED') {
    const thresholdDays = config.followUpDaysOaCompleted || 7;
    if (daysSinceLastActivity < thresholdDays) {
      return {
        isEligible: false,
        reason: `OA completed recently (${Math.floor(daysSinceLastActivity)} days ago). Minimum waiting period is ${thresholdDays} days.`,
      };
    }

    return {
      isEligible: true,
      reason: `No update received for ${Math.floor(daysSinceLastActivity)} days since OA completion (threshold: ${thresholdDays} days).`,
      recommendedType: 'POST_OA_CHECK',
    };
  }

  // Rule 6: INTERVIEW status check
  if (status === 'INTERVIEW') {
    if (eventDate) {
      const eventMs = new Date(eventDate).getTime();
      if (!isNaN(eventMs) && eventMs > nowMs) {
        return {
          isEligible: false,
          reason: `Interview event date (${eventDate}) is scheduled in the future. Follow-up is not recommended before the interview.`,
        };
      }
    }

    const thresholdDays = config.followUpDaysInterview || 7;
    if (daysSinceLastActivity < thresholdDays) {
      return {
        isEligible: false,
        reason: `Interview activity is recent (${Math.floor(daysSinceLastActivity)} days ago). Minimum waiting period is ${thresholdDays} days.`,
      };
    }

    return {
      isEligible: true,
      reason: `No response received for ${Math.floor(daysSinceLastActivity)} days following interview (threshold: ${thresholdDays} days).`,
      recommendedType: 'POST_INTERVIEW_CHECK',
    };
  }

  // Fallback for default active statuses
  const thresholdDays = config.followUpDaysDefault || 10;
  if (daysSinceLastActivity < thresholdDays) {
    return {
      isEligible: false,
      reason: `Last activity is recent (${Math.floor(daysSinceLastActivity)} days ago). Minimum waiting period is ${thresholdDays} days.`,
    };
  }

  return {
    isEligible: true,
    reason: `Last activity was ${Math.floor(daysSinceLastActivity)} days ago (threshold: ${thresholdDays} days).`,
    recommendedType: 'GENERAL_FOLLOW_UP',
  };
}
