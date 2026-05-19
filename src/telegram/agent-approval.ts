/**
 * Agent Approval Callback Handler
 *
 * Handles Telegram inline button callbacks for L36 agent task approvals
 * (e.g. Max's learning-loop / agent-board notifications).
 *
 * Callback data format: "agent_approve:{notificationId}" or "agent_revise:{notificationId}"
 *
 * Calls L36 backend `/api/notifications/{id}/action` to record the decision,
 * then edits the original Telegram message to show the result.
 */

import type { Bot } from "grammy";

/** Minimal callback query shape from Telegram Bot API. */
interface CallbackQuery {
  id: string;
  data?: string;
  from: { id: number; first_name: string };
  message?: { chat: { id: number }; message_id: number; text?: string };
}

const L36_API_BASE = process.env.L36_API_BASE ?? "http://127.0.0.1:5050";
const L36_ADMIN_TOKEN =
  process.env.L36_ADMIN_TOKEN ?? process.env.ADMIN_TOKEN_MAIN ?? "";
const L36_CONTEXT_ID = process.env.L36_CONTEXT_ID ?? "1";

/**
 * Returns true if the callback data is an agent task approval action.
 */
export function isAgentApprovalCallback(data: string): boolean {
  return data.startsWith("agent_approve:") || data.startsWith("agent_revise:");
}

/**
 * Handle an agent task approve/revise callback from an inline button tap.
 */
export async function handleAgentApprovalCallback(
  bot: Bot,
  callback: CallbackQuery,
  data: string,
): Promise<void> {
  const [actionKey, notificationIdStr] = data.split(":");
  const notificationId = Number.parseInt(notificationIdStr ?? "", 10);

  if (!Number.isFinite(notificationId) || notificationId <= 0) {
    await answerCallback(bot, callback.id, "Invalid notification ID");
    return;
  }

  const status = actionKey === "agent_approve" ? "approved" : "revise";
  const chatId = callback.message?.chat?.id;
  const messageId = callback.message?.message_id;

  try {
    const resp = await fetch(
      `${L36_API_BASE}/api/notifications/${notificationId}/action`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Token": L36_ADMIN_TOKEN,
          "X-Context-ID": L36_CONTEXT_ID,
        },
        body: JSON.stringify({ status }),
      },
    );

    const result = (await resp.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (resp.ok && result.success !== false) {
      const emoji = status === "approved" ? "\u2705" : "\ud83d\udd01";
      const label = status === "approved" ? "Approved" : "Revise requested";
      await answerCallback(bot, callback.id, `${emoji} ${label}`);

      if (chatId && messageId) {
        const original =
          callback.message && "text" in callback.message
            ? (callback.message.text ?? "")
            : "";
        await bot.api
          .editMessageText(
            chatId,
            messageId,
            `${emoji} ${label}\n\n${original}`,
            { reply_markup: { inline_keyboard: [] } },
          )
          .catch(() => {});
      }
    } else {
      const errMsg =
        typeof result.error === "string"
          ? result.error
          : `HTTP ${resp.status}`;
      await answerCallback(bot, callback.id, `Failed: ${errMsg}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[agent-approval] API call failed for notification ${notificationId}: ${msg}`,
    );
    await answerCallback(bot, callback.id, "Error contacting L36");
  }
}

async function answerCallback(
  bot: Bot,
  callbackId: string,
  text: string,
): Promise<void> {
  await bot.api.answerCallbackQuery(callbackId, { text }).catch(() => {});
}
