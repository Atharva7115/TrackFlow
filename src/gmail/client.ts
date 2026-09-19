import { google, type gmail_v1 } from 'googleapis';
import { getOAuth2Client } from './auth.js';

let cachedGmailClient: gmail_v1.Gmail | null = null;

/**
 * Initializes and returns an authenticated Gmail API v1 client instance.
 */
export async function getGmailClient(): Promise<gmail_v1.Gmail> {
  if (cachedGmailClient) {
    return cachedGmailClient;
  }

  const auth = await getOAuth2Client();
  cachedGmailClient = google.gmail({ version: 'v1', auth });
  return cachedGmailClient;
}
