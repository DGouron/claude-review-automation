import type { FastifyPluginAsync } from 'fastify';
import type { Logger } from 'pino';
import { emberMessageGuard } from '@/modules/ember-chat/entities/emberMessage/emberMessage.guard.js';
import { askEmber } from '@/modules/ember-chat/usecases/askEmber/askEmber.usecase.js';
import type { EmberSessionRegistry } from '@/modules/ember-chat/usecases/emberSession/emberSessionRegistry.js';
import type { EmberReadDataGateway } from '@/modules/ember-chat/entities/emberTool/emberTool.gateway.js';
import type { EnvironmentGateway } from '@/modules/claude-invocation/entities/billingState/environment.gateway.js';

const UNAVAILABLE_MESSAGE = '// EMBER INDISPONIBLE — réessayer';

export interface EmberChatRoutesOptions {
  registry: EmberSessionRegistry;
  environment: EnvironmentGateway;
  readData: EmberReadDataGateway;
  projectPath: string;
  now: () => Date;
  logger: Logger;
}

export const emberChatRoutes: FastifyPluginAsync<EmberChatRoutesOptions> = async (
  fastify,
  options,
) => {
  const { registry, environment, readData, projectPath, now, logger } = options;

  fastify.post('/api/ember/ask', async (request, reply): Promise<void> => {
    const parsed = emberMessageGuard.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'invalid-question' });
      return;
    }

    const result = await askEmber(parsed.data, {
      registry,
      environment,
      readData,
      projectPath,
      now,
    });

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const writeEvent = (payload: Record<string, unknown>): void => {
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    if (result.status !== 'streaming') {
      logger.info({ status: result.status }, 'Ember unavailable for question');
      writeEvent({ type: 'error', message: UNAVAILABLE_MESSAGE });
      reply.raw.write('event: end\ndata: {}\n\n');
      reply.raw.end();
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (!reply.raw.writableEnded) {
          reply.raw.write('event: end\ndata: {}\n\n');
          reply.raw.end();
        }
        resolve();
      };

      result.subscribe({
        onStatus: (state) => writeEvent({ type: 'status', state }),
        onChunk: (text) => writeEvent({ type: 'chunk', text }),
        onError: (message) => {
          writeEvent({ type: 'error', message: UNAVAILABLE_MESSAGE, detail: message });
          finish();
        },
        onDone: finish,
      });

      request.raw.on('close', finish);
    });
  });
};
