/**
 * L36 Social Composer client.
 *
 * Thin HTTP wrapper around `POST /api/social/compose-and-queue`. ClawdBot
 * is a trigger only — Claude / Pi SDK are NOT invoked here. L36 generates
 * the copy server-side via LangGraph and queues the post for human approval
 * through the existing Telegram flow (`src/telegram/social-approval.ts`).
 *
 * Auth: admin-role agent key (`L36_AGENT_ADMIN_KEY`) + `X-Context-ID`.
 * Contract: `clawdbot/docs/integrations/social-composer.md`.
 */

export interface ComposeInput {
  topic: string;
  tone: "playful" | "informative" | "urgent" | "educational" | "promotional";
  target_account: string;
  platform?:
    | "instagram"
    | "facebook"
    | "tiktok"
    | "linkedin"
    | "x"
    | "pinterest"
    | "youtube";
  /** ISO 8601 with timezone (e.g. `2026-05-25T09:00:00+10:00` or `...Z`). */
  schedule_at?: string;
}

export interface ComposeResult {
  post_id: number;
  platform: string;
  social_account_id: number;
  status: string;
  scheduled_for: string | null;
  preview: { caption: string; hashtags: string[] };
  content_id: number;
}

export class ComposerHttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body?: unknown;

  constructor(message: string, status: number, code?: string, body?: unknown) {
    super(message);
    this.name = "ComposerHttpError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

const DEFAULT_BASE = "http://127.0.0.1:5050";
const DEFAULT_CONTEXT_ID = "1";

export async function composeAndQueueSocialPost(
  input: ComposeInput,
): Promise<ComposeResult> {
  const apiKey = process.env.L36_AGENT_ADMIN_KEY;
  if (!apiKey) {
    throw new Error(
      "L36_AGENT_ADMIN_KEY is not set — cannot call L36 social composer",
    );
  }

  const base = process.env.L36_API_BASE ?? DEFAULT_BASE;
  const contextId = process.env.L36_CONTEXT_ID ?? DEFAULT_CONTEXT_ID;
  const url = `${base}/api/social/compose-and-queue`;

  const body: Record<string, unknown> = {
    topic: input.topic,
    tone: input.tone,
    target_account: input.target_account,
  };
  if (input.platform !== undefined) body.platform = input.platform;
  if (input.schedule_at !== undefined) body.schedule_at = input.schedule_at;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        "X-Context-ID": contextId,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`L36 composer request failed: ${msg}`);
  }

  const parsed = await safeJson(response);

  if (!response.ok) {
    const errMsg =
      (parsed && typeof parsed === "object" && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : null) ?? `HTTP ${response.status}`;
    const code =
      parsed && typeof parsed === "object" && "code" in parsed
        ? String((parsed as { code: unknown }).code)
        : undefined;
    throw new ComposerHttpError(errMsg, response.status, code, parsed);
  }

  if (!parsed || typeof parsed !== "object" || !("data" in parsed)) {
    throw new ComposerHttpError(
      "L36 composer returned unexpected response shape",
      response.status,
      undefined,
      parsed,
    );
  }

  return (parsed as { data: ComposeResult }).data;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
