import path from 'node:path';
import dotenv from 'dotenv';

// Attempt to load .env if present (optional)
dotenv.config();

export interface AppConfig {
  credentialsPath: string;
  tokenPath: string;
  gmailQuery: string;
  gmailMaxResults: number;
  awsRegion: string;
  bedrockModelId: string;
  aiMaxEmails: number;
  maxEmailBodyChars: number;
  dynamoDbTableName: string;
  followUpDaysApplied: number;
  followUpDaysOaCompleted: number;
  followUpDaysInterview: number;
  followUpDaysDefault: number;
}

const DEFAULT_QUERY = 'newer_than:30d';
const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_AI_MAX_EMAILS = 5;
const DEFAULT_MAX_BODY_CHARS = 12000;
const DEFAULT_AWS_REGION = 'us-east-1';
const DEFAULT_BEDROCK_MODEL_ID = 'us.anthropic.claude-3-haiku-20240307-v1:0';
const DEFAULT_DYNAMODB_TABLE = 'CareerPilot-Applications';

const DEFAULT_FOLLOWUP_DAYS_APPLIED = 14;
const DEFAULT_FOLLOWUP_DAYS_OA_COMPLETED = 7;
const DEFAULT_FOLLOWUP_DAYS_INTERVIEW = 7;
const DEFAULT_FOLLOWUP_DAYS_DEFAULT = 10;

function parsePositiveInt(val: string | undefined, fallback: number): number {
  if (!val) return fallback;
  const parsed = parseInt(val, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config: AppConfig = {
  credentialsPath: process.env.GMAIL_CREDENTIALS_PATH
    ? path.resolve(process.cwd(), process.env.GMAIL_CREDENTIALS_PATH)
    : path.resolve(process.cwd(), 'credentials.json'),
  tokenPath: process.env.GMAIL_TOKEN_PATH
    ? path.resolve(process.cwd(), process.env.GMAIL_TOKEN_PATH)
    : path.resolve(process.cwd(), 'token.json'),
  gmailQuery: process.env.GMAIL_QUERY?.trim() || DEFAULT_QUERY,
  gmailMaxResults: parsePositiveInt(process.env.GMAIL_MAX_RESULTS, DEFAULT_MAX_RESULTS),
  awsRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || DEFAULT_AWS_REGION,
  bedrockModelId: process.env.BEDROCK_MODEL_ID?.trim() || DEFAULT_BEDROCK_MODEL_ID,
  aiMaxEmails: parsePositiveInt(process.env.AI_MAX_EMAILS, DEFAULT_AI_MAX_EMAILS),
  maxEmailBodyChars: parsePositiveInt(process.env.MAX_EMAIL_BODY_CHARS, DEFAULT_MAX_BODY_CHARS),
  dynamoDbTableName: process.env.DYNAMODB_TABLE_NAME?.trim() || DEFAULT_DYNAMODB_TABLE,
  followUpDaysApplied: parsePositiveInt(process.env.FOLLOWUP_DAYS_APPLIED, DEFAULT_FOLLOWUP_DAYS_APPLIED),
  followUpDaysOaCompleted: parsePositiveInt(process.env.FOLLOWUP_DAYS_OA_COMPLETED, DEFAULT_FOLLOWUP_DAYS_OA_COMPLETED),
  followUpDaysInterview: parsePositiveInt(process.env.FOLLOWUP_DAYS_INTERVIEW, DEFAULT_FOLLOWUP_DAYS_INTERVIEW),
  followUpDaysDefault: parsePositiveInt(process.env.FOLLOWUP_DAYS_DEFAULT, DEFAULT_FOLLOWUP_DAYS_DEFAULT),
};
