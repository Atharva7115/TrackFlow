import { GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getDocClient } from './dynamodb.js';
import type { ApplicationRecord } from './types.js';
import { config } from '../config/env.js';

export const META_IGNORED_EMAILS_KEY = 'META#ignoredEmails';
const MAX_IGNORED_EMAILS = 1000;

export interface IApplicationRepository {
  findById(applicationId: string): Promise<ApplicationRecord | null>;
  save(record: ApplicationRecord): Promise<void>;
  listAll(): Promise<ApplicationRecord[]>;
  getIgnoredEmailIds(): Promise<string[]>;
  addIgnoredEmailIds(emailIds: string[]): Promise<void>;
}

export class DynamoApplicationRepository implements IApplicationRepository {
  constructor(private readonly tableName: string = config.dynamoDbTableName) {}

  async findById(applicationId: string): Promise<ApplicationRecord | null> {
    if (applicationId.startsWith('META#')) {
      return null;
    }

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

  /**
   * Scans all application records with DynamoDB pagination (LastEvaluatedKey),
   * strictly excluding metadata items whose applicationId starts with 'META#'.
   */
  async listAll(): Promise<ApplicationRecord[]> {
    const docClient = getDocClient();
    const allRecords: ApplicationRecord[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined = undefined;

    do {
      const result: { Items?: Record<string, unknown>[]; LastEvaluatedKey?: Record<string, unknown> } = await docClient.send(
        new ScanCommand({
          TableName: this.tableName,
          ExclusiveStartKey: exclusiveStartKey,
        })
      );

      if (result.Items) {
        for (const item of result.Items) {
          const appId = item.applicationId as string | undefined;
          if (appId && !appId.startsWith('META#')) {
            allRecords.push(item as unknown as ApplicationRecord);
          }
        }
      }

      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return allRecords;
  }

  /**
   * Retrieves the list of non-application / job recommendation email IDs
   * stored in the special META#ignoredEmails item.
   */
  async getIgnoredEmailIds(): Promise<string[]> {
    const docClient = getDocClient();
    const result = await docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { applicationId: META_IGNORED_EMAILS_KEY },
      })
    );

    const item = result.Item;
    if (item && Array.isArray(item.ignoredEmailIds)) {
      return item.ignoredEmailIds as string[];
    }
    return [];
  }

  /**
   * Appends newly classified non-application email IDs to the META#ignoredEmails item,
   * capping the list at the most recent 1000 IDs and dropping the oldest.
   */
  async addIgnoredEmailIds(newIds: string[]): Promise<void> {
    if (newIds.length === 0) return;

    const existing = await this.getIgnoredEmailIds();
    const combined = [...existing];

    for (const id of newIds) {
      if (!combined.includes(id)) {
        combined.push(id);
      }
    }

    const capped = combined.length > MAX_IGNORED_EMAILS
      ? combined.slice(combined.length - MAX_IGNORED_EMAILS)
      : combined;

    const docClient = getDocClient();
    await docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          applicationId: META_IGNORED_EMAILS_KEY,
          ignoredEmailIds: capped,
          updatedAt: new Date().toISOString(),
        },
      })
    );
  }
}

export const applicationRepository = new DynamoApplicationRepository();
