import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env.js';

let cachedClient: OAuth2Client | null = null;

interface SecretOAuthPayload {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  access_token?: string;
  token_type?: string;
  expiry_date?: number;
}

/**
 * Loads Gmail OAuth credentials from AWS Secrets Manager.
 * Used exclusively in AWS Lambda or when GMAIL_AUTH_MODE=secret is set.
 */
export async function getSecretsManagerOAuth2Client(): Promise<OAuth2Client> {
  if (cachedClient) {
    return cachedClient;
  }

  const smClient = new SecretsManagerClient({ region: config.awsRegion });

  let secretValueResponse;
  try {
    secretValueResponse = await smClient.send(
      new GetSecretValueCommand({
        SecretId: config.gmailSecretName,
      })
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[CareerPilot Secrets Error] Failed to retrieve Gmail OAuth secret '${config.gmailSecretName}' from AWS Secrets Manager in region '${config.awsRegion}': ${msg}`
    );
  }

  if (!secretValueResponse.SecretString) {
    throw new Error(
      `[CareerPilot Secrets Error] Secret '${config.gmailSecretName}' does not contain a SecretString.`
    );
  }

  let parsedSecret: SecretOAuthPayload;
  try {
    parsedSecret = JSON.parse(secretValueResponse.SecretString) as SecretOAuthPayload;
  } catch {
    throw new Error(
      `[CareerPilot Secrets Error] Secret '${config.gmailSecretName}' is not valid JSON.`
    );
  }

  if (!parsedSecret.client_id || !parsedSecret.client_secret || !parsedSecret.refresh_token) {
    throw new Error(
      `[CareerPilot Secrets Error] Secret '${config.gmailSecretName}' must contain 'client_id', 'client_secret', and 'refresh_token'.`
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    parsedSecret.client_id,
    parsedSecret.client_secret
  );

  oauth2Client.setCredentials({
    refresh_token: parsedSecret.refresh_token,
    access_token: parsedSecret.access_token,
    token_type: parsedSecret.token_type || 'Bearer',
    expiry_date: parsedSecret.expiry_date,
  });

  cachedClient = oauth2Client;
  return cachedClient;
}
