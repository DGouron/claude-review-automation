export interface ApprovalRevocationInput {
  projectPath: string;
  mrNumber: number;
  reviewId?: number;
  dismissalMessage?: string;
}

export interface ApprovalRevocationGateway {
  revoke(input: ApprovalRevocationInput): Promise<void>;
}
