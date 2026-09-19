# CareerPilot — Internship & Job Application Tracker

> **Current Phase: Phase 3 — Application State Management (DynamoDB)**
> 
> *Phase 3 takes structured AI analysis results from Phase 2 and persists normalized application state into Amazon DynamoDB with deterministic deduplication, forward-only status progression, and idempotency. Follow-up generation, automated email replies, and dashboards are intentionally not implemented yet.*

---

## 1. Architecture Pipeline

```
Gmail API
   │
   ▼
Google OAuth 2.0 (Strict Read-Only Scope)
   │
   ▼
Gmail Ingestion Client (src/gmail/client.ts)
   │
   ▼
Message Parser & Normalizer (src/gmail/parser.ts)
   │
   ▼
Lightweight Pre-Filter (src/filters/careerEmailFilter.ts)
   │
   ▼
Strands Agent + Amazon Bedrock (src/ai/agent.ts)
   │
   ▼
Validated Structured Output (CareerEmailAnalysis via Zod)
   │
   ▼
Application Service (src/db/applicationService.ts)
   │  ├── Excludes Job Recommendations & Non-Application noise
   │  ├── Deterministic Deduplication (company + normalized role)
   │  ├── Status Progression (prevents status downgrades)
   │  └── Idempotency Guard (processedEmailIds check)
   ▼
Amazon DynamoDB (src/db/applicationRepository.ts)
   │
   ▼
CLI Application State Summary Output
```

---

## 2. Tech Stack

