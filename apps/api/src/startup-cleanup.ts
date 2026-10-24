export async function cleanupStartupResources(
  cleanup: Array<() => void | Promise<void>>,
): Promise<void> {
  const errors: unknown[] = [];

  for (const close of cleanup.reverse()) {
    try {
      await close();
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      "One or more resources failed to close during startup cleanup",
    );
  }
}
