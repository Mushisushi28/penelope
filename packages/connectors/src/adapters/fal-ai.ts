/**
 * FalAiAdapter — stub connector for fal.ai image/video generation endpoints.
 *
 * All methods return mock URLs until a real FAL_KEY is wired.
 * Real API call sites are marked with // TODO: real fal.ai endpoint comments.
 *
 * Endpoint docs: https://fal.ai/models
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FalInpaintOptions {
  /** Mask image URL or data URI describing regions to inpaint. */
  mask_url?: string;
  /** Text prompt describing what should appear in the masked region. */
  prompt?: string;
  /** Negative prompt — things to avoid in output. */
  negative_prompt?: string;
  /** Strength of the inpaint effect (0–1). Default 0.85. */
  strength?: number;
}

export interface FalImageToImageOptions {
  /** Source image URL or base64 data URI. */
  image_url: string;
  /** Text prompt describing the target output. */
  prompt: string;
  /** Strength of image-to-image transformation (0–1). Default 0.75. */
  strength?: number;
  negative_prompt?: string;
}

export interface FalTextToImageOptions {
  /** Text prompt. */
  prompt: string;
  negative_prompt?: string;
  /** Desired output width. Default 1024. */
  width?: number;
  /** Desired output height. Default 1024. */
  height?: number;
  /** Number of inference steps. Default 28. */
  num_inference_steps?: number;
}

export interface FalVideoFromImagesOptions {
  /** Array of image URLs (frames) to animate. */
  image_urls: string[];
  /** Text prompt guiding the video motion. */
  prompt?: string;
  /** Target frames per second. Default 8. */
  fps?: number;
  /** Duration in seconds. Default 3. */
  duration?: number;
}

export interface FalResult {
  url: string;
  /** Width in pixels (if applicable). */
  width?: number;
  /** Height in pixels (if applicable). */
  height?: number;
  /** Original request id from fal.ai (populated when real API is wired). */
  request_id?: string;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class FalAiAdapter {
  private readonly apiKey: string | null;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env["FAL_KEY"] ?? null;
  }

  /**
   * Inpaint a region of an image.
   * Used for: removing tape/tools, cleaning up watermarks, removing hands.
   *
   * Model: fal-ai/flux/dev/image-to-image (or fal-ai/stable-diffusion-v3-medium for inpaint).
   */
  async inpaint(sourceImageUrl: string, opts: FalInpaintOptions = {}): Promise<FalResult> {
    if (!this.apiKey) {
      // TODO: real fal.ai endpoint when API key wired
      // POST https://fal.run/fal-ai/stable-diffusion-v3-medium/inpaint
      // Body: { image_url, mask_url, prompt, negative_prompt, strength }
      return {
        url: `mock://fal-ai/inpaint?src=${encodeURIComponent(sourceImageUrl)}&prompt=${encodeURIComponent(opts.prompt ?? '')}`,
      };
    }

    // TODO: real fal.ai endpoint when API key wired
    // const { fal } = await import('@fal-ai/client');
    // fal.config({ credentials: this.apiKey });
    // const result = await fal.subscribe('fal-ai/stable-diffusion-v3-medium/inpaint', {
    //   input: {
    //     image_url: sourceImageUrl,
    //     mask_url: opts.mask_url,
    //     prompt: opts.prompt ?? 'clean car, professional photography, no tools, no tape',
    //     negative_prompt: opts.negative_prompt ?? 'tape, masking tape, tools, hands, text, watermark',
    //     strength: opts.strength ?? 0.85,
    //   },
    // });
    // return { url: result.data.images[0].url, request_id: result.requestId };
    throw new Error('[FalAiAdapter] FAL_KEY set but real fal.ai client not yet wired — see TODO above.');
  }

  /**
   * Transform one image into another using a text prompt.
   * Used for: style transfer, image cleanup, lighting normalization.
   *
   * Model: fal-ai/flux/dev/image-to-image
   */
  async imageToImage(opts: FalImageToImageOptions): Promise<FalResult> {
    if (!this.apiKey) {
      // TODO: real fal.ai endpoint when API key wired
      // POST https://fal.run/fal-ai/flux/dev/image-to-image
      return {
        url: `mock://fal-ai/image-to-image?src=${encodeURIComponent(opts.image_url)}&prompt=${encodeURIComponent(opts.prompt)}`,
      };
    }

    // TODO: real fal.ai endpoint when API key wired
    // const { fal } = await import('@fal-ai/client');
    // fal.config({ credentials: this.apiKey });
    // const result = await fal.subscribe('fal-ai/flux/dev/image-to-image', { input: opts });
    // return { url: result.data.images[0].url, request_id: result.requestId };
    throw new Error('[FalAiAdapter] FAL_KEY set but real fal.ai client not yet wired — see TODO above.');
  }

  /**
   * Generate an image from a text prompt.
   * Used for: promo backgrounds, placeholder images.
   *
   * Model: fal-ai/flux/dev (or fal-ai/fast-sdxl for speed)
   */
  async textToImage(opts: FalTextToImageOptions): Promise<FalResult> {
    if (!this.apiKey) {
      // TODO: real fal.ai endpoint when API key wired
      // POST https://fal.run/fal-ai/flux/dev
      return {
        url: `mock://fal-ai/text-to-image?prompt=${encodeURIComponent(opts.prompt)}`,
        width: opts.width ?? 1024,
        height: opts.height ?? 1024,
      };
    }

    // TODO: real fal.ai endpoint when API key wired
    // const { fal } = await import('@fal-ai/client');
    // fal.config({ credentials: this.apiKey });
    // const result = await fal.subscribe('fal-ai/flux/dev', {
    //   input: {
    //     prompt: opts.prompt,
    //     negative_prompt: opts.negative_prompt,
    //     image_size: { width: opts.width ?? 1024, height: opts.height ?? 1024 },
    //     num_inference_steps: opts.num_inference_steps ?? 28,
    //   },
    // });
    // return { url: result.data.images[0].url, width: result.data.images[0].width, height: result.data.images[0].height, request_id: result.requestId };
    throw new Error('[FalAiAdapter] FAL_KEY set but real fal.ai client not yet wired — see TODO above.');
  }

  /**
   * Generate a short video from a sequence of images.
   * Used for: post-MVP short-form video generation from job photos.
   *
   * Model: fal-ai/stable-video-diffusion (or fal-ai/cogvideox-5b for img2video)
   */
  async videoFromImages(opts: FalVideoFromImagesOptions): Promise<FalResult> {
    if (!this.apiKey) {
      // TODO: real fal.ai endpoint when API key wired
      // POST https://fal.run/fal-ai/stable-video-diffusion
      return {
        url: `mock://fal-ai/video-from-images?frames=${opts.image_urls.length}&fps=${opts.fps ?? 8}`,
      };
    }

    // TODO: real fal.ai endpoint when API key wired
    // const { fal } = await import('@fal-ai/client');
    // fal.config({ credentials: this.apiKey });
    // const result = await fal.subscribe('fal-ai/cogvideox-5b', {
    //   input: {
    //     image_url: opts.image_urls[0],
    //     prompt: opts.prompt ?? 'smooth transition, professional automotive photography',
    //   },
    // });
    // return { url: result.data.video.url, request_id: result.requestId };
    throw new Error('[FalAiAdapter] FAL_KEY set but real fal.ai client not yet wired — see TODO above.');
  }
}
