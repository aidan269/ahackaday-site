/** Default model for Anthropic Messages API (override with ANTHROPIC_MODEL). */
export function getAnthropicModel(): string {
  return (
    process.env.ANTHROPIC_MODEL?.trim() ||
    // Sonnet 4 is the current stable default for new Anthropic projects (2025+).
    "claude-sonnet-4-20250514"
  );
}
