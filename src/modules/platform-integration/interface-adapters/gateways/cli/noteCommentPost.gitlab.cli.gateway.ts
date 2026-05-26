import type {
  NoteCommentPostGateway,
  NoteCommentPostInput,
} from '@/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.js';
import type { CommandExecutor } from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.gitlab.gateway.js';

export class GitLabNoteCommentPostCliGateway implements NoteCommentPostGateway {
  constructor(private readonly executor: CommandExecutor) {}

  async postComment(input: NoteCommentPostInput): Promise<void> {
    const encodedProject = input.projectPath.replace(/\//g, '%2F');
    const command = `glab api --method POST projects/${encodedProject}/merge_requests/${input.mrNumber}/notes --field body=${JSON.stringify(input.body)}`;
    this.executor(command);
  }
}
