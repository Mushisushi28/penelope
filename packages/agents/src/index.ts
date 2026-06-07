// Penelope head agent
export { classifyIntent, route, INTENT_TOPIC_MAP } from "./penelope/meta-router.js";
export type { InboundOwnerMessage, BusDispatch, Intent } from "./penelope/meta-router.js";

// PenelopeHeadAgent runtime
export {
  PenelopeHeadAgent,
  buildAnthropicLLMProvider,
  buildInMemoryStore,
} from "./penelope/head-agent.js";
export type {
  LLMProvider,
  MemoryStore,
  ProcedureLibrary,
  PenelopeHeadAgentOptions,
} from "./penelope/head-agent.js";

// Penelope command handlers
export {
  dispatchCommand,
  handleStart,
  handleStatus,
  handleHelp,
  handleInbox,
  handleQuote,
  handleFollowup,
  handleBook,
  handleReview,
} from "./penelope/commands.js";
export type { CommandContext, CommandResult, CommandName } from "./penelope/commands.js";

// Specialist base class
export { SpecialistAgent } from "./specialists/base.js";
export type { SpecialistConfig, SpecialistRole } from "./specialists/base.js";

// Telegram-owner adapter (Penelope-exclusive)
export { TelegramOwnerAdapter } from "./adapters/telegram-owner.js";
export type { TelegramOwnerConfig, OutboundOwnerMessage } from "./adapters/telegram-owner.js";

// Tenant schema
export { validateAgentConfig, TenantConfigError } from "./tenant/schema.js";
export type { TenantConfig, AgentConfig, PenelopeAgentConfig, SpecialistAgentConfig, AgentRole } from "./tenant/schema.js";

// Marketing specialist
export { MarketingSpecialist, isQuietHours, FbPageAdapter, InstagramAdapter, TwitterAdapter } from "./specialists/marketing.js";
export type { PostInput, GeneratedPost, MarketingDraft, MarketingConfig, MarketingSpecialistConfig, PublishResult, ChannelAdapter } from "./specialists/marketing.js";

// Marketing scheduler
export { MarketingScheduler, parseCadence, shouldFire, getMondayOfWeek, todayUTC } from "./specialists/marketing-scheduler.js";
export type { SchedulerConfig, SchedulerState } from "./specialists/marketing-scheduler.js";

// Browser specialist
export { BrowserSpecialist, registerRecipe, getRecipe, requiresConfirmation } from "./specialists/browser.js";
export type {
  BrowserSpecialistConfig,
  BrowserResult,
  StepTrace,
  StepAction,
  EscalationPayload,
  ExecuteOptions,
  StagehandPage,
  StagehandInstance,
  StagehandFactory,
  RecipeHandler,
} from "./specialists/browser.js";

// Browser recipes
export { yelpReviewCountRecipe } from "./specialists/browser-recipes/yelp-review-count.js";
export type { YelpReviewData } from "./specialists/browser-recipes/yelp-review-count.js";
export { nextdoorPostRecipe } from "./specialists/browser-recipes/nextdoor-post.js";
export type { NextdoorPostData } from "./specialists/browser-recipes/nextdoor-post.js";

// Follow-up specialist
export {
  FollowUpSpecialist,
  StubChannelAdapter,
  hasOptedOut,
  isQuietHours as isFollowUpQuietHours,
  withinRateLimit,
  nextQuietEnd,
} from "./specialists/follow-up.js";
export type {
  FollowUpStage,
  CustomerThread,
  FollowUpDraft,
  FollowUpConfig,
  FollowUpSpecialistConfig,
  FindDormantOptions,
  ChannelSendAdapter,
} from "./specialists/follow-up.js";

// Follow-up scheduler
export { FollowUpScheduler, todayUTC as followUpTodayUTC } from "./specialists/follow-up-scheduler.js";
export type { SchedulerState as FollowUpSchedulerState, SchedulerRunResult } from "./specialists/follow-up-scheduler.js";

// Content specialist
export {
  ContentSpecialist,
  isContentQuietHours,
  contentTodayUTC,
  isImageFile,
  dateSlug,
} from "./specialists/content.js";
export type {
  ImageCategory,
  ClassifyImageResult,
  BeforeAfterResult,
  CleanupResult,
  StaticPromoResult,
  SortResult,
  ContentConfig,
  ContentSpecialistConfig,
} from "./specialists/content.js";

// Content scheduler
export { ContentScheduler } from "./specialists/content-scheduler.js";
export type { ContentSchedulerState, ContentSchedulerRunResult } from "./specialists/content-scheduler.js";
