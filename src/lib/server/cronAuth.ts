export function isCronAuthorized(request: Request): boolean {
  const cronSecret = request.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET || "local-dev";
  return cronSecret === expectedSecret;
}
