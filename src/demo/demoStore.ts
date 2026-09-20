import type { IApplicationRepository } from '../db/applicationRepository.js';
import type { ApplicationRecord } from '../db/types.js';

/**
 * Isolated In-Memory Repository for Demo Mode.
 * Fully satisfies IApplicationRepository interface without requiring DynamoDB or AWS credentials.
 */
export class DemoApplicationRepository implements IApplicationRepository {
  private store = new Map<string, ApplicationRecord>();
  private ignoredEmailIds: string[] = [];

  async findById(applicationId: string): Promise<ApplicationRecord | null> {
    if (applicationId.startsWith('META#')) return null;
    return this.store.get(applicationId) || null;
  }

  async save(record: ApplicationRecord): Promise<void> {
    this.store.set(record.applicationId, record);
  }

  async listAll(): Promise<ApplicationRecord[]> {
    return Array.from(this.store.values()).filter((r) => !r.applicationId.startsWith('META#'));
  }

  async getIgnoredEmailIds(): Promise<string[]> {
    return [...this.ignoredEmailIds];
  }

  async addIgnoredEmailIds(emailIds: string[]): Promise<void> {
    for (const id of emailIds) {
      if (!this.ignoredEmailIds.includes(id)) {
        this.ignoredEmailIds.push(id);
      }
    }
  }

  clear(): void {
    this.store.clear();
    this.ignoredEmailIds = [];
  }
}

export const demoRepository = new DemoApplicationRepository();
