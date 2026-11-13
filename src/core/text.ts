/**
 * Small text helpers shared across the app (26.63, D239: six copies of the HTML escape had drifted apart — some
 * escaped quotes, some did not).
 */

/** Escape text for HTML and SVG, in element content and in attribute values. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
