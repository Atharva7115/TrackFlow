import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DEMO_SAMPLE_EMAILS } from './sampleEmails.js';
import { getMockEmailAnalysis, getMockFollowUpDraft } from './demoClassifier.js';
import { demoRepository } from './demoStore.js';
import { ApplicationService } from '../db/applicationService.js';
import { evaluateFollowUpEligibility } from '../ai/followUpEvaluator.js';
import { handleApiRequest, setActiveRepository } from '../api/routes.js';
import type { ApplicationRecord } from '../db/types.js';

export async function runDemoPipeline(): Promise<ApplicationRecord[]> {
  const service = new ApplicationService(demoRepository);
  const nowIso = new Date().toISOString();

  for (const email of DEMO_SAMPLE_EMAILS) {
    const analysis = getMockEmailAnalysis(email);
    const result = await service.processCareerEmail(email, analysis);

    if (result.application) {
      // Evaluate follow-up eligibility using Phase 4 evaluator logic
      const decision = evaluateFollowUpEligibility(result.application);

      if (decision.isEligible) {
        const mockDraft = getMockFollowUpDraft(result.application);
        const updatedRecord: ApplicationRecord = {
          ...result.application,
          followUpEligible: true,
          followUpReason: decision.reason,
          followUpStatus: 'DRAFTED',
          followUpDraft: mockDraft,
          lastFollowUpEvaluatedAt: nowIso,
          updatedAt: nowIso,
        };
        await demoRepository.save(updatedRecord);
      }
    }
  }

  // Register demo repository as active for API routes
  setActiveRepository(demoRepository);

  return await demoRepository.listAll();
}

const PORT = parseInt(process.env.PORT || '3001', 10);
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

export async function startDemoServer(initialPort: number = PORT): Promise<{ server: http.Server; boundPort: number }> {
  return new Promise((resolve, reject) => {
    const tryListen = (p: number) => {
      const server = http.createServer(async (req, res) => {
        const method = req.method || 'GET';
        const urlPath = req.url || '/';

        // Route API requests through routes handler (uses demoRepository)
        if (urlPath.startsWith('/api') || urlPath.startsWith('/applications')) {
          let bodyText = '';
          req.on('data', (chunk) => {
            bodyText += chunk;
          });

          req.on('end', async () => {
            const response = await handleApiRequest(method, urlPath, bodyText, demoRepository);

            res.writeHead(response.statusCode, response.headers || {});
            res.end(response.body);
          });
          return;
        }

        // Static File Serving for Public Web UI
        let filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(PUBLIC_DIR, 'index.html');
        }

        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'text/plain';

        try {
          const content = fs.readFileSync(filePath);
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
        }
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE' && p < initialPort + 10) {
          tryListen(p + 1);
        } else {
          reject(err);
        }
      });

      server.listen(p, () => {
        resolve({ server, boundPort: p });
      });
    };

    tryListen(initialPort);
  });
}

async function main() {
  console.log('========================================');
  console.log('CareerPilot — DEMO MODE');
  console.log('========================================');
  console.log('AWS Credentials : NOT REQUIRED');
  console.log('Gmail OAuth     : NOT REQUIRED');
  console.log('Bedrock Calls   : 0');
  console.log('Mode            : LOCAL DEMO');
  console.log('========================================\n');

  console.log('Processing sample career emails...\n');

  const records = await runDemoPipeline();

  for (const record of records) {
    const followUpBadge = record.followUpEligible ? ' — FOLLOW-UP RECOMMENDED' : '';
    console.log(`✓ ${record.company} — ${record.role} — ${record.status}${followUpBadge}`);
  }

  const { boundPort } = await startDemoServer();

  console.log('\n========================================');
  console.log('Demo data ready');
  console.log('========================================\n');
  console.log('Dashboard:');
  console.log(`http://localhost:${boundPort}\n`);
}

// Execute main if run directly via tsx
if (process.argv[1]?.includes('demoRunner')) {
  main().catch((err) => {
    console.error('Demo Mode Error:', err);
    process.exit(1);
  });
}
