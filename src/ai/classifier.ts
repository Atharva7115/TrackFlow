import { Agent, StructuredOutputError } from '@strands-agents/sdk';
import type { GmailEmail } from '../gmail/types.js';
import type { CareerEmailAnalysis } from './schemas.js';
import { formatEmailPrompt } from './prompts.js';
import { config } from '../config/env.js';

export interface ClassifiedEmailResult {
  email: GmailEmail;
  analysis?: CareerEmailAnalysis;
  error?: string;
}

/**
 * Invokes the Strands Bedrock agent to classify and extract structured details from a single email.
 */
export async function classifyEmail(agent: Agent, email: GmailEmail): Promise<CareerEmailAnalysis> {
  const prompt = formatEmailPrompt(email, config.maxEmailBodyChars);

  try {
    const result = await agent.invoke(prompt);

    if (!result.structuredOutput) {
      throw new Error('Model responded without structured output data.');
    }

    return result.structuredOutput as CareerEmailAnalysis;
  } catch (err: unknown) {
    if (err instanceof StructuredOutputError) {
      throw new Error(`[CareerPilot AI Validation Error] Output schema validation failed: ${err.message}`);
    }

    const message = err instanceof Error ? err.message : String(err);

    // Provide friendly diagnostics for common AWS / Bedrock issues
    if (message.includes('UnrecognizedClientException') || message.includes('CredentialsProviderError') || message.includes('Missing credentials')) {
      throw new Error(
        `[CareerPilot AWS Error] AWS credentials not found or invalid.\n` +
        `Please configure AWS credentials using 'aws configure' or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.\n` +
        `Underlying error: ${message}`
      );
    }

    if (message.includes('AccessDeniedException') || message.includes('ModelNotReadyException')) {
      throw new Error(
        `[CareerPilot Bedrock Error] Access denied for Bedrock model '${config.bedrockModelId}' in region '${config.awsRegion}'.\n` +
        `Please ensure model access is requested/enabled in the Amazon Bedrock console for this model.\n` +
        `Underlying error: ${message}`
      );
    }

    if (message.includes('ResourceNotFoundException')) {
      throw new Error(
        `[CareerPilot Bedrock Error] Model ID '${config.bedrockModelId}' not found in region '${config.awsRegion}'.\n` +
        `Check BEDROCK_MODEL_ID and AWS_REGION in your configuration.\n` +
        `Underlying error: ${message}`
      );
    }

    throw new Error(`[CareerPilot AI Error] Failed to classify email "${email.subject}": ${message}`);
  }
}

/**
 * Classifies a collection of emails sequentially, isolating errors per email.
 */
export async function classifyEmailsBatch(
  agent: Agent,
  emails: GmailEmail[]
): Promise<ClassifiedEmailResult[]> {
  const results: ClassifiedEmailResult[] = [];

  for (const email of emails) {
    try {
      const analysis = await classifyEmail(agent, email);
      results.push({ email, analysis });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      results.push({ email, error: errorMessage });
    }
  }

  return results;
}