- **Runtime:** Node.js (v18+)
- **Language:** TypeScript (Strict mode, ES2022 / NodeNext)
- **Email Ingestion:** `googleapis` (Gmail API v1)
- **AI Agent Framework:** `@strands-agents/sdk` (Strands Agents SDK for TypeScript)
- **Foundation Models:** Amazon Bedrock (e.g., `us.anthropic.claude-3-haiku-20240307-v1:0`)
- **Database:** Amazon DynamoDB (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`)
- **Schema Validation:** `zod`
- **Environment & CLI:** `dotenv`, `tsx`

---

## 3. Amazon DynamoDB Setup

### Table Specification
- **Table Name:** `CareerPilot-Applications` (configurable via `DYNAMODB_TABLE_NAME`)
- **Partition Key (PK):** `applicationId` (String)
- **Billing Mode:** Pay-Per-Request (On-Demand)

### Creating the Table (AWS CLI)
```bash
aws dynamodb create-table \
  --table-name CareerPilot-Applications \
  --attribute-definitions AttributeName=applicationId,AttributeType=S \
  --key-schema AttributeName=applicationId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```
*(Or create it in the AWS Management Console with Partition Key `applicationId` (String).)*

---

## 4. Application State Model

```typescript
export interface ApplicationRecord {
  applicationId: string;        // Partition Key: e.g. app_microsoft_softwareengineeringintern
  company: string;             // Display name e.g. "Microsoft"
  role: string;                // Display job title e.g. "Software Engineering Intern"
  status: ApplicationStatus;   // APPLIED | OA_RECEIVED | OA_COMPLETED | INTERVIEW | OFFER | REJECTED | UNKNOWN
  applicationDate?: string | null;  // First recorded application submission date
  deadline?: string | null;         // Most recent assessment / action deadline
  eventDate?: string | null;        // Scheduled interview date/time
  lastActivityAt: string;      // ISO timestamp of latest email activity
  sourceEmailId: string;       // Latest processed email ID
  sourceThreadId: string;      // Gmail thread ID
  processedEmailIds: string[]; // List of all email IDs ingested (for idempotency)
  emailCount: number;          // Total count of emails associated with this application
  notes?: string | null;       // Latest AI reasoning note
  createdAt: string;          // ISO creation timestamp
  updatedAt: string;          // ISO last updated timestamp
}
```

---

## 5. Core Business Logic & Rules

### 1. Exclusion of Non-Application Emails & Job Recommendations
- Emails classified with `isApplicationRelated: false`, `status: NOT_APPLICABLE`, or `emailType: JOB_RECOMMENDATION` (e.g., automated Jobright/LinkedIn alerts) **never** create or update DynamoDB records.

### 2. Deterministic Deduplication (MVP Strategy)
- Multiple lifecycle emails for the same application (confirmation → OA → interview → offer) are deterministically grouped:
  - `applicationId = app_${normalizedCompany}_${normalizedRole}` (e.g., `app_microsoft_softwareengineeringintern`).
  - Fallback if role is unspecified: `app_${normalizedCompany}_general`.
  - Fallback if company is missing: `app_thread_${threadId}`.
- **Known Limitations:** Slight company name variations (e.g. *"Google LLC"* vs *"Google"*) or missing role descriptions may resolve to distinct records or thread fallbacks in this MVP phase.

### 3. Forward-Only Status Progression
- Status hierarchy enforces forward progression:
  `UNKNOWN (0)` < `APPLIED (1)` < `OA_RECEIVED (2)` < `OA_COMPLETED (3)` < `INTERVIEW (4)` < `OFFER (5)` | `REJECTED (6)`
- Older or out-of-order emails cannot downgrade an active state:
  - `INTERVIEW` → `APPLIED` (Blocked)
  - `OFFER` → `APPLIED` (Blocked)
  - `REJECTED` → `APPLIED` (Blocked)

### 4. Idempotency Guard
- Each application stores `processedEmailIds: string[]`.
- Reprocessing the same email is detected and safely skipped (`SKIPPED_DUPLICATE`), preventing inflated counts or duplicate writes.

---

## 6. Environment Configuration

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `GMAIL_QUERY` | `newer_than:30d` | Gmail search query |
| `GMAIL_MAX_RESULTS` | `20` | Max emails to fetch from Gmail |
| `AWS_REGION` | `us-east-1` | AWS region for Bedrock & DynamoDB |
| `BEDROCK_MODEL_ID` | `us.anthropic.claude-3-haiku-20240307-v1:0` | Amazon Bedrock model ID |
| `AI_MAX_EMAILS` | `5` | Cost-control limit on emails sent to AI |
| `MAX_EMAIL_BODY_CHARS`| `12000` | Safety truncation limit for email bodies |
| `DYNAMODB_TABLE_NAME` | `CareerPilot-Applications` | DynamoDB table name |

---

## 7. How to Run

### Run Phase 3 Pipeline
```bash
npm run dev
```

### Run Verification & Unit Tests
```bash
npm run typecheck
npm run build
npx tsx C:/Users/HP/.gemini/antigravity-ide/brain/fa6be3b1-a5ac-4603-a718-314d25edc6f1/scratch/test_phase3.ts
```

---

## 8. Example Output

```text
========================================
CareerPilot — Phase 3: Application Tracker
========================================

Checking DynamoDB table "CareerPilot-Applications" in us-east-1...
DynamoDB table verified.

1. Ingesting emails from Gmail (query: "newer_than:30d", maxResults: 20)...
Fetched 10 emails from Gmail.
2. Running AI classification on 5 candidate emails (us.anthropic.claude-3-haiku-20240307-v1:0)...
3. Persisting application updates to Amazon DynamoDB...

========================================
CareerPilot — Phase 3 Execution Summary
========================================

Emails fetched: 10
Pre-filter skipped: 2
AI analyzed: 5
Career emails: 4
Application-related: 3
Job recommendations skipped: 1

DynamoDB Persistence:
  New applications: 2
  Updated applications: 1
  Skipped (non-app / duplicates): 2

Active Applications Ingested:
----------------------------------------
Company : Microsoft
Role    : Software Engineering Intern
Status  : OA_RECEIVED
Deadline: 2026-09-25
Emails  : 2
----------------------------------------
Company : Stripe
Role    : Backend Engineering Intern
Status  : INTERVIEW
Event   : 2026-09-28T15:00:00Z
Emails  : 1
----------------------------------------

========================================
```

---

## 9. Security & IAM Permissions

- **AWS IAM Permissions Required:**
  - `bedrock:InvokeModel`
  - `dynamodb:DescribeTable`
  - `dynamodb:GetItem`
  - `dynamodb:PutItem`
  - `dynamodb:Scan`
- **Zero Credential Exposure:** No credentials or tokens are logged or tracked in Git.

---

## 10. Phase Boundary

### Excluded from Phase 3 (By Design)
- Follow-up email draft generation.
- Automated email sending.
- React dashboard / frontend.
- Scheduled event triggers (EventBridge, Lambda, Step Functions).
