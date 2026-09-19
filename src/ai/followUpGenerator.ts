import { Agent, BedrockModel, StructuredOutputError } from '@strands-agents/sdk';
import type { ApplicationRecord, FollowUpDraftRecord } from '../db/types.js';
import { FollowUpDraftSchema, type FollowUpDraftOutput } from './schemas.js';
import { CAREER_PILOT_FOLLOW_UP_PROMPT, formatFollowUpPrompt } from './prompts.js';
import { config } from '../config/env.js';

/**
 * Creates and configures a Strands Agent instance for AI Follow-Up Draft Generation
 * using Amazon Bedrock and strict structured output validation via Zod.
 */
export function createFollowUpAgent(): Agent {
  const model = new BedrockModel({
    region: config.awsRegion,
    modelId: config.bedrockModelId,
    temperature: 0.2, // Slightly warm for professional email natural phrasing while maintaining structure
    maxTokens: 2048,
  });

  return new Agent({
    model,
    systemPrompt: CAREER_PILOT_FOLLOW_UP_PROMPT,
    structuredOutputSchema: FollowUpDraftSchema,
  });
}

/**
 * Generates an AI follow-up email draft using the Strands + Bedrock agent.
 */
export async function generateFollowUpDraft(
  agent: Agent,
  record: ApplicationRecord,
  reason?: string
): Promise<FollowUpDraftRecord> {
  const prompt = formatFollowUpPrompt({
    company: record.company,
    role: record.role,
    status: record.status,
    lastActivityAt: record.lastActivityAt,
    applicationDate: record.applicationDate,
    deadline: record.deadline,
    eventDate: record.eventDate,
    notes: record.notes,
    reason,
  });

  try {
    const result = await agent.invoke(prompt);

    if (!result.structuredOutput) {
      throw new Error('Model responded without structured draft output data.');
    }

    const output = result.structuredOutput as FollowUpDraftOutput;

    return {
      subject: output.subject,
      body: output.body,
      reasoning: output.reasoning,
      generatedAt: new Date().toISOString(),
    };
  } catch (err: unknown) {
    if (err instanceof StructuredOutputError) {
      throw new Error(`[CareerPilot FollowUp Validation Error] Draft schema validation failed: ${err.message}`);
    }

    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('UnrecognizedClientException') || message.includes('CredentialsProviderError') || message.includes('Missing credentials')) {
      throw new Error(
        `[CareerPilot AWS Error] AWS credentials not found or invalid.\n` +
        `Underlying error: ${message}`
      );
    }

    throw new Error(`[CareerPilot FollowUp AI Error] Failed to generate follow-up draft for ${record.company}: ${message}`);
  }
}
