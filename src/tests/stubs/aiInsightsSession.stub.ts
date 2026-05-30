import type {
  AiInsightsSessionGateway,
  AiInsightsSessionResult,
} from '@/modules/statistics-insights/entities/insight/aiInsightsSession.gateway.js';

export class StubAiInsightsSessionGateway implements AiInsightsSessionGateway {
  runCalls: string[] = [];

  private result: AiInsightsSessionResult = {
    status: 'completed',
    answer: '{}',
  };

  setResult(result: AiInsightsSessionResult): void {
    this.result = result;
  }

  async run(prompt: string): Promise<AiInsightsSessionResult> {
    this.runCalls.push(prompt);
    return this.result;
  }
}
