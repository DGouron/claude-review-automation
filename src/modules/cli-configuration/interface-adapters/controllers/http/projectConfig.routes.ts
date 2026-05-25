import type { FastifyPluginAsync } from 'fastify';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { logInfo, logError } from '@/frameworks/logging/logBuffer.js';
import {
  REVIEW_FOCUS_VALUES,
  isReviewFocus,
  reviewSkillForFocus,
} from '@/modules/review-execution/entities/progress/reviewFocus.type.js';
import type {
  UpdateProjectConfigUseCase,
  ProjectConfigPatch,
} from '@/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.js';

interface ProjectConfigRoutesOptions {
  updateProjectConfig?: UpdateProjectConfigUseCase;
}

const querySchema = z.object({ path: z.string().optional() }).passthrough();

const patchBodySchema = z
  .object({
    language: z.unknown().optional(),
    defaultModel: z.unknown().optional(),
    reviewSkill: z.unknown().optional(),
    reviewFollowupSkill: z.unknown().optional(),
    externalLink: z.unknown().optional(),
  })
  .passthrough();

function formatReviewFocusValues(): string {
  return REVIEW_FOCUS_VALUES.map(value => `'${value}'`).join(', ');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  const code: unknown = Reflect.get(error, 'code');
  return typeof code === 'string' ? code : undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function extractPatch(body: Record<string, unknown>): ProjectConfigPatch {
  const patch: ProjectConfigPatch = {};
  if ('language' in body && typeof body.language === 'string') {
    if (body.language === 'en' || body.language === 'fr') {
      patch.language = body.language;
    }
  }
  if ('defaultModel' in body && typeof body.defaultModel === 'string') {
    if (body.defaultModel === 'haiku' || body.defaultModel === 'sonnet' || body.defaultModel === 'opus') {
      patch.defaultModel = body.defaultModel;
    }
  }
  if ('reviewSkill' in body && typeof body.reviewSkill === 'string') {
    patch.reviewSkill = body.reviewSkill;
  }
  if ('reviewFollowupSkill' in body && typeof body.reviewFollowupSkill === 'string') {
    patch.reviewFollowupSkill = body.reviewFollowupSkill;
  }
  if ('externalLink' in body && typeof body.externalLink === 'string') {
    patch.externalLink = body.externalLink;
  }
  return patch;
}

function validateProjectPath(rawPath: string | undefined): { ok: true; path: string } | { ok: false; error: string } {
  const projectPath = rawPath?.trim();
  if (!projectPath) {
    return { ok: false, error: 'Project path required' };
  }
  if (!projectPath.startsWith('/') || projectPath.includes('..')) {
    return { ok: false, error: 'Invalid path (must be absolute without ..)' };
  }
  return { ok: true, path: projectPath };
}

export const projectConfigRoutes: FastifyPluginAsync<ProjectConfigRoutesOptions> = async (
  fastify,
  options,
) => {
  fastify.get('/api/project-config', async (request, reply) => {
    const parsedQuery = querySchema.safeParse(request.query);
    const queryPath = parsedQuery.success ? parsedQuery.data.path : undefined;
    const validation = validateProjectPath(queryPath);
    if (!validation.ok) {
      reply.code(400);
      return { success: false, error: validation.error };
    }
    const projectPath = validation.path;

    const configPath = join(projectPath, '.claude', 'reviews', 'config.json');

    try {
      const content = await readFile(configPath, 'utf-8');
      const config = JSON.parse(content);

      const hasReviewFocus = 'reviewFocus' in config && config.reviewFocus !== undefined;
      if (hasReviewFocus && !isReviewFocus(config.reviewFocus)) {
        return {
          success: false,
          error: `Invalid reviewFocus: must be ${formatReviewFocusValues()}`,
        };
      }

      const baseRequiredFields = ['github', 'gitlab', 'defaultModel', 'reviewFollowupSkill'];
      const missingBase = baseRequiredFields.filter(field => !(field in config));
      if (missingBase.length > 0) {
        return { success: false, error: `Missing fields: ${missingBase.join(', ')}` };
      }

      const hasReviewSkill = typeof config.reviewSkill === 'string' && config.reviewSkill.length > 0;
      if (!hasReviewSkill && !hasReviewFocus) {
        return { success: false, error: 'Missing fields: reviewSkill' };
      }

      const resolvedReviewSkill = hasReviewSkill
        ? config.reviewSkill
        : reviewSkillForFocus(config.reviewFocus);

      if ('agents' in config && config.agents !== undefined) {
        if (!Array.isArray(config.agents)) {
          return { success: false, error: 'Field "agents" must be an array' };
        }
        for (const agent of config.agents) {
          if (
            !agent ||
            typeof agent !== 'object' ||
            typeof agent.name !== 'string' ||
            typeof agent.displayName !== 'string' ||
            agent.name.length === 0 ||
            agent.displayName.length === 0
          ) {
            return {
              success: false,
              error: 'Invalid agents format: each agent must have { name: string, displayName: string }',
            };
          }
        }
      }

      const skillsPath = join(projectPath, '.claude', 'skills');
      const skillErrors: string[] = [];

      const reviewSkillPath = join(skillsPath, resolvedReviewSkill, 'SKILL.md');
      try {
        await stat(reviewSkillPath);
      } catch {
        skillErrors.push(`reviewSkill "${resolvedReviewSkill}" not found (${reviewSkillPath})`);
      }

      const followupSkillPath = join(skillsPath, config.reviewFollowupSkill, 'SKILL.md');
      try {
        await stat(followupSkillPath);
      } catch {
        skillErrors.push(`reviewFollowupSkill "${config.reviewFollowupSkill}" not found (${followupSkillPath})`);
      }

      if (skillErrors.length > 0) {
        return { success: false, error: skillErrors.join(' | ') };
      }

      logInfo('Project config loaded', { projectPath, config });
      return { success: true, config, path: configPath };
    } catch (error) {
      if (getErrorCode(error) === 'ENOENT') {
        return { success: false, error: 'config.json file not found in .claude/reviews/' };
      }
      const message = getErrorMessage(error);
      logError('Error reading project config', { projectPath, error: message });
      return { success: false, error: 'Read error: ' + message };
    }
  });

  fastify.patch('/api/project-config', async (request, reply) => {
    const updateProjectConfig = options?.updateProjectConfig;
    if (!updateProjectConfig) {
      reply.code(501);
      return { success: false, error: 'PATCH not configured' };
    }

    const parsedQuery = querySchema.safeParse(request.query);
    const queryPath = parsedQuery.success ? parsedQuery.data.path : undefined;
    const validation = validateProjectPath(queryPath);
    if (!validation.ok) {
      reply.code(400);
      return { success: false, error: validation.error };
    }

    const body = request.body;
    if (!isPlainObject(body)) {
      reply.code(400);
      return { success: false, error: 'Body must be a JSON object' };
    }

    const parsedBody = patchBodySchema.safeParse(body);
    if (!parsedBody.success) {
      reply.code(400);
      return { success: false, error: 'Invalid body shape' };
    }

    const result = updateProjectConfig.execute({
      path: validation.path,
      patch: extractPatch(parsedBody.data),
    });

    if (result.status === 'success') {
      return { success: true, config: result.config };
    }
    if (result.status === 'invalid') {
      reply.code(400);
      return { success: false, error: result.reason };
    }
    if (result.status === 'not-found') {
      reply.code(404);
      return { success: false, error: 'Project config not found' };
    }
    if (result.status === 'malformed') {
      reply.code(422);
      return { success: false, error: 'Configuration projet illisible' };
    }
    reply.code(500);
    return { success: false, error: 'Échec de la sauvegarde' };
  });
};
