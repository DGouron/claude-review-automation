import type {
  ClientIpResolutionInput,
  ClientIpResolver,
} from '@/modules/platform-integration/entities/transport/clientIpResolver.gateway.js';

export class ForwardedForClientIpResolver implements ClientIpResolver {
  resolve(input: ClientIpResolutionInput): string | null {
    if (!input.socketTrusted) {
      return null;
    }

    if (input.forwardedFor === null) {
      return null;
    }

    const leftmost = input.forwardedFor.split(',')[0]?.trim();
    if (!leftmost) {
      return null;
    }

    return leftmost;
  }
}
