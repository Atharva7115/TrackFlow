import { applicationRepository, type IApplicationRepository } from '../db/applicationRepository.js';
import type { ApplicationRecord } from '../db/types.js';

export interface RouteResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

let activeRepo: IApplicationRepository | null = null;

export function setActiveRepository(repo: IApplicationRepository | null): void {
  activeRepo = repo;
}

export function getActiveRepository(): IApplicationRepository {
  return activeRepo || applicationRepository;
}

/**
 * Handles incoming API request path and method, returning standard response object.
 * Used by both AWS Lambda Handler and local Dev Server.
 */
export async function handleApiRequest(
  method: string,
  path: string,
  bodyText?: string | null,
  repo: IApplicationRepository = getActiveRepository()
): Promise<RouteResponse> {
  const normMethod = method.toUpperCase();
  const normPath = path.split('?')[0].replace(/\/$/, '') || '/';

  // Handle CORS preflight
  if (normMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'OK' }),
    };
  }

  try {
    // GET /applications or GET /api/applications
    if (normMethod === 'GET' && (normPath === '/applications' || normPath === '/api/applications')) {
      const records = await repo.listAll();
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ applications: records }),
      };
    }

    // GET /applications/:id or GET /api/applications/:id
    const getMatch = normPath.match(/^(?:\/api)?\/applications\/([a-zA-Z0-9_\-]+)$/);
    if (normMethod === 'GET' && getMatch) {
      const id = getMatch[1];
      const record = await repo.findById(id);

      if (!record) {
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: `Application '${id}' not found.` }),
        };
      }

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ application: record }),
      };
    }

    // PATCH /applications/:id/follow-up or PATCH /api/applications/:id/follow-up
    const patchMatch = normPath.match(/^(?:\/api)?\/applications\/([a-zA-Z0-9_\-]+)\/follow-up$/);
    if (normMethod === 'PATCH' && patchMatch) {
      const id = patchMatch[1];
      const existing = await repo.findById(id);

      if (!existing) {
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: `Application '${id}' not found.` }),
        };
      }

      let payload: any = {};
      if (bodyText) {
        try {
          payload = JSON.parse(bodyText);
        } catch {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Invalid JSON body in PATCH request.' }),
          };
        }
      }

      const { action, draft } = payload;
      const nowIso = new Date().toISOString();

      let updatedRecord: ApplicationRecord = { ...existing, updatedAt: nowIso };

      if (action === 'MARK_SENT') {
        // Record manual candidate send - NEVER sends auto email
        updatedRecord = {
          ...updatedRecord,
          followUpEligible: false,
          followUpStatus: 'SENT',
        };
      } else if (action === 'DISMISS') {
        // Dismiss from follow-up queue while preserving application state
        updatedRecord = {
          ...updatedRecord,
          followUpEligible: false,
          followUpStatus: 'DISMISSED',
        };
      } else if (action === 'UPDATE_DRAFT') {
        // Update draft subject & body if provided
        if (draft && typeof draft.subject === 'string' && typeof draft.body === 'string') {
          updatedRecord = {
            ...updatedRecord,
            followUpDraft: {
              subject: draft.subject.trim(),
              body: draft.body.trim(),
              generatedAt: existing.followUpDraft?.generatedAt || nowIso,
              reasoning: existing.followUpDraft?.reasoning,
            },
          };
        }
      } else {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: 'Invalid action. Supported actions: MARK_SENT, DISMISS, UPDATE_DRAFT.' }),
        };
      }

      await repo.save(updatedRecord);

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          message: `Follow-up updated successfully (action: ${action}).`,
          application: updatedRecord,
        }),
      };
    }

    return {
      statusCode: 404,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: `Route '${normMethod} ${normPath}' not found.` }),
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: `Internal Server Error: ${errorMsg}` }),
    };
  }
}
