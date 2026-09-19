import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { config } from '../config/env.js';

let dynamoClient: DynamoDBClient | null = null;
let docClient: DynamoDBDocumentClient | null = null;

/**
 * Returns the DynamoDB Document Client instance.
 */
export function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    dynamoClient = new DynamoDBClient({ region: config.awsRegion });
    docClient = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }
  return docClient;
}

/**
 * Verifies that the DynamoDB table exists and is active.
 * Does NOT auto-create tables; throws an actionable error if the table is missing.
 */
export async function verifyTableExists(tableName: string = config.dynamoDbTableName): Promise<boolean> {
  const client = dynamoClient || new DynamoDBClient({ region: config.awsRegion });

  try {
    const res = await client.send(new DescribeTableCommand({ TableName: tableName }));
    const status = res.Table?.TableStatus;
    if (status === 'ACTIVE' || status === 'UPDATING' || status === 'CREATING') {
      return true;
    }
    throw new Error(`DynamoDB table '${tableName}' status is '${status}'. Expected ACTIVE.`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('ResourceNotFoundException') || (err as { name?: string }).name === 'ResourceNotFoundException') {
      throw new Error(
        `\n[CareerPilot Error] DynamoDB table '${tableName}' was not found in region '${config.awsRegion}'.\n\n` +
        `Please create the table before running CareerPilot Phase 3:\n\n` +
        `Using AWS CLI:\n` +
        `aws dynamodb create-table \\\n` +
        `  --table-name ${tableName} \\\n` +
        `  --attribute-definitions AttributeName=applicationId,AttributeType=S \\\n` +
        `  --key-schema AttributeName=applicationId,KeyType=HASH \\\n` +
        `  --billing-mode PAY_PER_REQUEST \\\n` +
        `  --region ${config.awsRegion}\n\n` +
        `Or create it in the AWS Management Console with Partition Key 'applicationId' (String).\n`
      );
    }

    if (message.includes('UnrecognizedClientException') || message.includes('CredentialsProviderError')) {
      throw new Error(
        `\n[CareerPilot Error] AWS credentials not found or invalid while connecting to DynamoDB.\n` +
        `Please configure AWS credentials using 'aws configure' or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.\n`
      );
    }

    throw new Error(`[CareerPilot Error] Failed to connect to DynamoDB table '${tableName}': ${message}`);
  }
}
