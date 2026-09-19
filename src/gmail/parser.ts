import type { gmail_v1 } from 'googleapis';
import type { GmailEmail } from './types.js';

/**
 * Decodes base64 / base64url encoded string safely.
 */
function decodeBase64(encodedData: string): string {
  try {
    return Buffer.from(encodedData, 'base64url').toString('utf-8');
  } catch {
    try {
      const sanitized = encodedData.replace(/-/g, '+').replace(/_/g, '/');
      return Buffer.from(sanitized, 'base64').toString('utf-8');
    } catch {
      return '';
    }
  }
}

/**
 * Basic HTML tag stripping for fallback when text/plain is missing.
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Recursively extracts plain text or fallback HTML body from Gmail message parts.
 */
function extractBodyFromPayload(payload?: gmail_v1.Schema$MessagePart): string {
  if (!payload) return '';

  let plainTextBody = '';
  let htmlBody = '';

  function traverse(part: gmail_v1.Schema$MessagePart): void {
    const mimeType = (part.mimeType || '').toLowerCase();
    const data = part.body?.data;

    if (mimeType === 'text/plain' && data && !plainTextBody) {
      plainTextBody = decodeBase64(data).trim();
    } else if (mimeType === 'text/html' && data && !htmlBody) {
      htmlBody = decodeBase64(data).trim();
    }

    if (part.parts && Array.isArray(part.parts)) {
      for (const subPart of part.parts) {
        traverse(subPart);
      }
    }
  }

  traverse(payload);

  if (plainTextBody) {
    return plainTextBody;
  }

  if (htmlBody) {
    return stripHtmlTags(htmlBody);
  }

  return '';
}

/**
 * Normalizes a raw Gmail API message object into the application-standard GmailEmail type.
 */
export function parseGmailMessage(rawMessage: gmail_v1.Schema$Message): GmailEmail {
  const headers = rawMessage.payload?.headers || [];

  const headerMap = new Map<string, string>();
  for (const h of headers) {
    if (h.name && h.value) {
      headerMap.set(h.name.toLowerCase(), h.value);
    }
  }

  const subject = headerMap.get('subject') || '(No subject)';
  const from = headerMap.get('from') || '(Unknown sender)';
  const to = headerMap.get('to') || undefined;
  const date = headerMap.get('date') || '';
  const snippet = rawMessage.snippet || '';
  const labels = rawMessage.labelIds || [];
  const bodyText = extractBodyFromPayload(rawMessage.payload) || snippet;

  return {
    id: rawMessage.id || '',
    threadId: rawMessage.threadId || '',
    subject,
    from,
    to,
    date,
    snippet,
    labels,
    bodyText: bodyText || undefined,
  };
}
