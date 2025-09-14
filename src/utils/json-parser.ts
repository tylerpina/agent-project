/**
 * Utility function to parse JSON responses from LLMs that might be wrapped in markdown code blocks
 */
export function parseJsonResponse(text: string): any {
  // Clean up the response text (remove markdown code blocks if present)
  let cleanText = text.trim();

  if (cleanText.startsWith("```json")) {
    cleanText = cleanText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleanText.startsWith("```")) {
    cleanText = cleanText.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  return JSON.parse(cleanText);
}
