import { getGmailClient } from './client.js';
import { parseGmailMessage } from './parser.js';
import type { GmailEmail, FetchEmailsOptions } from './types.js';
import { config } from '../config/env.js';

/**
 * Fetches recent emails matching the query filter from Gmail and returns normalized email objects.
 * Sequential processing is used to respect API limits and ensure maximum reliability.
 */
export async function fetchRecentEmails(options: FetchEmailsOptions = {}): Promise<GmailEmail[]> {
  const gmail = await getGmailClient();

  const query = options.query ?? config.gmailQuery;
  const maxResults = options.maxResults ?? config.gmailMaxResults;

  let messageListResponse;
  try {
    messageListResponse = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[CareerPilot Error] Failed to list messages from Gmail: ${message}\n` +
      `Check your network connection and verify Gmail API permissions.`
    );
  }

  const messageItems = messageListResponse.data.messages || [];
  if (messageItems.length === 0) {
    return [];
  }

  const emails: GmailEmail[] = [];

  for (const item of messageItems) {
    if (!item.id) continue;

    try {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: item.id,
        format: 'full',
      });

      if (msgRes.data) {
        const parsed = parseGmailMessage(msgRes.data);
        emails.push(parsed);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[CareerPilot Warning] Could not fetch details for message ID ${item.id}: ${msg}`);
    }
  }

  return emails;
}
