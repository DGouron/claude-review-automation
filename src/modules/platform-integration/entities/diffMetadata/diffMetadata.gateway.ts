import type { DiffMetadata } from '@/entities/reviewContext/reviewContext.js'

export interface DiffMetadataFetchGateway {
  fetchDiffMetadata(projectPath: string, mergeRequestNumber: number): DiffMetadata
}
