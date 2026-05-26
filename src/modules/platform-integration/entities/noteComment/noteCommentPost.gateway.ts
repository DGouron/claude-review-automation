export interface NoteCommentPostInput {
  projectPath: string;
  mrNumber: number;
  body: string;
}

export interface NoteCommentPostGateway {
  postComment(input: NoteCommentPostInput): Promise<void>;
}
