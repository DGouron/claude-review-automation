import { describe, it, expect, vi } from 'vitest'
import { SelfUpdateCliGateway } from '@/interface-adapters/gateways/selfUpdate.cli.gateway.js'

describe('SelfUpdateCliGateway', () => {
  describe('runGlobalUpdate', () => {
    it('should return success when npm update succeeds', async () => {
      const execFileAsync = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
      const gateway = new SelfUpdateCliGateway({ execFileAsync, killProcess: vi.fn(), spawnDaemon: vi.fn() })

      const result = await gateway.runGlobalUpdate()

      expect(result.success).toBe(true)
      expect(execFileAsync).toHaveBeenCalledWith('npm', ['update', '-g', 'reviewflow'])
    })

    it('should return failed with error message when npm update fails', async () => {
      const execFileAsync = vi.fn().mockRejectedValue(new Error('npm ERR! code EACCES'))
      const gateway = new SelfUpdateCliGateway({ execFileAsync, killProcess: vi.fn(), spawnDaemon: vi.fn() })

      const result = await gateway.runGlobalUpdate()

      expect(result.success).toBe(false)
      expect(result.error).toBe('npm ERR! code EACCES')
    })
  })

  describe('restartDaemon', () => {
    it('should spawn new daemon even without existing pid file', async () => {
      const spawnDaemonFn = vi.fn().mockReturnValue(1234)
      const gateway = new SelfUpdateCliGateway({
        execFileAsync: vi.fn(),
        killProcess: vi.fn(),
        spawnDaemon: spawnDaemonFn,
      })

      await gateway.restartDaemon()

      expect(spawnDaemonFn).toHaveBeenCalledWith(undefined)
    })
  })
})
