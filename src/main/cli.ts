#!/usr/bin/env node

import { readFileSync, realpathSync, existsSync, mkdirSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { parseCliArgs } from '@/cli/parseCliArgs.js';
import { validateDependencies, checkDependency } from '@/shared/services/dependencyChecker.js';
import { startServer } from '@/main/server.js';
import { StartDaemonUseCase, type StartDaemonDependencies } from '@/usecases/cli/startDaemon.usecase.js';
import { StopDaemonUseCase, type StopDaemonDependencies } from '@/usecases/cli/stopDaemon.usecase.js';
import { QueryStatusUseCase, type QueryStatusDependencies } from '@/usecases/cli/queryStatus.usecase.js';
import { ReadLogsUseCase, type ReadLogsDependencies } from '@/usecases/cli/readLogs.usecase.js';
import { FollowupImportantsUseCase } from '@/usecases/cli/followupImportants.usecase.js';
import { readPidFile, writePidFile, removePidFile } from '@/shared/services/pidFileManager.js';
import { isProcessRunning } from '@/shared/services/processChecker.js';
import { PID_FILE_PATH, LOG_FILE_PATH } from '@/shared/services/daemonPaths.js';
import { spawnDaemon } from '@/shared/services/daemonSpawner.js';
import { logFileExists, readLastLines, watchLogFile } from '@/shared/services/logFileReader.js';
import { green, red, yellow, dim, bold } from '@/shared/services/ansiColors.js';
import { formatStartupBanner } from '@/cli/startupBanner.js';
import { openInBrowser } from '@/shared/services/browserOpener.js';
import { loadConfig } from '@/frameworks/config/configLoader.js';
import { getConfigDir } from '@/shared/services/configDir.js';
import { generateWebhookSecret, truncateSecret } from '@/shared/services/secretGenerator.js';
import { DiscoverRepositoriesUseCase, type DiscoveredRepository, type DiscoverRepositoriesResult } from '@/usecases/cli/discoverRepositories.usecase.js';
import { ConfigureMcpUseCase, type ConfigureMcpResult } from '@/usecases/cli/configureMcp.usecase.js';
import { WriteInitConfigUseCase, type WriteInitConfigInput, type WriteInitConfigResult } from '@/usecases/cli/writeInitConfig.usecase.js';
import { ValidateConfigUseCase } from '@/usecases/cli/validateConfig.usecase.js';
import { AddRepositoriesToConfigUseCase } from '@/usecases/cli/addRepositoriesToConfig.usecase.js';
import { formatInitSummary, type InitSummaryInput } from '@/cli/formatters/initSummary.js';
import { resolveMcpServerPath } from '@/frameworks/claude/claudeInvoker.js';
import { checkInitPrerequisites, type PrerequisitesResult } from '@/usecases/cli/checkInitPrerequisites.js';

const currentDir = dirname(fileURLToPath(import.meta.url));

function readVersion(): string {
  const packageJsonPath = join(currentDir, '..', '..', 'package.json');
  const raw = readFileSync(packageJsonPath, 'utf-8');
  return JSON.parse(raw).version;
}

function printHelp(): void {
  console.log(`reviewflow - Automated code review for GitLab/GitHub

Usage:
  reviewflow [command] [options]

Commands:
  init                     Interactive setup wizard
  start                    Start the review server (default)
  stop                     Stop the running daemon
  status                   Show server status
  logs                     Show daemon logs
  validate                 Validate configuration
  discover                 Scan and add repositories to existing config
  followup-importants      Trigger followups for pending-approval MRs with Important issues

Discover options:
  --scan-path <path>       Custom scan path (repeatable)
  --max-depth <n>          Max directory depth (default: 3)

Init options:
  -y, --yes                Accept all defaults (non-interactive)
  --skip-mcp               Skip MCP server configuration
  --show-secrets           Display full webhook secrets
  --scan-path <path>       Custom scan path (repeatable)

Start options:
  -d, --daemon             Run as background daemon
  -p, --port <port>        Server port (default: from config)
  -o, --open               Open dashboard in default browser
  --skip-dependency-check  Skip external dependency verification

Stop options:
  -f, --force              Force stop (SIGKILL instead of SIGTERM)

Status options:
  --json                   Output status as JSON

Logs options:
  -f, --follow             Follow log output (tail -f)
  -n, --lines <count>      Number of lines to show (default: 20)

Validate options:
  --fix                    Auto-fix correctable issues

Followup-importants options:
  -p, --project <path>     Scan specific project only
  -y, --yes                Skip confirmation prompt

General options:
  -v, --version            Show version
  -h, --help               Show this help
`);
}

export interface StartDependencies {
  validateDependencies: () => { name: string; installUrl: string }[];
  startServer: (port?: number) => Promise<unknown>;
  exit: (code: number) => void;
  error: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
  startDaemonDeps: StartDaemonDependencies;
  loadStartupInfo: () => { enabledPlatforms: Array<'gitlab' | 'github'>; defaultPort: number };
  openInBrowser: (url: string) => void;
}

function showBanner(
  port: number,
  daemonPid: number | null,
  open: boolean,
  deps: StartDependencies,
): void {
  const { enabledPlatforms } = deps.loadStartupInfo();
  const banner = formatStartupBanner({ port, enabledPlatforms, daemonPid });
  for (const line of banner.lines) {
    deps.log(line);
  }
  if (open) {
    deps.openInBrowser(banner.dashboardUrl);
  }
}

export function executeStart(
  skipDependencyCheck: boolean,
  daemon: boolean,
  port: number | undefined,
  open: boolean,
  deps: StartDependencies,
): void {
  const resolvedPort = port ?? deps.loadStartupInfo().defaultPort;

  if (daemon) {
    const usecase = new StartDaemonUseCase(deps.startDaemonDeps);
    const result = usecase.execute({ daemon: true, port });

    switch (result.status) {
      case 'started':
        showBanner(resolvedPort, result.pid, open, deps);
        break;
      case 'already-running':
        deps.log(yellow(`Server already running (PID: ${result.pid}, port: ${result.port})`));
        break;
      case 'foreground':
        break;
    }
    return;
  }

  if (!skipDependencyCheck) {
    const missing = deps.validateDependencies();
    if (missing.length > 0) {
      deps.error('Missing dependencies:');
      for (const dep of missing) {
        deps.error(`  - ${dep.name}: ${dep.installUrl}`);
      }
      deps.exit(1);
      return;
    }
  }

  const startForeground = async () => {
    try {
      await deps.startServer(port);
      showBanner(resolvedPort, null, open, deps);
    } catch (err) {
      deps.error('Fatal error:', err);
      deps.exit(1);
    }
  };
  startForeground();
}

export interface StopDeps {
  stopDaemonDeps: StopDaemonDependencies;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  exit: (code: number) => void;
}

export function executeStop(force: boolean, deps: StopDeps): void {
  const usecase = new StopDaemonUseCase(deps.stopDaemonDeps);
  const result = usecase.execute({ force });

  switch (result.status) {
    case 'stopped':
      deps.log(green(`Server stopped (PID: ${result.pid})`));
      break;
    case 'not-running':
      deps.log(yellow('Server is not running'));
      break;
    case 'failed':
      deps.error(red(`Failed to stop server: ${result.reason}`));
      deps.exit(1);
      break;
  }
}

export interface StatusDeps {
  queryStatusDeps: QueryStatusDependencies;
  log: (...args: unknown[]) => void;
  exit: (code: number) => void;
}

export function executeStatus(json: boolean, deps: StatusDeps): void {
  const usecase = new QueryStatusUseCase(deps.queryStatusDeps);
  const result = usecase.execute();

  if (json) {
    deps.log(JSON.stringify(result));
    if (result.status === 'stopped') deps.exit(1);
    return;
  }

  if (result.status === 'running') {
    deps.log(green(bold('ReviewFlow is running')));
    deps.log(dim(`  PID:        ${result.pid}`));
    deps.log(dim(`  Port:       ${result.port}`));
    deps.log(dim(`  Started at: ${result.startedAt}`));
  } else {
    deps.log(red('ReviewFlow is not running'));
    deps.exit(1);
  }
}

export interface LogsDeps {
  readLogsDeps: ReadLogsDependencies;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  exit: (code: number) => void;
}

export function executeLogs(follow: boolean, lines: number, deps: LogsDeps): void {
  const onLine = (line: string) => deps.log(line);
  const usecase = new ReadLogsUseCase(deps.readLogsDeps);
  const result = usecase.execute({ follow, lines, onLine });

  switch (result.status) {
    case 'no-logs':
      deps.error(yellow('No log file found. Start the daemon first.'));
      deps.exit(1);
      break;
    case 'read':
      for (const line of result.lines) {
        deps.log(line);
      }
      break;
    case 'following':
      for (const line of result.initialLines) {
        deps.log(line);
      }
      process.on('SIGINT', () => {
        result.stop();
        process.exit(0);
      });
      break;
  }
}

async function executeFollowupImportants(project: string | undefined): Promise<void> {
  const pidData = readPidFile(PID_FILE_PATH);
  if (!pidData || !isProcessRunning(pidData.pid)) {
    console.error(red('Server is not running. Start with: reviewflow start'));
    process.exit(1);
  }

  const usecase = new FollowupImportantsUseCase({
    serverPort: pidData.port,
    log: console.log,
    error: console.error,
    fetch: globalThis.fetch,
  });

  await usecase.execute({ project });
}

const DEFAULT_SCAN_PATHS = [
  join(homedir(), 'Documents'),
  join(homedir(), 'Projects'),
  join(homedir(), 'Development'),
  join(homedir(), 'dev'),
  join(homedir(), 'repos'),
];

function getGitRemoteUrl(localPath: string): string | null {
  try {
    const result = execSync('git remote get-url origin', {
      cwd: localPath,
      encoding: 'utf-8',
      timeout: 5000,
    });
    return result.trim().replace(/\.git$/, '');
  } catch {
    return null;
  }
}

export type PlatformChoice = 'gitlab' | 'github' | 'both';

export interface InitDependencies {
  log: (...args: unknown[]) => void;
  exit: (code: number) => void;
  getConfigDir: () => string;
  existsSync: (path: string) => boolean;
  checkPrerequisites: () => PrerequisitesResult;
  confirmOverwrite: (configPath: string) => Promise<boolean>;
  promptPlatform: () => Promise<PlatformChoice>;
  promptPort: () => Promise<number>;
  promptGitlabUsername: () => Promise<string>;
  promptGithubUsername: () => Promise<string>;
  confirmScanRepositories: () => Promise<boolean>;
  selectRepositories: (repos: DiscoveredRepository[]) => Promise<DiscoveredRepository[]>;
  generateWebhookSecret: () => string;
  truncateSecret: (secret: string, length: number) => string;
  discoverRepositories: (scanPaths: string[], maxDepth: number) => DiscoverRepositoriesResult;
  configureMcp: () => ConfigureMcpResult;
  writeConfig: (input: WriteInitConfigInput) => WriteInitConfigResult;
  formatSummary: (input: InitSummaryInput) => string;
}

const WELCOME_BANNER = `
Welcome to ReviewFlow!
Automated code review powered by Claude Code.
`;

export async function executeInit(
  yes: boolean,
  skipMcp: boolean,
  showSecrets: boolean,
  scanPaths: string[],
  deps: InitDependencies,
): Promise<void> {
  deps.log(WELCOME_BANNER);

  const prereqResult = deps.checkPrerequisites();
  if (prereqResult.status === 'node-version-too-low') {
    deps.log(red(`Node.js >= ${prereqResult.required} is required (found: ${prereqResult.found})`));
    deps.exit(1);
    return;
  }
  if (prereqResult.status === 'claude-not-installed') {
    deps.log(red(`Claude CLI is not installed. Install it from: ${prereqResult.installUrl}`));
    deps.exit(1);
    return;
  }

  const configDir = deps.getConfigDir();
  const configPath = join(configDir, 'config.json');

  if (deps.existsSync(configPath) && !yes) {
    const overwrite = await deps.confirmOverwrite(configPath);
    if (!overwrite) {
      deps.log(yellow('Init cancelled.'));
      return;
    }
  }

  let port = 3847;
  let gitlabUsername = '';
  let githubUsername = '';

  if (yes) {
    deps.log(dim('Non-interactive mode: using defaults'));
  } else {
    const platform = await deps.promptPlatform();
    port = await deps.promptPort();

    if (platform === 'gitlab' || platform === 'both') {
      gitlabUsername = await deps.promptGitlabUsername();
    }
    if (platform === 'github' || platform === 'both') {
      githubUsername = await deps.promptGithubUsername();
    }
  }

  const gitlabSecret = deps.generateWebhookSecret();
  const githubSecret = deps.generateWebhookSecret();

  deps.log('');
  deps.log(bold('Webhook secrets generated:'));
  if (showSecrets) {
    deps.log(`  GitLab: ${gitlabSecret}`);
    deps.log(`  GitHub: ${githubSecret}`);
  } else {
    deps.log(`  GitLab: ${deps.truncateSecret(gitlabSecret, 16)}`);
    deps.log(`  GitHub: ${deps.truncateSecret(githubSecret, 16)}`);
    deps.log(dim('  Use --show-secrets to display full values'));
  }

  const pathsToScan = scanPaths.length > 0 ? scanPaths : DEFAULT_SCAN_PATHS;
  let selectedRepos: Array<{ name: string; localPath: string; enabled: boolean }> = [];

  const shouldScan = yes || await deps.confirmScanRepositories();

  if (shouldScan) {
    deps.log(dim('\nScanning for repositories...'));
    const discovered = deps.discoverRepositories(pathsToScan, 3);
    deps.log(`  Found ${discovered.repositories.length} repositories`);

    if (discovered.repositories.length > 0) {
      if (yes) {
        selectedRepos = discovered.repositories.map(r => ({
          name: r.name,
          localPath: r.localPath,
          enabled: true,
        }));
      } else {
        const selected = await deps.selectRepositories(discovered.repositories);
        selectedRepos = selected.map(r => ({
          name: r.name,
          localPath: r.localPath,
          enabled: true,
        }));
      }
    }
  }

  let mcpStatus: ConfigureMcpResult | 'skipped' | 'failed' = 'skipped';
  if (!skipMcp) {
    deps.log(dim('\nConfiguring MCP server...'));
    try {
      mcpStatus = deps.configureMcp();
    } catch {
      mcpStatus = 'failed';
    }
    deps.log(`  MCP: ${mcpStatus}`);
  }

  const result = deps.writeConfig({
    configDir,
    port,
    gitlabUsername,
    githubUsername,
    repositories: selectedRepos,
    gitlabWebhookSecret: gitlabSecret,
    githubWebhookSecret: githubSecret,
  });

  const summary = deps.formatSummary({
    configPath: result.configPath,
    envPath: result.envPath,
    port,
    repositoryCount: selectedRepos.length,
    mcpStatus,
    gitlabUsername,
    githubUsername,
  });
  deps.log(green(summary));
}

export interface DiscoverDependencies {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
  writeFileSync: (path: string, content: string) => void;
  readdirSync: (path: string) => Array<{ name: string; isDirectory: () => boolean }>;
  getGitRemoteUrl: (localPath: string) => string | null;
  getConfigPath: () => string;
  log: (...args: unknown[]) => void;
  selectRepositories: (repositories: DiscoveredRepository[]) => Promise<DiscoveredRepository[]>;
}

export async function executeDiscover(
  scanPaths: string[],
  maxDepth: number,
  deps: DiscoverDependencies,
): Promise<void> {
  const configPath = deps.getConfigPath();
  const pathsToScan = scanPaths.length > 0 ? scanPaths : DEFAULT_SCAN_PATHS;

  deps.log(dim('\nScanning for repositories...'));
  const discoverer = new DiscoverRepositoriesUseCase({
    existsSync: deps.existsSync,
    readdirSync: deps.readdirSync,
    getGitRemoteUrl: deps.getGitRemoteUrl,
  });

  const discovered = discoverer.execute({ scanPaths: pathsToScan, maxDepth });
  deps.log(`  Found ${discovered.repositories.length} repositories`);

  if (discovered.repositories.length === 0) {
    deps.log(yellow('No new repositories found.'));
    return;
  }

  const selected = await deps.selectRepositories(discovered.repositories);

  if (selected.length === 0) {
    deps.log(yellow('No repositories selected.'));
    return;
  }

  const adder = new AddRepositoriesToConfigUseCase({
    readFileSync: deps.readFileSync,
    writeFileSync: deps.writeFileSync,
    existsSync: deps.existsSync,
  });

  const result = adder.execute({
    configPath,
    newRepositories: selected.map(repo => ({
      name: repo.name,
      localPath: repo.localPath,
      enabled: true,
    })),
  });

  if (result.added.length > 0) {
    deps.log(green(`\n  Added ${result.added.length} repositories:`));
    for (const repo of result.added) {
      deps.log(green(`    + ${repo.name} (${repo.localPath})`));
    }
  }

  if (result.skipped.length > 0) {
    deps.log(dim(`  Skipped ${result.skipped.length} already configured`));
  }
}

export function executeValidate(fix: boolean): void {
  const configDir = getConfigDir();
  const configPath = join(configDir, 'config.json');
  const envPath = join(configDir, '.env');

  const cwdConfigPath = join(process.cwd(), 'config.json');
  const resolvedConfigPath = existsSync(cwdConfigPath) ? cwdConfigPath : configPath;
  const resolvedEnvPath = existsSync(join(process.cwd(), '.env')) ? join(process.cwd(), '.env') : envPath;

  const validator = new ValidateConfigUseCase({
    existsSync,
    readFileSync,
  });

  const result = validator.execute({ configPath: resolvedConfigPath, envPath: resolvedEnvPath });

  switch (result.status) {
    case 'not-found':
      console.log(red('No configuration found.'));
      console.log(dim(`Looked in: ${resolvedConfigPath}`));
      console.log(`Run ${bold('reviewflow init')} to create one.`);
      process.exit(1);
      break;

    case 'valid':
      console.log(green(bold('Configuration is valid!')));
      console.log(dim(`  Config: ${resolvedConfigPath}`));
      console.log(dim(`  Env:    ${resolvedEnvPath}`));
      break;

    case 'invalid':
      console.log(red(bold('Configuration has issues:')));
      for (const issue of result.issues) {
        const prefix = issue.severity === 'error' ? red('ERROR') : yellow('WARN');
        console.log(`  ${prefix} [${issue.field}]: ${issue.message}`);
      }
      if (fix) {
        console.log(dim('\n--fix flag detected, but no auto-fixable issues implemented yet.'));
      }
      process.exit(1);
      break;
  }
}

function createPidFileDeps() {
  return {
    readPidFile: () => readPidFile(PID_FILE_PATH),
    writePidFile: (content: Parameters<typeof writePidFile>[1]) => writePidFile(PID_FILE_PATH, content),
    removePidFile: () => removePidFile(PID_FILE_PATH),
    isProcessRunning: (pid: number) => isProcessRunning(pid),
  };
}

const isDirectlyExecuted =
  process.argv[1] &&
  realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url);

