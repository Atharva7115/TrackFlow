import { Agent, BedrockModel } from '@strands-agents/sdk';
import { CareerEmailAnalysisSchema } from './schemas.js';
import { CAREER_PILOT_SYSTEM_PROMPT } from './prompts.js';
import { config } from '../config/env.js';

/**
 * Creates and configures a Strands Agent instance using Amazon Bedrock
 * and strict structured output validation via Zod.
 */
export function createCareerClassifierAgent(): Agent {
  const model = new BedrockModel({
    region: config.awsRegion,
    modelId: config.bedrockModelId,
    temperature: 0.0,
    maxTokens: 2048,
  });

  return new Agent({
    model,
    systemPrompt: CAREER_PILOT_SYSTEM_PROMPT,
    structuredOutputSchema: CareerEmailAnalysisSchema,
  });
}
