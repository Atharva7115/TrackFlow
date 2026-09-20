import { handleApiRequest } from './routes.js';

export interface APIGatewayEvent {
  httpMethod?: string;
  path?: string;
  rawPath?: string;
  requestContext?: {
    http?: {
      method?: string;
      path?: string;
    };
  };
  body?: string | null;
}

/**
 * AWS Lambda Handler for API Gateway integration.
 * Production deployment entrypoint for AWS Lambda.
 */
export async function handler(event: APIGatewayEvent) {
  const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
  const path = event.path || event.rawPath || event.requestContext?.http?.path || '/';
  const body = event.body || null;

  return await handleApiRequest(method, path, body);
}