if (isDirectlyExecuted) {
  const args = parseCliArgs(process.argv.slice(2));

  switch (args.command) {
    case 'version':
      console.log(readVersion());
      break;

    case 'help':
      printHelp();
      break;

    case 'start': {
      const pidDeps = createPidFileDeps();
      executeStart(args.skipDependencyCheck, args.daemon, args.port, args.open, {
        validateDependencies,
        startServer: (port) => startServer({ portOverride: port }),
        exit: process.exit,
        error: console.error,
        log: console.log,
        startDaemonDeps: {
          ...pidDeps,
          spawnDaemon,
        },
        loadStartupInfo: () => {
          try {
            const config = loadConfig();
            const enabledPlatforms = [...new Set(
              config.repositories.filter(r => r.enabled).map(r => r.platform),
            )] as Array<'gitlab' | 'github'>;
            return { enabledPlatforms, defaultPort: config.server.port };
          } catch {
            return { enabledPlatforms: [], defaultPort: 3000 };
          }
        },
        openInBrowser,
      });
      break;
    }

    case 'stop': {
      const pidDeps = createPidFileDeps();
      executeStop(args.force, {
        stopDaemonDeps: {
          ...pidDeps,
          killProcess: (pid, signal) => process.kill(pid, signal as NodeJS.Signals),
        },
        log: console.log,
        error: console.error,
        exit: process.exit,
      });
      break;
    }

    case 'status': {
      const pidDeps = createPidFileDeps();
      executeStatus(args.json, {
        queryStatusDeps: pidDeps,
        log: console.log,
        exit: process.exit,
      });
      break;
    }

    case 'logs':
      executeLogs(args.follow, args.lines, {
        readLogsDeps: {
          logFileExists: () => logFileExists(LOG_FILE_PATH),
          readLastLines: (count) => readLastLines(LOG_FILE_PATH, count),
          watchFile: (onLine) => watchLogFile(LOG_FILE_PATH, onLine),
        },
        log: console.log,
        error: console.error,
        exit: process.exit,
      });
      break;

    case 'init':
      executeInit(args.yes, args.skipMcp, args.showSecrets, args.scanPaths, {
        log: console.log,
        exit: process.exit,
        getConfigDir,
        existsSync,
        checkPrerequisites: () =>
          checkInitPrerequisites({
            executeCommand: execSync,
            getNodeMajorVersion: () => Number(process.versions.node.split('.')[0]),
          }),
        confirmOverwrite: async (configPath) => {
          const { confirm } = await import('@inquirer/prompts');
          return confirm({
            message: `Config already exists at ${configPath}. Overwrite?`,
            default: false,
          });
        },
        promptPlatform: async () => {
          const { select } = await import('@inquirer/prompts');
          return select<PlatformChoice>({
            message: 'Which platform(s) do you use?',
            choices: [
              { name: 'GitLab', value: 'gitlab' },
              { name: 'GitHub', value: 'github' },
              { name: 'Both', value: 'both' },
            ],
          });
        },
        promptPort: async () => {
          const { number: numberPrompt } = await import('@inquirer/prompts');
          const portAnswer = await numberPrompt({
            message: 'Server port:',
            default: 3847,
            validate: (value) => {
              if (value === undefined || value < 1 || value > 65535) return 'Port must be between 1 and 65535';
              return true;
            },
          });
          return portAnswer ?? 3847;
        },
        promptGitlabUsername: async () => {
          const { input } = await import('@inquirer/prompts');
          return input({ message: 'GitLab username:', default: '' });
        },
        promptGithubUsername: async () => {
          const { input } = await import('@inquirer/prompts');
          return input({ message: 'GitHub username:', default: '' });
        },
        confirmScanRepositories: async () => {
          const { confirm } = await import('@inquirer/prompts');
          return confirm({ message: 'Scan for repositories?', default: true });
        },
        selectRepositories: async (repositories) => {
          const { checkbox } = await import('@inquirer/prompts');
          return checkbox({
            message: 'Select repositories to configure:',
            choices: repositories.map(r => ({
              name: `${r.name} ${dim(`(${r.localPath})`)}${r.hasReviewConfig ? green(' [configured]') : ''}`,
              value: r,
              checked: r.hasReviewConfig,
            })),
          });
        },
        generateWebhookSecret,
        truncateSecret,
        discoverRepositories: (scanPaths, maxDepth) => {
          const discoverer = new DiscoverRepositoriesUseCase({
            existsSync,
            readdirSync: (path: string) =>
              readdirSync(path, { withFileTypes: true }).map(d => ({
                name: d.name,
                isDirectory: () => d.isDirectory(),
              })),
            getGitRemoteUrl,
          });
          return discoverer.execute({ scanPaths, maxDepth });
        },
        configureMcp: () => {
          const mcpUseCase = new ConfigureMcpUseCase({
            isClaudeInstalled: () => checkDependency({ name: 'Claude', command: 'claude --version' }),
            readFileSync,
            writeFileSync,
            existsSync,
            copyFileSync,
            resolveMcpServerPath: () => {
              try {
                return resolveMcpServerPath();
              } catch {
                return join(dirname(fileURLToPath(import.meta.url)), '..', 'mcpServer.js');
              }
            },
            settingsPath: join(homedir(), '.claude', 'settings.json'),
          });
          return mcpUseCase.execute();
        },
        writeConfig: (input) => {
          const writer = new WriteInitConfigUseCase({ mkdirSync, writeFileSync });
          return writer.execute(input);
        },
        formatSummary: formatInitSummary,
      });
      break;

    case 'discover':
      executeDiscover(args.scanPaths, args.maxDepth, {
        existsSync,
        readFileSync,
        writeFileSync,
        readdirSync: (path: string) =>
          readdirSync(path, { withFileTypes: true }).map(d => ({
            name: d.name,
            isDirectory: () => d.isDirectory(),
          })),
        getGitRemoteUrl,
        getConfigPath: () => join(getConfigDir(), 'config.json'),
        log: console.log,
        selectRepositories: async (repositories) => {
          const { checkbox } = await import('@inquirer/prompts');
          return checkbox({
            message: 'Select repositories to add:',
            choices: repositories.map(r => ({
              name: `${r.name} ${dim(`(${r.localPath})`)}${r.hasReviewConfig ? green(' [configured]') : ''}`,
              value: r,
              checked: r.hasReviewConfig,
            })),
          });
        },
      });
      break;

    case 'validate':
      executeValidate(args.fix);
      break;

    case 'followup-importants':
      executeFollowupImportants(args.project);
      break;
  }
}
