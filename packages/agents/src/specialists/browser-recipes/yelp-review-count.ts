/**
 * Recipe: yelp-review-count
 *
 * Navigate to a Yelp business page and extract the review count + average
 * star rating.
 *
 * Usage:
 *   specialist.execute({
 *     goal: 'yelp-review-count',
 *     startUrl: 'https://www.yelp.com/biz/example-business',
 *   });
 *
 * Extracted shape:
 *   { reviewCount: number, averageStars: number, businessName: string }
 */

import type { RecipeHandler } from "../browser.js";

export interface YelpReviewData {
  reviewCount: number;
  averageStars: number;
  businessName: string;
}

export const yelpReviewCountRecipe: RecipeHandler = async (
  page,
  startUrl,
  _options,
  emitStep,
) => {
  // Navigation is handled by execute() before the recipe is called.
  // The page is already at startUrl.

  emitStep({
    action: "extract",
    target: startUrl,
    result: "extracting review count and average stars from Yelp page",
  });

  const data = await page.extract<YelpReviewData>(
    `Extract the following from this Yelp business page:
     - reviewCount: the total number of reviews (integer)
     - averageStars: the average star rating (float, e.g. 4.5)
     - businessName: the name of the business
     Return as JSON with keys: reviewCount, averageStars, businessName.`,
  );

  emitStep({
    action: "extract",
    target: "yelp-review-data",
    result: `extracted reviewCount=${data.reviewCount}, averageStars=${data.averageStars}, business="${data.businessName}"`,
  });

  return {
    reviewCount: data.reviewCount ?? 0,
    averageStars: data.averageStars ?? 0,
    businessName: data.businessName ?? "",
  };
};
