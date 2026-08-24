/**
 * Dynamic Google Gemini API Model Discovery Service
 * Queries the live Google Gemini API endpoint to retrieve all currently active, available models
 * for the user's API key and prioritizes ultra-fast Flash vision models.
 */

export class GeminiModelService {
  private static cachedModels: string[] | null = null;
  private static cacheTimestamp: number = 0;

  /**
   * Retrieves active models dynamically from the Google Generative Language API
   */
  static async getActiveModels(apiKey: string): Promise<string[]> {
    const now = Date.now();
    // Cache for 1 hour to prevent unnecessary API overhead
    if (this.cachedModels && this.cachedModels.length > 0 && (now - this.cacheTimestamp < 3600000)) {
      return this.cachedModels;
    }

    const fallbackList = [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash-latest',
      'gemini-1.5-pro-latest',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
    ];

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`;
      const response = await fetch(endpoint);
      if (response.ok) {
        const data = await response.json();
        const available: string[] = (data?.models || [])
          .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => m.name.replace(/^models\//, ''));

        if (available.length > 0) {
          // Sort so high-speed flash vision models are tried first
          const sorted = available.sort((a, b) => {
            const aName = a.toLowerCase();
            const bName = b.toLowerCase();

            // Give highest priority to modern flash models (2.5-flash, 2.0-flash, 3.x-flash)
            const aScore = aName.includes('2.5-flash') ? 100 : aName.includes('2.0-flash') ? 90 : aName.includes('flash') ? 80 : 50;
            const bScore = bName.includes('2.5-flash') ? 100 : bName.includes('2.0-flash') ? 90 : bName.includes('flash') ? 80 : 50;

            return bScore - aScore;
          });

          this.cachedModels = sorted;
          this.cacheTimestamp = now;
          return sorted;
        }
      }
    } catch (e) {
      console.warn('Live Gemini model discovery note, using active fallback list:', e);
    }

    this.cachedModels = fallbackList;
    this.cacheTimestamp = now;
    return fallbackList;
  }
}
