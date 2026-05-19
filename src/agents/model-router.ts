/**
 * Model router for intelligent model selection based on task complexity.
 *
 * Automatically routes requests to the appropriate model tier:
 * - Haiku: Quick queries, greetings, simple factual questions
 * - Sonnet: Standard conversations, moderate reasoning
 * - Opus: Heavy analysis, debugging, architecture, multi-step reasoning
 */

import type { ClawdbotConfig } from "../config/config.js";
import type { SessionEntry } from "../config/sessions.js";
import { createSubsystemLogger } from "../logging.js";
import {
  type ComplexityLevel,
  type ComplexityResult,
  type ComplexityThresholds,
  classifyComplexity,
  DEFAULT_THRESHOLDS,
} from "./complexity-classifier.js";
import { parseModelRef } from "./model-selection.js";

const log = createSubsystemLogger("agents/model-router");

export type ModelRouterConfig = {
  /** Enable intelligent model routing. Default: false. */
  enabled?: boolean;
  /** Model refs for each complexity level. */
  models?: {
    simple?: string; // e.g., "anthropic/claude-3-5-haiku-20241022"
    medium?: string; // e.g., "anthropic/claude-sonnet-4-5-20250514"
    complex?: string; // e.g., "anthropic/claude-opus-4-5-20250115"
  };
  /** Score thresholds for complexity levels. */
  thresholds?: {
    simpleMax?: number; // Score <= this = simple (default: 30)
    mediumMax?: number; // Score <= this = medium (default: 70)
  };
  /** Log routing decisions. Default: false. */
  logDecisions?: boolean;
};

export type SessionContext = {
  turnCount: number;
  contextTokens: number;
  hasImages: boolean;
  lastAssistantHadToolUse: boolean;
};

export type RoutedModelResult = {
  provider: string;
  model: string;
  complexity: ComplexityResult;
};

const DEFAULT_MODELS: Record<ComplexityLevel, string> = {
  simple: "anthropic/claude-3-5-haiku-20241022",
  medium: "anthropic/claude-sonnet-4-5-20250514",
  complex: "anthropic/claude-opus-4-5-20250115",
};

/**
 * Resolve the model router configuration from the config.
 */
export function resolveModelRouterConfig(
  cfg: ClawdbotConfig,
): ModelRouterConfig | undefined {
  const routerConfig = (
    cfg.agents?.defaults as { modelRouter?: ModelRouterConfig } | undefined
  )?.modelRouter;
  return routerConfig;
}

/**
 * Check if model routing is enabled.
 */
export function isModelRoutingEnabled(cfg: ClawdbotConfig): boolean {
  const routerConfig = resolveModelRouterConfig(cfg);
  return routerConfig?.enabled === true;
}

/**
 * Parse a model reference string into provider/model parts.
 */
function parseModelRefSafe(
  modelRef: string,
  defaultProvider: string,
): { provider: string; model: string } | null {
  const parsed = parseModelRef(modelRef, defaultProvider);
  if (!parsed) return null;
  return { provider: parsed.provider, model: parsed.model };
}

/**
 * Build the model map from config, falling back to defaults.
 */
function buildModelMap(
  routerConfig: ModelRouterConfig,
): Record<ComplexityLevel, string> {
  const models = routerConfig.models ?? {};
  return {
    simple: models.simple ?? DEFAULT_MODELS.simple,
    medium: models.medium ?? DEFAULT_MODELS.medium,
    complex: models.complex ?? DEFAULT_MODELS.complex,
  };
}

/**
 * Build thresholds from config, falling back to defaults.
 */
function buildThresholds(
  routerConfig: ModelRouterConfig,
): ComplexityThresholds {
  const thresholds = routerConfig.thresholds ?? {};
  return {
    simpleMax: thresholds.simpleMax ?? DEFAULT_THRESHOLDS.simpleMax,
    mediumMax: thresholds.mediumMax ?? DEFAULT_THRESHOLDS.mediumMax,
  };
}

/**
 * Extract session context from a session entry for complexity classification.
 */
