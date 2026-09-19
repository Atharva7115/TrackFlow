/**
 * Normalized application-independent email representation.
 * Rest of CareerPilot uses this clean format rather than raw Gmail API response objects.
 */
export interface GmailEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to?: string;
  date: string;
  snippet: string;
  labels: string[];
  bodyText?: string;
}

/**
 * Options for querying Gmail messages.
 */
export interface FetchEmailsOptions {
  query?: string;
  maxResults?: number;
}
