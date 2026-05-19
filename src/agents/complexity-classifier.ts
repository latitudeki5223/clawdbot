/**
 * Complexity classifier for intelligent model routing.
 *
 * Analyzes incoming prompts and session context to determine complexity level,
 * which is used to route requests to the appropriate model tier:
 * - simple: Quick queries, greetings → Haiku
 * - medium: Standard conversations, moderate reasoning → Sonnet
 * - complex: Heavy analysis, debugging, architecture → Opus
 */

export type ComplexityLevel = "simple" | "medium" | "complex";

export type ComplexityResult = {
  level: ComplexityLevel;
  score: number; // 0-100
  factors: string[]; // Which factors triggered
  model: string; // Recommended model ref
};

export type ComplexityClassifierParams = {
  prompt: string;
  contextTurns?: number;
  contextTokens?: number;
  hasImages?: boolean;
  recentToolUse?: boolean;
};

export type ComplexityThresholds = {
  simpleMax: number; // Score <= this = simple
  mediumMax: number; // Score <= this = medium, > this = complex
};

export const DEFAULT_THRESHOLDS: ComplexityThresholds = {
  simpleMax: 30,
  mediumMax: 70,
};

// Pattern matchers for complexity detection
const GREETING_PATTERNS = [
  /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|bye|goodbye|sure|yep|nope|cool|great|nice)\b/i,
  /^(good morning|good afternoon|good evening|good night)\b/i,
  /^(what's up|sup|yo)\b/i,
];

const SIMPLE_COMMAND_PATTERNS = [
  /^\/?(add|show|clear|list|get|set|delete|remove|status|help|commands)\b/i,
  /^(what time|what date|what day|how are you)\b/i,
  /^(tell me the time|what's the time|current time)\b/i,
];

const COMPLEX_KEYWORD_PATTERNS = [
  /\b(analyze|analyse|debug|refactor|explain why|architecture|design|compare)\b/i,
  /\b(investigate|troubleshoot|diagnose|optimize|performance)\b/i,
  /\b(implement|build|create|develop|construct)\s+(a|an|the|this)\s+\w+/i,
  /\b(review|audit|assess|evaluate)\s+(the|this|my)\s+/i,
  /\b(multi-?step|step-by-step|detailed|comprehensive|thorough)\b/i,
  /\b(bug|error|exception|issue|problem|crash|fail(ure|ed|ing)?)\b/i,
];

const THINKING_DIRECTIVE_PATTERN = /\/think(ing)?\s+(medium|high)/i;
const CODE_BLOCK_PATTERN = /```[\s\S]+?```/;
const ERROR_STACK_PATTERN =
  /\b(Error|Exception|Traceback|at\s+[\w.]+\s*\(|caused by:)/i;

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Classify the complexity of a prompt and session context.
 *
 * Scoring algorithm:
 * - Starts at 35 (medium baseline)
 * - Adjusts based on message length, patterns, and context factors
 * - Clamps to 0-100 range
 * - Maps to complexity level based on thresholds
 */
export function classifyComplexity(
  params: ComplexityClassifierParams,
  thresholds: ComplexityThresholds = DEFAULT_THRESHOLDS,
  modelMap: Record<ComplexityLevel, string> = {
    simple: "anthropic/claude-3-5-haiku-20241022",
    medium: "anthropic/claude-sonnet-4-5-20250514",
    complex: "anthropic/claude-opus-4-5-20250115",
  },
): ComplexityResult {
  const {
    prompt,
    contextTurns = 0,
    contextTokens = 0,
    hasImages = false,
    recentToolUse = false,
  } = params;

  let score = 50; // Start at medium baseline (middle of 0-100)
  const factors: string[] = [];
  const trimmedPrompt = prompt.trim();

  // Check for simple patterns first (greetings + basic commands)
  const hasGreeting = matchesAny(trimmedPrompt, GREETING_PATTERNS);
  const hasSimpleCommand = matchesAny(trimmedPrompt, SIMPLE_COMMAND_PATTERNS);
  const hasComplexKeywords = matchesAny(
    trimmedPrompt,
    COMPLEX_KEYWORD_PATTERNS,
  );
  const hasCodeBlock = CODE_BLOCK_PATTERN.test(trimmedPrompt);
  const hasError = ERROR_STACK_PATTERN.test(trimmedPrompt);
  const hasThinkingDirective = THINKING_DIRECTIVE_PATTERN.test(trimmedPrompt);

  // Length factors - only apply if no strong content signals
  if (trimmedPrompt.length < 100 && !hasComplexKeywords && !hasCodeBlock) {
    score -= 15;
    factors.push("short-message");
  } else if (trimmedPrompt.length > 500) {
    score += 10;
    factors.push("long-message");
  }

  // Simple patterns: greetings + basic commands (strong simplicity signal)
  if (hasGreeting) {
    score -= 30;
    factors.push("greeting-pattern");
  }
  if (hasSimpleCommand) {
    score -= 25;
    factors.push("simple-command");
  }

  // Complex patterns: analysis keywords, debugging, etc. (strong complexity signal)
  if (hasComplexKeywords) {
    score += 30;
    factors.push("complex-keywords");
  }

  // Code blocks indicate higher complexity
  if (hasCodeBlock) {
    score += 35;
    factors.push("code-block");
  }

  // Error/stack trace patterns
  if (hasError) {
    score += 20;
    factors.push("error-content");
  }

  // Explicit thinking directive (strong complexity signal)
  if (hasThinkingDirective) {
    score += 40;
    factors.push("thinking-directive");
  }

  // Context factors
  if (contextTurns > 20) {
    score += 20;
    factors.push("large-context-turns");
  } else if (contextTurns > 10) {
    score += 10;
    factors.push("moderate-context-turns");
  }

  if (contextTokens > 50000) {
    score += 20;
    factors.push("high-tokens");
  } else if (contextTokens > 20000) {
    score += 10;
    factors.push("moderate-tokens");
  }

  if (hasImages) {
    score += 15;
    factors.push("has-images");
  }

  if (recentToolUse) {
    score += 10;
    factors.push("recent-tool-use");
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Classify based on thresholds
  let level: ComplexityLevel;
  if (score <= thresholds.simpleMax) {
    level = "simple";
  } else if (score <= thresholds.mediumMax) {
    level = "medium";
  } else {
    level = "complex";
  }

  return {
    level,
    score,
    factors,
    model: modelMap[level],
  };
}

/**
 * Quick check if a prompt appears to be a simple greeting/command.
 * Useful for fast-path decisions without full classification.
 */
export function isSimplePrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length > 100) return false;
  return (
    matchesAny(trimmed, GREETING_PATTERNS) ||
    matchesAny(trimmed, SIMPLE_COMMAND_PATTERNS)
  );
}

/**
 * Quick check if a prompt appears to require complex reasoning.
 * Useful for fast-path decisions without full classification.
 */
export function isComplexPrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  return (
    matchesAny(trimmed, COMPLEX_KEYWORD_PATTERNS) ||
    CODE_BLOCK_PATTERN.test(trimmed) ||
    THINKING_DIRECTIVE_PATTERN.test(trimmed) ||
    trimmed.length > 1000
  );
}
