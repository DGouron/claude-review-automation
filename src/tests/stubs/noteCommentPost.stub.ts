import type {
  NoteCommentPostGateway,
  NoteCommentPostInput,
} from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';

export class StubNoteCommentPostGateway implements NoteCommentPostGateway {
  readonly calls: NoteCommentPostInput[] = [];

  async postComment(input: NoteCommentPostInput): Promise<void> {
    this.calls.push(input);
  }
}
