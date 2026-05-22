import type { TokenUsage } from '@/modules/token-accounting/entities/tokenUsage/tokenUsage.schema.js';

// SPEC-169 (FR-8): no-op stub.
//
// The previous implementation parsed `claude -p --output-format stream-json`
// stdout. Since SPEC-169 the production path dispatches reviews via
// `claude --bg`, which exits immediately after returning a session ID and
// never emits stream-json. Completion is observed through the MCP
// review-progress server + agents-json polling instead.
//
// This stub is intentionally kept (rather than deleted) so any reintroduction
// of stream-json (e.g. if Anthropic adds it to --bg) has a single seam to
// extend. The class API matches the legacy contract so callers — if any
// reappear during a Strangler Fig step — compile, but produce empty values.
export class StreamJsonParser {
  feed(_chunk: string): void {
    return;
  }

  getAssistantText(): string {
    return '';
  }

  getUsage(): TokenUsage | null {
    return null;
  }
}
