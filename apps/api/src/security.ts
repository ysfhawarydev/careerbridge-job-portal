export function isTrustedOrigin(
  origin: string | undefined,
  referer: string | undefined,
  allowedOrigin: string,
): boolean {
  if (origin !== undefined) {
    return origin === allowedOrigin;
  }

  if (!referer) {
    return false;
  }

  try {
    return new URL(referer).origin === allowedOrigin;
  } catch {
    return false;
  }
}