export function extractSessionContext(
  sessionEntry?: SessionEntry,
): SessionContext {
  // Estimate turn count from token usage (rough heuristic)
  const inputTokens = sessionEntry?.inputTokens ?? 0;
  const outputTokens = sessionEntry?.outputTokens ?? 0;
  const totalTokens = sessionEntry?.totalTokens ?? inputTokens + outputTokens;

  // Rough estimate: ~500 tokens per turn average
  const estimatedTurns = Math.floor(totalTokens / 500);

  return {
    turnCount: Math.max(0, estimatedTurns),
    contextTokens: sessionEntry?.contextTokens ?? totalTokens,
    hasImages: false, // Will be set by caller if applicable
    lastAssistantHadToolUse: false, // Will be set by caller if applicable
  };
}

/**
 * Resolve the routed model based on complexity classification.
 *
 * Returns undefined if:
 * - Model routing is disabled
 * - User has an explicit model override
 * - Configuration is invalid
 */
export function resolveRoutedModel(params: {
  cfg: ClawdbotConfig;
  prompt: string;
  sessionContext?: SessionContext;
  sessionEntry?: SessionEntry;
  defaultProvider?: string;
  hasImages?: boolean;
  recentToolUse?: boolean;
}): RoutedModelResult | undefined {
  const {
    cfg,
    prompt,
    sessionEntry,
    defaultProvider = "anthropic",
    hasImages = false,
    recentToolUse = false,
  } = params;

  const routerConfig = resolveModelRouterConfig(cfg);
  if (!routerConfig?.enabled) return undefined;

  // Extract session context
  const sessionContext =
    params.sessionContext ?? extractSessionContext(sessionEntry);

  // Classify complexity
  const thresholds = buildThresholds(routerConfig);
  const modelMap = buildModelMap(routerConfig);

  const complexity = classifyComplexity(
    {
      prompt,
      contextTurns: sessionContext.turnCount,
      contextTokens: sessionContext.contextTokens,
      hasImages: hasImages || sessionContext.hasImages,
      recentToolUse: recentToolUse || sessionContext.lastAssistantHadToolUse,
    },
    thresholds,
    modelMap,
  );

  // Parse the selected model ref
  const modelRef = modelMap[complexity.level];
  const parsed = parseModelRefSafe(modelRef, defaultProvider);
  if (!parsed) {
    log.warn("failed to parse routed model ref", {
      modelRef,
      level: complexity.level,
    });
    return undefined;
  }

  // Log decision if enabled
  if (routerConfig.logDecisions) {
    log.info("model-router decision", {
      level: complexity.level,
      score: complexity.score,
      factors: complexity.factors,
      model: `${parsed.provider}/${parsed.model}`,
    });
  }

  return {
    provider: parsed.provider,
    model: parsed.model,
    complexity,
  };
}

/**
 * Check if a session has an explicit model override that should skip routing.
 */
export function hasModelOverride(sessionEntry?: SessionEntry): boolean {
  return !!(sessionEntry?.providerOverride || sessionEntry?.modelOverride);
}

/**
 * Should skip model routing for this request?
 *
 * Returns true if:
 * - User has explicit model override in session
 * - Request is a heartbeat/system message
 * - Model routing is disabled
 */
export function shouldSkipRouting(params: {
  cfg: ClawdbotConfig;
  sessionEntry?: SessionEntry;
  isHeartbeat?: boolean;
  hasModelDirective?: boolean;
}): boolean {
  const {
    cfg,
    sessionEntry,
    isHeartbeat = false,
    hasModelDirective = false,
  } = params;

  // Skip if routing disabled
  if (!isModelRoutingEnabled(cfg)) return true;

  // Skip if user has explicit model override
  if (hasModelOverride(sessionEntry)) return true;

  // Skip if this is a heartbeat (uses its own model config)
  if (isHeartbeat) return true;

  // Skip if user specified model via directive
  if (hasModelDirective) return true;

  return false;
}

/**
 * Format a routing decision for display/logging.
 */
export function formatRoutingDecision(result: RoutedModelResult): string {
  const { complexity, provider, model } = result;
  const factorsSummary =
    complexity.factors.length > 0 ? ` [${complexity.factors.join(", ")}]` : "";
  return `${complexity.level} (score: ${complexity.score})${factorsSummary} → ${provider}/${model}`;
}
