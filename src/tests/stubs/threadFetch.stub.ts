import type { ThreadFetchGateway } from '@/modules/platform-integration/entities/threadFetch/threadFetch.gateway.js';
import type { ReviewContextThread } from '@/modules/review-execution/entities/reviewContext/reviewContext.js';

export class InMemoryThreadFetchGateway implements ThreadFetchGateway {
  private threads: ReviewContextThread[] = [];

  fetchThreads(): ReviewContextThread[] {
    return this.threads;
  }

  setThreads(threads: ReviewContextThread[]): void {
    this.threads = threads;
  }
}
