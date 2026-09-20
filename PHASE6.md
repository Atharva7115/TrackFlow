# CareerPilot TrackFlow — Phase 6: Automated Scheduled Pipeline

Welcome to Phase 6! This guide walks you step-by-step through deploying CareerPilot's automated 3-hour scheduled pipeline to AWS Lambda and EventBridge using AWS SAM and Windows PowerShell.

---

## 1. What Phase 6 Does

In Phases 1–5, CareerPilot ingested Gmail messages, analyzed applications with Amazon Bedrock, saved state to DynamoDB, generated follow-up drafts, and displayed them on a dashboard. However, a human had to run a command manually each time.

**Phase 6 makes the entire ingestion pipeline run automatically in the cloud every 3 hours.**

```
┌───────────────────────────┐
│ Amazon EventBridge Rule   │ (Triggers every 3 hours: rate(3 hours))
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ AWS Lambda Function       │ (CareerPilot-ScheduledPipeline: Node.js 22.x ESM)
│                           │
│ 1. Loads OAuth Secret ───►│ AWS Secrets Manager (CareerPilot/GmailOAuth)
│ 2. Scans Processed IDs ──►│ Amazon DynamoDB (CareerPilot-Applications)
│ 3. Ingests Recent Emails ─►│ Gmail API (Strict Read-Only)
│ 4. Deduplicates (Pre-AI)  │ (0 Bedrock calls for known/ignored emails)
│ 5. Analyzes New Emails ──►│ Amazon Bedrock (Claude 3 Haiku)
│ 6. Upserts Records ──────►│ Amazon DynamoDB (CareerPilot-Applications)
│ 7. Follow-up Intel/Drafts │ (Generates AI drafts only for new eligible apps)
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ TrackFlow Public Web UI   │
│ http://localhost:3001     │ (Always shows fresh data on refresh!)
└───────────────────────────┘
```

---

## 2. Prerequisites & Tools to Install

Open **Windows PowerShell** as Administrator and ensure you have the following installed:

### 1. AWS SAM CLI
Install using Windows Package Manager (`winget`):
```powershell
winget install Amazon.SAMCLI
```
*(After installation, restart your PowerShell terminal and verify by running `sam --version`)*.

### 2. AWS CLI & Credentials
Verify that your AWS CLI is configured with your AWS credentials:
```powershell
aws configure
```
- **Default region name**: `us-east-1`
- **Default output format**: `json`

Verify connection:
```powershell
aws sts get-caller-identity
```

