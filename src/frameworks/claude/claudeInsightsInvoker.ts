import { spawn } from 'node:child_process';
import { resolveClaudePath } from '@/shared/services/claudePathResolver.js';
import { getModel } from '@/frameworks/settings/runtimeSettings.js';
import type { ClaudeInvoker } from '@/usecases/insights/generateAiInsights.usecase.js';

const INSIGHTS_TIMEOUT_MS = 300000;

export function createClaudeInsightsInvoker(): ClaudeInvoker {
  return (prompt: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const args = [
        '--print',
        '--model', getModel(),
        '-p', prompt,
      ];

      const childEnv = { ...process.env };
      childEnv.CLAUDECODE = undefined;

      const proc = spawn(resolveClaudePath(), args, {
        env: {
          ...childEnv,
          TERM: 'dumb',
          CI: 'true',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGKILL');
      }, INSIGHTS_TIMEOUT_MS);

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Impossible de lancer Claude CLI : ${error.message}`));
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (timedOut) {
          reject(new Error('Claude CLI a pris trop de temps (timeout 300s)'));
          return;
        }
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Claude CLI a retourne le code ${code}: ${stderr.substring(0, 500)}`));
        }
      });
    });
  };
}
