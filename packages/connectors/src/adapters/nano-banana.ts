/**
 * NanoBananaAdapter — stub connector for Nano Banana static image generation.
 *
 * Nano Banana (https://nanobanana.ai) is Isaac's preferred tool for producing
 * clean static promotional images — product shots on clean backgrounds,
 * lifestyle compositions, ad creatives.
 *
 * All methods return mock URLs until NANO_BANANA_API_KEY is wired.
 * Real API call sites are marked with // TODO: real Nano Banana endpoint comments.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface NanaBananaGenerateOptions {
  /** Source product image URL. Used for product-on-background compositions. */
  product_image_url?: string;
  /** Text prompt describing the desired output. */
  prompt: string;
  /** Negative prompt — things to avoid. */
  negative_prompt?: string;
  /** Desired output width. Default 1200. */
  width?: number;
  /** Desired output height. Default 1200. */
  height?: number;
  /** Style preset (e.g. 'studio', 'lifestyle', 'minimal'). */
  style?: string;
  /** Number of variations to generate. Default 1. */
  num_outputs?: number;
}

export interface NanaBananaResult {
  /** URL of the generated image. */
  url: string;
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
  /** Internal request ID (populated when real API is wired). */
  request_id?: string;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class NanaBananaAdapter {
  private readonly apiKey: string | null;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env["NANO_BANANA_API_KEY"] ?? null;
  }

  /**
   * Generate a promotional static image.
   * Used for: clean product shots, before/after split promos, social ad creatives.
   *
   * When product_image_url is provided, Nano Banana composites the product onto
   * the generated background (product-on-scene mode).
   * When absent, pure text-to-image generation is used.
   */
  async generate(opts: NanaBananaGenerateOptions): Promise<NanaBananaResult[]> {
    const numOutputs = opts.num_outputs ?? 1;

    if (!this.apiKey) {
      // TODO: real Nano Banana endpoint when API key wired
      // POST https://api.nanobanana.ai/v1/generate
      // Headers: Authorization: Bearer <NANO_BANANA_API_KEY>
      // Body: { product_image_url, prompt, negative_prompt, width, height, style, num_outputs }
      return Array.from({ length: numOutputs }, (_, i) => ({
        url: `mock://nano-banana/generate?prompt=${encodeURIComponent(opts.prompt)}&idx=${i}`,
        width: opts.width ?? 1200,
        height: opts.height ?? 1200,
      }));
    }

    // TODO: real Nano Banana endpoint when API key wired
    // const response = await fetch('https://api.nanobanana.ai/v1/generate', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${this.apiKey}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     product_image_url: opts.product_image_url,
    //     prompt: opts.prompt,
    //     negative_prompt: opts.negative_prompt,
    //     width: opts.width ?? 1200,
    //     height: opts.height ?? 1200,
    //     style: opts.style ?? 'studio',
    //     num_outputs: numOutputs,
    //   }),
    // });
    // if (!response.ok) {
    //   throw new Error(`[NanaBananaAdapter] API error ${response.status}: ${await response.text()}`);
    // }
    // const data = await response.json() as { images: Array<{ url: string; width: number; height: number; request_id: string }> };
    // return data.images.map(img => ({ url: img.url, width: img.width, height: img.height, request_id: img.request_id }));
    throw new Error('[NanaBananaAdapter] NANO_BANANA_API_KEY set but real client not yet wired — see TODO above.');
  }
}
