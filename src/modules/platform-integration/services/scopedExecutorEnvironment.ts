export const EXECUTOR_TOKEN_ENV_KEY = 'REVIEWFLOW_EXECUTOR_TOKEN'

export const ENV_ALLOWLIST = ['PATH', 'HOME', 'GLAB_CONFIG_DIR', 'LANG'] as const

export type AllowlistedEnvKey = (typeof ENV_ALLOWLIST)[number]

export type ScopedExecutorEnv = Partial<Record<AllowlistedEnvKey, string>>

export class MissingExecutorTokenError extends Error {
  constructor() {
    super(
      `Executor service token (${EXECUTOR_TOKEN_ENV_KEY}) is absent or empty; refusing to start with the ambient token.`,
    )
    this.name = 'MissingExecutorTokenError'
  }
}

export interface ExecutorFileWriter {
  write(path: string, contents: string): void
}

export interface BuildScopedExecutorEnvironmentInput {
  parentEnv: Record<string, string | undefined>
  isolatedDir: string
  fileWriter: ExecutorFileWriter
}

export interface ScopedExecutorEnvironment {
  env: ScopedExecutorEnv
  configFilePath: string
}

function renderGlabConfig(token: string): string {
  return [
    'hosts:',
    '  gitlab.com:',
    `    token: ${token}`,
    '    api_protocol: https',
    '',
  ].join('\n')
}

export function buildScopedExecutorEnvironment(
  input: BuildScopedExecutorEnvironmentInput,
): ScopedExecutorEnvironment {
  const token = input.parentEnv[EXECUTOR_TOKEN_ENV_KEY]?.trim()
  if (!token) {
    throw new MissingExecutorTokenError()
  }

  const home = `${input.isolatedDir}/home`
  const glabConfigDir = `${input.isolatedDir}/glab-config`

  const env: ScopedExecutorEnv = {
    HOME: home,
    GLAB_CONFIG_DIR: glabConfigDir,
  }

  const path = input.parentEnv.PATH
  if (path) env.PATH = path

  const lang = input.parentEnv.LANG
  if (lang) env.LANG = lang

  const configFilePath = `${glabConfigDir}/glab-cli/config.yml`
  input.fileWriter.write(configFilePath, renderGlabConfig(token))

  return { env, configFilePath }
}
