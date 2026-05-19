import type { SelfUpdateResult } from '@/modules/cli-configuration/entities/packageVersion/packageVersion.js'
import type { SelfUpdateCommandPort } from '@/modules/cli-configuration/entities/packageVersion/selfUpdateCommand.gateway.js'

export interface TriggerSelfUpdateDependencies {
  selfUpdateCommand: SelfUpdateCommandPort
}

export async function triggerSelfUpdate(
  dependencies: TriggerSelfUpdateDependencies,
): Promise<SelfUpdateResult> {
  const { selfUpdateCommand } = dependencies

  const updateResult = await selfUpdateCommand.runGlobalUpdate()

  if (updateResult.success) {
    return { status: 'started' }
  }

  if (updateResult.permissionDenied) {
    return { status: 'permission-denied', command: 'sudo npm update -g reviewflow' }
  }

  return { status: 'failed', error: updateResult.error ?? 'Unknown error' }
}
