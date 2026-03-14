export type VersionCheckResult = {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  checkedAt: string
}

export type SelfUpdateResult =
  | { status: 'started' }
  | { status: 'updated'; previousVersion: string; newVersion: string }
  | { status: 'failed'; error: string }

export type UpdateStatus = 'idle' | 'checking' | 'updating' | 'restarting' | 'failed'
