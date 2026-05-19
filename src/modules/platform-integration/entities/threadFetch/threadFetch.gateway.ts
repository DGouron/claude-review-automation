import type { ReviewContextThread } from '@/entities/reviewContext/reviewContext.js'

export interface ThreadFetchGateway {
  fetchThreads(projectPath: string, mergeRequestNumber: number): ReviewContextThread[]
}
