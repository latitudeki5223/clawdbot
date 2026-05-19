/**
 * Social Approval Callback Handler
 *
 * Handles Telegram inline button callbacks for L36 social post approvals.
 * Callback data format: "social_approve:{postId}" or "social_reject:{postId}"
 *
 * Calls L36 backend approval API, then edits the original Telegram message
 * to show the result.
 */

import type { Bot } from "grammy";

/** Minimal callback query shape from Telegram Bot API. */
interface CallbackQuery {
  id: string;
  data?: string;
  from: { id: number; first_name: string };
  message?: { chat: { id: number }; message_id: number; text?: string };
}

const L36_API_BASE =
  process.env.L36_API_BASE ?? "http://127.0.0.1:5050";
const L36_ADMIN_TOKEN =
  process.env.L36_ADMIN_TOKEN ?? process.env.ADMIN_TOKEN_MAIN ?? "";

/**
 * Returns true if the callback data is a social approval action.
 */
export function isSocialApprovalCallback(data: string): boolean {
  return data.startsWith("social_approve:") || data.startsWith("social_reject:");
}

/**
 * Handle a social approval/reject callback from an inline button tap.
 */
export async function handleSocialApprovalCallback(
  bot: Bot,
  callback: CallbackQuery,
  data: string,
): Promise<void> {
  const [actionKey, postIdStr] = data.split(":");
  const postId = Number.parseInt(postIdStr, 10);

  if (!Number.isFinite(postId) || postId <= 0) {
    await answerCallback(bot, callback.id, "Invalid post ID");
    return;
  }

  const action = actionKey === "social_approve" ? "approve" : "delete";
  const chatId = callback.message?.chat?.id;
  const messageId = callback.message?.message_id;

  try {
    const resp = await fetch(
      `${L36_API_BASE}/api/social/posts/${postId}/approval-action`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Token": L36_ADMIN_TOKEN,
        },
        body: JSON.stringify({ action }),
      },
    );

    const result = (await resp.json().catch(() => ({}))) as Record<string, unknown>;

    if (resp.ok && result.success !== false) {
      const emoji = action === "approve" ? "\u2705" : "\u274c";
      const label = action === "approve" ? "Approved & Publishing" : "Rejected";
      await answerCallback(bot, callback.id, `${emoji} ${label}`);

      // Edit the original message to reflect the outcome
      if (chatId && messageId) {
        const original = callback.message && "text" in callback.message
          ? callback.message.text ?? ""
          : "";
        await bot.api
          .editMessageText(chatId, messageId, `${emoji} ${label}\n\n${original}`, {
            reply_markup: { inline_keyboard: [] },
          })
          .catch(() => {});
      }
    } else {
      const errMsg = typeof result.error === "string" ? result.error : `HTTP ${resp.status}`;
      await answerCallback(bot, callback.id, `Failed: ${errMsg}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[social-approval] API call failed for post ${postId}: ${msg}`);
    await answerCallback(bot, callback.id, "Error contacting L36");
  }
}

async function answerCallback(bot: Bot, callbackId: string, text: string): Promise<void> {
  await bot.api.answerCallbackQuery(callbackId, { text }).catch(() => {});
}
