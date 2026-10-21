export function getErrorReply(status: number, upstreamMessage?: string): string {
  if (status === 429) {
    return "The service is rate limited. Please try again tomorrow.";
  }
  if (status === 503 || status === 502 || status === 504) {
    return "The service is unavailable. Please try again.";
  }
  if (status >= 500) {
    return "The service is unavailable. Please try again.";
  }
  if (upstreamMessage) {
    return upstreamMessage;
  }
  return "Something went wrong. Please try again.";
}
