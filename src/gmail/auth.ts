import fs from 'node:fs';
import http from 'node:http';
import { exec } from 'node:child_process';
import { URL } from 'node:url';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env.js';

/**
 * ONLY read-only scope is allowed for CareerPilot Phase 1.
 * DO NOT add compose, send, modify, or full mail scopes.
 */
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const DEFAULT_AUTH_PORT = 3000;

interface CredentialsJson {
  installed?: {
    client_id: string;
    client_secret: string;
    redirect_uris?: string[];
  };
  web?: {
    client_id: string;
    client_secret: string;
    redirect_uris?: string[];
  };
}

/**
 * Attempts to open URL in the user's default browser automatically.
 */
function openBrowser(url: string): void {
  const platform = process.platform;
  let cmd = '';

  if (platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }

  exec(cmd, () => {
    // Ignore errors if auto-open fails; URL is also printed in terminal
  });
}

/**
 * Starts a temporary local HTTP server to receive the OAuth2 callback code.
 */
function listenForAuthCode(port: number): Promise<{ code: string; server: http.Server }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', `http://localhost:${port}`);
        const code = reqUrl.searchParams.get('code');
        const error = reqUrl.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>CareerPilot - Authorization Denied</title></head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 60px 20px;">
                <h2 style="color: #dc2626;">Authorization Failed</h2>
                <p>Google OAuth authorization was denied (${error}).</p>
                <p>You can close this window and return to your terminal.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(`[CareerPilot Error] Google OAuth authorization failed: ${error}`));
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>CareerPilot - Authorization Successful</title></head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 60px 20px;">
                <h2 style="color: #16a34a;">Authentication Successful!</h2>
                <p>CareerPilot has received read-only Gmail authorization.</p>
                <p>You can close this tab and return to your terminal.</p>
              </body>
            </html>
          `);

          console.log('\n[CareerPilot] OAuth callback received successfully.');
          resolve({ code, server });
          return;
        }

        // Ignore favicon or non-code requests
        res.writeHead(404);
        res.end();
      } catch (err: unknown) {
        res.writeHead(500);
        res.end();
        server.close();
        reject(err);
      }
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `[CareerPilot Error] Port ${port} is already in use.\n` +
            `Please free port ${port} or close any other running process using it.`
          )
        );
      } else {
        reject(new Error(`[CareerPilot Error] OAuth callback server error: ${err.message}`));
      }
    });

    // 5-minute timeout for user to authorize
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('[CareerPilot Error] OAuth authorization timed out after 5 minutes.'));
    }, 5 * 60 * 1000);

    server.listen(port, () => {
      // Server is ready to receive callback
    });

    server.on('close', () => {
      clearTimeout(timer);
    });
  });
}

/**
 * Loads credentials.json and initializes Google OAuth2Client.
 */
export async function getOAuth2Client(): Promise<OAuth2Client> {
  if (!fs.existsSync(config.credentialsPath)) {
    throw new Error(
      `\n[CareerPilot Error] Google OAuth credentials file not found!\n` +
      `Expected location: ${config.credentialsPath}\n\n` +
      `How to fix:\n` +
      `1. Go to Google Cloud Console -> APIs & Services -> Credentials\n` +
      `2. Download your OAuth 2.0 Client ID JSON file (Desktop / Web application)\n` +
      `3. Save it as "credentials.json" in the project root directory.\n`
    );
  }

  let credsRaw: string;
  try {
    credsRaw = await fs.promises.readFile(config.credentialsPath, 'utf-8');
  } catch (err: unknown) {
    throw new Error(`Failed to read credentials file: ${err instanceof Error ? err.message : String(err)}`);
  }

  let credentialsData: CredentialsJson;
  try {
    credentialsData = JSON.parse(credsRaw) as CredentialsJson;
  } catch {
    throw new Error(
      `[CareerPilot Error] credentials.json is not valid JSON. Please check the file contents.`
    );
  }

  const clientInfo = credentialsData.installed || credentialsData.web;
  if (!clientInfo || !clientInfo.client_id || !clientInfo.client_secret) {
    throw new Error(
      `[CareerPilot Error] Invalid credentials.json format. Missing client_id or client_secret.`
    );
  }

  const authPort = DEFAULT_AUTH_PORT;
  const redirectUri = `http://localhost:${authPort}/oauth2callback`;

  const oauth2Client = new google.auth.OAuth2(
    clientInfo.client_id,
    clientInfo.client_secret,
    redirectUri
  );

  // Set up auto-save handler for refreshed tokens
  oauth2Client.on('tokens', async (newTokens) => {
    try {
      let existingTokens = {};
      if (fs.existsSync(config.tokenPath)) {
        try {
          const raw = await fs.promises.readFile(config.tokenPath, 'utf-8');
          existingTokens = JSON.parse(raw);
        } catch {
          // ignore parsing error and overwrite with newTokens
        }
      }
      const merged = { ...existingTokens, ...newTokens };
      await fs.promises.writeFile(config.tokenPath, JSON.stringify(merged, null, 2), 'utf-8');
    } catch {
      // Do not crash on token cache write failure
    }
  });

  // Check if token.json already exists
  if (fs.existsSync(config.tokenPath)) {
    try {
      const tokenRaw = await fs.promises.readFile(config.tokenPath, 'utf-8');
      const tokens = JSON.parse(tokenRaw);
      oauth2Client.setCredentials(tokens);
      return oauth2Client;
    } catch {
      console.warn(`[CareerPilot Warning] Existing token.json could not be read. Initiating re-authorization...`);
    }
  }

  // 1. Start local callback listener BEFORE printing/opening the auth URL
  const authCodePromise = listenForAuthCode(authPort);

  // 2. Generate authorization URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    redirect_uri: redirectUri,
  });

  console.log('\n========================================');
  console.log('CareerPilot — Google OAuth Authorization');
  console.log('========================================');
  console.log(`Local callback server listening on: ${redirectUri}`);
  console.log('\nOpening your browser for authorization...');
  console.log('If your browser does not open automatically, visit this URL:\n');
  console.log(`   ${authUrl}\n`);
  console.log('Waiting for approval in browser...');
  console.log('========================================\n');

  openBrowser(authUrl);

  // 3. Await callback code from local server
  let authResult: { code: string; server: http.Server };
  try {
    authResult = await authCodePromise;
  } catch (err: unknown) {
    throw err;
  } finally {
    // Ensure server is closed after receiving response or error
  }

  const { code, server } = authResult;

  try {
    const { tokens } = await oauth2Client.getToken({
      code,
      redirect_uri: redirectUri,
    });
    oauth2Client.setCredentials(tokens);
    await fs.promises.writeFile(config.tokenPath, JSON.stringify(tokens, null, 2), 'utf-8');
    console.log('[CareerPilot] Authorization completed. Token saved to token.json.\n');
    return oauth2Client;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[CareerPilot Error] Failed to exchange authorization code for tokens: ${msg}`
    );
  } finally {
    server.close();
  }
}
