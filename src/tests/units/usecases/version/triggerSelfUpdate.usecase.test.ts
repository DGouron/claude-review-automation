import { describe, it, expect } from 'vitest'
import { triggerSelfUpdate } from '@/usecases/version/triggerSelfUpdate.usecase.js'
import { StubSelfUpdateCommand } from '@/tests/stubs/selfUpdate.stub.js'

describe('triggerSelfUpdate usecase', () => {
  it('should return started when update succeeds', async () => {
    const selfUpdateCommand = new StubSelfUpdateCommand(true)

    const result = await triggerSelfUpdate({ selfUpdateCommand })

    expect(result).toEqual({ status: 'started' })
  })

  it('should return failed with error message when update fails', async () => {
    const selfUpdateCommand = new StubSelfUpdateCommand(false, 'npm update failed')

    const result = await triggerSelfUpdate({ selfUpdateCommand })

    expect(result).toEqual({ status: 'failed', error: 'npm update failed' })
  })

  it('should return failed with default error when no error message provided', async () => {
    const selfUpdateCommand = new StubSelfUpdateCommand(false)

    const result = await triggerSelfUpdate({ selfUpdateCommand })

    expect(result).toEqual({ status: 'failed', error: 'Unknown error' })
  })
})
