import { createGuard } from '@/shared/foundation/guard.base.js'
import { npmRegistryResponseSchema, type NpmRegistryResponse } from '@/entities/packageVersion/packageVersion.schema.js'

const npmRegistryResponseGuard = createGuard(npmRegistryResponseSchema)

export function parseNpmRegistryResponse(data: unknown): NpmRegistryResponse {
  return npmRegistryResponseGuard.parse(data)
}

export function safeParseNpmRegistryResponse(data: unknown) {
  return npmRegistryResponseGuard.safeParse(data)
}

export function isValidNpmRegistryResponse(data: unknown): data is NpmRegistryResponse {
  return npmRegistryResponseGuard.isValid(data)
}
