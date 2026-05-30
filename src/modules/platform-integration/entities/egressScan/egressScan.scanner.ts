import type {
  EgressScanGateway,
  EgressScanInput,
  EgressScanMode,
  EgressScanResult,
  EgressMatchCategory,
} from '@/modules/platform-integration/entities/egressScan/egressScan.gateway.js';

export interface EgressScanConfig {
  secretShapeMode: EgressScanMode;
  lengthMode: EgressScanMode;
  outOfScopeMode: EgressScanMode;
  maxBodyLength: number;
  redactionMarker: string;
  truncationMarker: string;
}

const SECRET_SHAPE_PATTERN =
  /\b(?:glpat-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g;

const PROJECT_REFERENCE_PATTERN = /\b[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._/-]*\b/g;

function emptyCounts(): Record<EgressMatchCategory, number> {
  return { 'secret-shape': 0, 'length-cap': 0, 'out-of-scope': 0 };
}

function isOutOfScope(reference: string, projectPath: string): boolean {
  return reference !== projectPath && !reference.startsWith(`${projectPath}/`);
}

export function createEgressScanner(config: EgressScanConfig): EgressScanGateway {
  return {
    scan(input: EgressScanInput): EgressScanResult {
      const counts = emptyCounts();
      let body = input.body;
      let blocked = false;
      let mutated = false;

      const secretMatches = body.match(SECRET_SHAPE_PATTERN) ?? [];
      if (secretMatches.length > 0) {
        counts['secret-shape'] = secretMatches.length;
        if (config.secretShapeMode === 'block') {
          blocked = true;
        } else if (config.secretShapeMode === 'redact') {
          body = body.replace(SECRET_SHAPE_PATTERN, config.redactionMarker);
          mutated = true;
        }
      }

      const outOfScopeMatches = (body.match(PROJECT_REFERENCE_PATTERN) ?? []).filter((reference) =>
        isOutOfScope(reference, input.projectPath),
      );
      if (outOfScopeMatches.length > 0) {
        counts['out-of-scope'] = outOfScopeMatches.length;
        if (config.outOfScopeMode === 'block') {
          blocked = true;
        } else if (config.outOfScopeMode === 'redact') {
          for (const reference of outOfScopeMatches) {
            body = body.split(reference).join(config.redactionMarker);
          }
          mutated = true;
        }
      }

      if (body.length > config.maxBodyLength) {
        counts['length-cap'] = 1;
        if (config.lengthMode === 'block') {
          blocked = true;
        } else if (config.lengthMode === 'redact') {
          const room = config.maxBodyLength - config.truncationMarker.length;
          const head = room > 0 ? body.slice(0, room) : '';
          body = `${head}${config.truncationMarker}`;
          mutated = true;
        }
      }

      const mode: EgressScanMode = blocked ? 'block' : mutated ? 'redact' : 'allow';

      if (blocked) {
        return {
          decision: 'block',
          trace: { channel: input.channel, mode, matchCategoryCounts: counts },
        };
      }

      if (mutated) {
        return {
          decision: 'redact',
          body,
          trace: { channel: input.channel, mode, matchCategoryCounts: counts },
        };
      }

      return { decision: 'pass', body };
    },
  };
}
