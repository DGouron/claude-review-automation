import type {
  NoteCommentPostGateway,
  NoteCommentPostInput,
} from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';
import type { CommandExecutor } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.github.gateway.js';

export class GitHubNoteCommentPostCliGateway implements NoteCommentPostGateway {
  constructor(private readonly executor: CommandExecutor) {}

  async postComment(input: NoteCommentPostInput): Promise<void> {
    const command = `gh api --method POST repos/${input.projectPath}/issues/${input.mrNumber}/comments --field body=${JSON.stringify(input.body)}`;
    this.executor(command);
  }
}
