import type { EmberStatus } from '@/modules/ember-chat/usecases/askEmber/emberStream.js';

export type EmberAvatarState = 'idle' | 'working' | 'error';

export type EmberStatusEvent =
  | { kind: 'status'; status: EmberStatus }
  | { kind: 'answer'; text: string }
  | { kind: 'error' };

export interface EmberStatusViewModel {
  avatarState: EmberAvatarState;
  liveRegionText: string;
  unavailableMessage: string | null;
}

const UNAVAILABLE_MESSAGE = '// EMBER INDISPONIBLE — réessayer';

export class EmberStatusPresenter {
  present(event: EmberStatusEvent): EmberStatusViewModel {
    if (event.kind === 'answer') {
      return { avatarState: 'idle', liveRegionText: event.text, unavailableMessage: null };
    }

    if (event.kind === 'error' || event.status === 'error') {
      return {
        avatarState: 'error',
        liveRegionText: 'Ember est indisponible.',
        unavailableMessage: UNAVAILABLE_MESSAGE,
      };
    }

    if (event.status === 'working') {
      return {
        avatarState: 'working',
        liveRegionText: 'Ember prépare une réponse.',
        unavailableMessage: null,
      };
    }

    return {
      avatarState: 'idle',
      liveRegionText: 'Ember a terminé sa réponse.',
      unavailableMessage: null,
    };
  }
}
