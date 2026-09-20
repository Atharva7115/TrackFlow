/**
 * Test Safety Harness:
 * Overrides all AWS, Gmail, and DynamoDB environment variables with dummy values
 * to guarantee unit tests never interact with real cloud resources or credentials.
 */
process.env.AWS_ACCESS_KEY_ID = 'test-not-real';
process.env.AWS_SECRET_ACCESS_KEY = 'test-not-real';
process.env.AWS_SESSION_TOKEN = 'test-not-real';
process.env.AWS_EC2_METADATA_DISABLED = 'true';
process.env.AWS_DEFAULT_REGION = 'us-east-1';
process.env.AWS_REGION = 'us-east-1';
process.env.GMAIL_TOKEN_PATH = './non-existent-test-token.json';
process.env.GMAIL_CREDENTIALS_PATH = './non-existent-test-credentials.json';
process.env.GMAIL_AUTH_MODE = 'local';
process.env.DYNAMODB_TABLE_NAME = 'CareerPilot-TEST-DO-NOT-USE';
