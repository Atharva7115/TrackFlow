# CareerPilot — Internship & Job Application Tracker

> **Current Architecture: Phases 1–6 Complete + Local Demo Mode**
> 
> *CareerPilot ingests career emails via Gmail API, classifies job applications using Strands Agents SDK + Amazon Bedrock (Claude 3 Haiku), tracks state in Amazon DynamoDB with forward-only status progression, evaluates follow-up eligibility, generates zero-hallucination follow-up drafts, and surfaces a human-in-the-loop dashboard via AWS Lambda, API Gateway, and Amplify Hosting.*

---

## ⚡ Quick Start: Demo Mode (No AWS or Gmail Credentials Required)

Demo Mode allows anyone to clone the repository and run the full end-to-end application workflow and dashboard locally using representative sample emails and deterministic mock AI responses. **Zero AWS credentials, zero Gmail OAuth, and 0 Bedrock API calls are required.**

```bash
# 1. Clone & Install Dependencies
git clone https://github.com/Atharva7115/TrackFlow.git
cd TrackFlow
npm install

# 2. Run Demo Mode
npm run demo
```

- **Open Dashboard:** Navigate to [http://localhost:3001](http://localhost:3001) in your browser.
- **What Demo Mode does:**
  - Loads 4 representative sample career emails (Google, Microsoft, Amazon, Meta).
  - Processes classifications, status progression, and assessment deadlines locally.
  - Evaluates follow-up eligibility and generates a follow-up draft for Meta.
  - Launches the local HTTP dashboard server on port 3001.
  - Demonstrates interactive UI features: **Copy Draft**, **Mark as Sent**, and **Dismiss**.

---

## 1. Architecture Pipeline

```text
Production Pipeline:
Gmail API (OAuth 2.0 Read-Only)
   │
   ▼
Lightweight Pre-Filter (Skip transactional/security noise)
   │
   ▼
Strands Agent + Amazon Bedrock (Classify stage, deadline, event date)
   │
   ▼
Amazon DynamoDB (Application State & Memory Window deduplication)
   │
   ▼
Follow-up Intelligence Evaluator (Check waiting periods & unexpired OA deadlines)
   │
   ▼
Strands Agent + Amazon Bedrock (Generate zero-hallucination follow-up draft)
   │
   ▼
AWS Lambda + API Gateway (Serverless REST API)
   │
   ▼
AWS Amplify Candidate Dashboard (Human-in-the-Loop review & copy draft)

----------------------------------------------------------------------
Demo Mode Pipeline (No Credentials Required):
Sample Emails ──> Mock Classifier ──> Application Service ──> Demo Local Store ──> API ──> Dashboard UI
```

---

## 2. Tech Stack

- **Runtime:** Node.js (v18+)
- **Language:** TypeScript (Strict mode, ES2022 / NodeNext)
- **Email Ingestion:** `googleapis` (Gmail API v1)
- **AI Agent Framework:** `@strands-agents/sdk` (Strands Agents SDK for TypeScript)
- **Foundation Models:** Amazon Bedrock (`us.anthropic.claude-3-haiku-20240307-v1:0`)
- **Database:** Amazon DynamoDB (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`)
- **Serverless & API:** AWS Lambda, Amazon API Gateway, AWS SAM (`template.yaml`)
- **Frontend Hosting:** AWS Amplify Hosting (`public/`)
- **Schema Validation:** `zod`
- **Environment & CLI:** `dotenv`, `tsx`

---

## 3. Environment Configuration

Copy `.env.example` to `.env` for live production ingestion:

| Variable | Default | Description |
|---|---|---|
| `GMAIL_QUERY` | `newer_than:30d` | Gmail search query |
| `GMAIL_MAX_RESULTS` | `20` | Max emails to fetch from Gmail |
| `AWS_REGION` | `us-east-1` | AWS region for Bedrock & DynamoDB |
| `BEDROCK_MODEL_ID` | `us.anthropic.claude-3-haiku-20240307-v1:0` | Amazon Bedrock model ID |
| `AI_MAX_EMAILS` | `5` | Cost-control limit on emails sent to AI |
| `MAX_EMAIL_BODY_CHARS`| `12000` | Safety truncation limit for email bodies |
| `DYNAMODB_TABLE_NAME` | `CareerPilot-Applications` | DynamoDB table name |
| `FOLLOWUP_DAYS_APPLIED` | `14` | Inactivity threshold for APPLIED stage follow-up |
| `FOLLOWUP_DAYS_OA_COMPLETED` | `7` | Inactivity threshold for OA_COMPLETED stage follow-up |
| `FOLLOWUP_DAYS_INTERVIEW` | `7` | Inactivity threshold for INTERVIEW stage follow-up |

---

## 4. How to Run

### Run Local Demo Mode (Zero Credentials Required)
```bash
npm run demo
```

### Run Full Test Suite
```bash
npm test
```

### Run Production CLI Pipeline (Requires AWS & Gmail Credentials)
```bash
npm run dev
```

### Run Local Development Server
```bash
npm run server
```

### Run Typecheck & Build
```bash
npm run typecheck
npm run build
```

---

## 5. Security & Human-in-the-Loop Safeguards

- **Human-in-the-Loop Only:** CareerPilot **NEVER** automatically sends emails. "Mark as Sent" records candidate manual action in DynamoDB.
- **Zero Credential Exposure:** `.env`, `credentials.json`, `token.json`, and `.aws-sam/` are strictly ignored by Git.
