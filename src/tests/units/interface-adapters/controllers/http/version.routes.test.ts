import { describe, it, expect, beforeEach } from 'vitest'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { versionRoutes } from '@/interface-adapters/controllers/http/version.routes.js'
import { StubPackageVersionGateway } from '@/tests/stubs/packageVersion.stub.js'
import { StubVersionCache } from '@/tests/stubs/versionCache.stub.js'
import { StubSelfUpdateCommand } from '@/tests/stubs/selfUpdate.stub.js'
import { checkVersion } from '@/usecases/version/checkVersion.usecase.js'
import { triggerSelfUpdate } from '@/usecases/version/triggerSelfUpdate.usecase.js'

describe('version routes', () => {
  let application: FastifyInstance

  describe('GET /api/version/check', () => {
    beforeEach(async () => {
      const packageVersionGateway = new StubPackageVersionGateway('2.0.0')
      const versionCache = new StubVersionCache(null, true)
      const selfUpdateCommand = new StubSelfUpdateCommand(true)

      application = Fastify()
      await application.register(versionRoutes, {
        checkVersion,
        triggerSelfUpdate,
        currentVersion: '1.0.0',
        packageVersionGateway,
        versionCache,
        selfUpdateCommand,
      })
      await application.ready()
    })

    it('should return version check result', async () => {
      const response = await application.inject({
        method: 'GET',
        url: '/api/version/check',
      })

      const body = JSON.parse(response.body)
      expect(response.statusCode).toBe(200)
      expect(body.currentVersion).toBe('1.0.0')
      expect(body.latestVersion).toBe('2.0.0')
      expect(body.updateAvailable).toBe(true)
    })
  })

  describe('POST /api/version/update', () => {
    it('should return started on successful update', async () => {
      const selfUpdateCommand = new StubSelfUpdateCommand(true)

      application = Fastify()
      await application.register(versionRoutes, {
        checkVersion,
        triggerSelfUpdate,
        currentVersion: '1.0.0',
        packageVersionGateway: new StubPackageVersionGateway('2.0.0'),
        versionCache: new StubVersionCache(null, true),
        selfUpdateCommand,
      })
      await application.ready()

      const response = await application.inject({
        method: 'POST',
        url: '/api/version/update',
      })

      const body = JSON.parse(response.body)
      expect(response.statusCode).toBe(200)
      expect(body.status).toBe('started')
    })

    it('should return 500 on failed update', async () => {
      const selfUpdateCommand = new StubSelfUpdateCommand(false, 'Permission denied')

      application = Fastify()
      await application.register(versionRoutes, {
        checkVersion,
        triggerSelfUpdate,
        currentVersion: '1.0.0',
        packageVersionGateway: new StubPackageVersionGateway('2.0.0'),
        versionCache: new StubVersionCache(null, true),
        selfUpdateCommand,
      })
      await application.ready()

      const response = await application.inject({
        method: 'POST',
        url: '/api/version/update',
      })

      const body = JSON.parse(response.body)
      expect(response.statusCode).toBe(500)
      expect(body.status).toBe('failed')
      expect(body.error).toBe('Permission denied')
    })
  })
})
