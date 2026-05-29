export interface ClientIpResolutionInput {
  socketTrusted: boolean;
  forwardedFor: string | null;
}

export interface ClientIpResolver {
  resolve(input: ClientIpResolutionInput): string | null;
}
