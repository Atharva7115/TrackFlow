import { GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getDocClient } from './dynamodb.js';
import type { ApplicationRecord } from './types.js';
import { config } from '../config/env.js';

export interface IApplicationRepository {
  findById(applicationId: string): Promise<ApplicationRecord | null>;
  save(record: ApplicationRecord): Promise<void>;
  listAll(): Promise<ApplicationRecord[]>;
}

export class DynamoApplicationRepository implements IApplicationRepository {
  constructor(private readonly tableName: string = config.dynamoDbTableName) {}

  async findById(applicationId: string): Promise<ApplicationRecord | null> {
    const docClient = getDocClient();
    const result = await docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { applicationId },
      })
    );

    return (result.Item as ApplicationRecord) || null;
  }

  async save(record: ApplicationRecord): Promise<void> {
    const docClient = getDocClient();
    await docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: record,
      })
    );
  }

  async listAll(): Promise<ApplicationRecord[]> {
    const docClient = getDocClient();
    const result = await docClient.send(
      new ScanCommand({
        TableName: this.tableName,
      })
    );

    return (result.Items as ApplicationRecord[]) || [];
  }
}

export const applicationRepository = new DynamoApplicationRepository();
