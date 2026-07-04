export function getReviewToken(): string {
  return new URLSearchParams(location.search).get("token") ?? "";
}
export const authHeaders: HeadersInit = { "x-review-buddy-token": getReviewToken() };
