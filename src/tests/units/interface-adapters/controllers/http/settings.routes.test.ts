import { describe, it, expect, beforeEach } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { settingsRoutes } from '@/interface-adapters/controllers/http/settings.routes.js'
import { setModel } from '@/frameworks/settings/runtimeSettings.js'

describe('settings routes', () => {
  let application: FastifyInstance

  beforeEach(async () => {
    application = Fastify()
    await application.register(settingsRoutes)
    await application.ready()
  })

  describe('GET /api/settings/model', () => {
    it('should return current model', async () => {
      setModel('sonnet')

      const response = await application.inject({
        method: 'GET',
        url: '/api/settings/model',
      })

      const body = JSON.parse(response.body)
      expect(response.statusCode).toBe(200)
      expect(body.model).toBe('sonnet')
    })
  })
})