### 3. Google Cloud OAuth Consent Screen ("In production")
> [!IMPORTANT]
> If your Google Cloud OAuth Consent Screen is in **"Testing"** mode, Google automatically invalidates refresh tokens after **7 days**, which will cause automated runs to fail with `invalid_grant`.
>
> **Action Required:**
> 1. Go to [Google Cloud Console](https://console.cloud.google.com/) -> **APIs & Services** -> **OAuth consent screen**.
> 2. Under **Publishing status**, click **"PUBLISH APP"** to switch status to **In production**.
> 3. (You do NOT need Google verification for personal use; simply click through the warning).

### 4. Amazon Bedrock Model Access
Ensure Amazon Bedrock model access is enabled:
1. Go to [AWS Bedrock Console](https://console.aws.amazon.com/bedrock/) in region `us-east-1`.
2. Navigate to **Model access** -> Ensure **Anthropic Claude 3 Haiku** is granted/active.

---

## 3. Step 1: Upload Gmail OAuth Credentials to AWS Secrets Manager

To ensure your Google OAuth credentials and refresh token are secure and never stored in git or Lambda code, we store them in **AWS Secrets Manager**.

Run the following PowerShell commands in your TrackFlow repository root folder:

```powershell
# 1. Read existing local credentials.json and token.json
$creds = Get-Content credentials.json | ConvertFrom-Json
$token = Get-Content token.json | ConvertFrom-Json
$clientId = if ($creds.installed) { $creds.installed.client_id } else { $creds.web.client_id }
$clientSecret = if ($creds.installed) { $creds.installed.client_secret } else { $creds.web.client_secret }

# 2. Build the JSON payload object
$secretObj = @{
    client_id     = $clientId
    client_secret = $clientSecret
    refresh_token = $token.refresh_token
    access_token  = $token.access_token
    token_type    = if ($token.token_type) { $token.token_type } else { "Bearer" }
    expiry_date   = $token.expiry_date
}

# 3. Write temporary secret file (UTF-8 without BOM)
$secretJson = $secretObj | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText("$PWD\secret.json", $secretJson, (New-Object System.Text.UTF8Encoding($false)))

# 4. Upload to AWS Secrets Manager in us-east-1
try {
    aws secretsmanager create-secret `
      --name "CareerPilot/GmailOAuth" `
      --description "CareerPilot Gmail OAuth credentials for Lambda" `
      --secret-string file://secret.json `
      --region us-east-1
    Write-Host "Secret created successfully!" -ForegroundColor Green
} catch {
    Write-Host "Secret may already exist, updating secret value..." -ForegroundColor Yellow
    aws secretsmanager put-secret-value `
      --secret-id "CareerPilot/GmailOAuth" `
      --secret-string file://secret.json `
      --region us-east-1
    Write-Host "Secret updated successfully!" -ForegroundColor Green
}

# 5. Clean up temporary secret file
Remove-Item -Path "$PWD\secret.json" -Force
```

---

## 4. Step 2: Build with AWS SAM

Compile and bundle the TypeScript ESM Lambda function:

```powershell
sam build
```

SAM uses `esbuild` to produce an optimized Node.js 22 bundle in `.aws-sam/build/`.

---

## 5. Step 3: Deploy with AWS SAM

Run the guided deployment:

```powershell
sam deploy --guided
```

When prompted, provide the following answers:
- **Stack Name [sam-app]**: `careerpilot-phase6`
- **AWS Region [us-east-1]**: `us-east-1`
- **Confirm changes before deploy [y/N]**: `y`
- **Allow SAM CLI IAM role creation [Y/n]**: `Y`
- **Disable rollback [y/N]**: `N`
- **Save arguments to configuration file [Y/n]**: `Y`
- **SAM configuration file [samconfig.toml]**: *(Press Enter)*
- **SAM configuration environment [default]**: *(Press Enter)*

Review the CloudFormation changeset and press `y` to execute deployment.

---

## 6. Step 4: Verification and Testing

### 1. Run Offline Unit Tests
Verify that all 4 test suites pass offline with 0 AWS / Bedrock calls:
```powershell
npm test
```

### 2. Test Local Scheduled Execution
Run the exact Lambda handler on your local machine:
```powershell
npm run local:scheduled
```

### 3. Test Deployed Cloud Lambda Function
Trigger the deployed Lambda function in AWS:
```powershell
aws lambda invoke `
  --function-name CareerPilot-ScheduledPipeline `
  --region us-east-1 `
  response.json

Get-Content response.json
```
*(You will see the structured JSON report with metrics).*

### 4. Tail CloudWatch Logs in Real-Time
Stream logs from the automated Lambda function:
```powershell
sam logs -n CareerPilotPipelineFunction --stack-name careerpilot-phase6 --tail
```

### 5. Verify Results in DynamoDB & Dashboard
Launch the TrackFlow dashboard locally:
```powershell
npm run server
```
Open **`http://localhost:3001`** in your browser and click **"🔄 Refresh Data"** to view tracked applications and AI-generated follow-up drafts.

---

## 7. How to Adjust the Schedule

To change how frequently the pipeline runs, open `template.yaml` and update the `Schedule` property:

```yaml
      Events:
        ThreeHourSchedule:
          Type: Schedule
          Properties:
            Schedule: rate(3 hours)    # Change to rate(1 hour), rate(6 hours), or rate(1 day)
            Enabled: true
```

After modifying `template.yaml`, redeploy:
```powershell
sam build; sam deploy
```

---

## 8. Troubleshooting Guide

| Error / Symptom | Root Cause | Solution |
|---|---|---|
| `AccessDeniedException` on Bedrock | IAM policy missing or model access not granted in Bedrock console | 1. Go to AWS Bedrock Console -> Model access -> Enable Claude 3 Haiku.<br>2. Ensure your IAM role has `bedrock:InvokeModel`. |
| `ResourceNotFoundException: Model ID ... not found` | Region mismatch or incorrect model ID | Ensure `AWS_REGION=us-east-1` and model ID is `us.anthropic.claude-3-haiku-20240307-v1:0` or `anthropic.claude-3-haiku-20240307-v1:0`. |
| `ResourceNotFoundException: Secrets Manager secret ... not found` | The secret `CareerPilot/GmailOAuth` was not created in `us-east-1` | Re-run the PowerShell upload script in Section 3 in region `us-east-1`. |
| `invalid_grant` / Token expired | Google OAuth Consent Screen is in "Testing" mode (token expired after 7 days) | 1. Set Google OAuth Consent Screen to **"In production"** in Google Cloud Console.<br>2. Re-run `npm run dev` locally to generate a fresh `token.json`.<br>3. Re-upload the secret using the script in Section 3. |
| `ResourceNotFoundException: Table CareerPilot-Applications not found` | DynamoDB table is in another region or not created | Create the table `CareerPilot-Applications` with Partition Key `applicationId` (String) in `us-east-1`. |
| `EROFS: read-only file system` | Code attempted to write to `./token.json` in Lambda | Ensure `GMAIL_SECRET_NAME` is configured so Lambda loads credentials from Secrets Manager without disk writes. |

---

## 9. Cleanup & Teardown

If you ever want to remove all Phase 6 cloud resources:

1. **Delete SAM CloudFormation Stack**:
   ```powershell
   sam delete --stack-name careerpilot-phase6 --region us-east-1
   ```
2. **Delete OAuth Secret from Secrets Manager**:
   ```powershell
   aws secretsmanager delete-secret `
     --secret-id "CareerPilot/GmailOAuth" `
     --force-delete-without-recovery `
     --region us-east-1
   ```

*(Your DynamoDB table `CareerPilot-Applications` will remain intact since it was created outside this stack).*
