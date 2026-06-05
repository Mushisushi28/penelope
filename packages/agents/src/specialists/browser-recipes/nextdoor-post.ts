/**
 * Recipe: nextdoor-post
 *
 * Post a status update to Nextdoor using the tenant's saved login session
 * stored in their sandboxed Chrome profile.
 *
 * Prerequisites:
 *   - The tenant's Chrome profile (tenants/<id>/state/chrome-profile/) must
 *     contain a valid Nextdoor login session (cookies/localStorage). Isaac or
 *     the tenant authenticates once via a real browser pointed at that
 *     userDataDir; the session is reused on subsequent recipe runs.
 *
 * Usage:
 *   specialist.execute({
 *     goal: 'nextdoor-post',
 *     startUrl: 'https://nextdoor.com',
 *     // pass post text via the goal field or extend ExecuteOptions with extras
 *   });
 *
 * This recipe escalates (confirm-needed) before submitting the post so the
 * owner can review the draft before it goes live.
 *
 * Extracted shape:
 *   { posted: boolean, postText: string, url?: string }
 */

import type { RecipeHandler } from "../browser.js";

export interface NextdoorPostData {
  posted: boolean;
  postText: string;
  url?: string;
}

/**
 * Extract the post text from the goal or a `postText` query parameter in
 * the startUrl (for convenience).
 */
function extractPostText(startUrl: string, goal: string): string {
  try {
    const url = new URL(startUrl);
    const param = url.searchParams.get("postText");
    if (param) return param;
  } catch {
    // not a valid URL or no param — fall through
  }
  // Strip the recipe name prefix if present
  const stripped = goal.replace(/^nextdoor-post\s*[:\-]?\s*/i, "").trim();
  return stripped || "Hello neighbors! Sharing an update from our local business.";
}

export const nextdoorPostRecipe: RecipeHandler = async (
  page,
  startUrl,
  options,
  emitStep,
) => {
  const postText = extractPostText(startUrl, options.goal);

  // Navigate to Nextdoor home — session cookies from the Chrome profile
  // should restore the login automatically.
  const homeUrl = "https://nextdoor.com";
  if (!startUrl.includes("nextdoor.com")) {
    await page.goto(homeUrl);
    emitStep({
      action: "navigate",
      target: homeUrl,
      result: "navigated to Nextdoor home",
    });
  }

  // Open the post composer
  await page.act('Click the "What\'s on your mind?" or "Post" composer button to start a new post');
  emitStep({
    action: "click",
    target: "post-composer",
    result: "opened post composer",
  });

  // Type the post content
  await page.act(`Type the following text into the post composer: "${postText}"`);
  emitStep({
    action: "type",
    target: "post-composer-input",
    result: `typed post text: "${postText.slice(0, 80)}${postText.length > 80 ? "..." : ""}"`,
  });

  // Extract a preview before submitting — the caller (execute()) checks for
  // confirm-needed patterns on the "Share" / "Post" button description returned
  // by act(). We surface the preview here via extract() so Penelope can show it.
  const preview = await page.extract<{ composerText: string }>(
    "Extract the current text visible in the post composer input field.",
  );
  emitStep({
    action: "extract",
    target: "post-preview",
    result: `preview: "${String(preview.composerText ?? postText).slice(0, 120)}"`,
  });

  // NOTE: The actual "Share" click is intentionally NOT performed here.
  // The recipe returns the preview and relies on the BrowserSpecialist's
  // confirm-needed escalation path to pause and ask Penelope/owner before
  // the post goes live. To auto-submit (for approved workflows), extend this
  // recipe with an explicit `confirmed: true` option and add the submit step
  // inside that guard.

  return {
    posted: false,
    postText: String(preview.composerText ?? postText),
    url: undefined,
  } satisfies NextdoorPostData;
};
