/**
 * FacebookMessengerAdapter — connector for the Meta Graph API Messenger send API.
 *
 * Supports messaging_type=RESPONSE (within 24h of last customer message) only.
 * HUMAN_AGENT 7-day window requires App Review (see Meta developer portal).
 * Real API calls activate when a page token is provided; mock responses returned otherwise.
 *
 * Graph API reference: https://developers.facebook.com/docs/messenger-platform/
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export type MessagingType = 'RESPONSE' | 'UPDATE' | 'MESSAGE_TAG';

export interface SendMessageOptions {
  /** Messaging type. Defaults to 'RESPONSE' (within 24h window). */
  messagingType?: MessagingType;
  /** Message tag — required when messagingType is MESSAGE_TAG. */
  tag?: string;
  /** Notification type: REGULAR | SILENT_PUSH | NO_PUSH. Defaults to REGULAR. */
  notificationType?: 'REGULAR' | 'SILENT_PUSH' | 'NO_PUSH';
  /** Quick replies to attach to the message. */
  quickReplies?: QuickReply[];
}

export interface QuickReply {
  content_type: 'text' | 'user_phone_number' | 'user_email';
  title?: string;
  payload?: string;
}

export interface SendMessageResult {
  /** PSID of the recipient. */
  recipient_id: string;
  /** Unique message ID assigned by Facebook. */
  message_id: string;
  /** True when the adapter is in mock mode (no real token). */
  mock?: boolean;
}

export interface ReactToMessageOptions {
  /** Reaction emoji. Facebook only accepts a fixed set — '❤', '😍', '😮', '😂', '😢', '👍', '👎'. */
  reaction?: string;
  /** 'react' (add) or 'unreact' (remove). Defaults to 'react'. */
  action?: 'react' | 'unreact';
}

export interface ThreadMessage {
  id: string;
  message: string;
  from: { id: string; name?: string };
  created_time: string;
}

export interface ThreadHistoryResult {
  data: ThreadMessage[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

export interface Conversation {
  id: string;
  updated_time: string;
  participants?: { data: Array<{ id: string; name?: string }> };
  snippet?: string;
  unread_count?: number;
}

export interface ConversationListResult {
  data: Conversation[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

export interface GetConversationsOptions {
  limit?: number;
  /** Filter to only unread threads. */
  unread_only?: boolean;
  /** Pagination cursor (after). */
  after?: string;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';

/**
 * Thin typed wrapper over the Meta Graph API for Messenger.
 *
 * Constructor accepts a page access token directly, or falls back to the
 * TENANT_FB_PAGE_TOKEN environment variable. When neither is present the adapter
 * operates in mock mode — all methods resolve immediately with synthetic data
 * so the rest of the Penelope stack can be exercised without a live token.
 */
export class FacebookMessengerAdapter {
  private readonly pageToken: string | null;

  constructor(pageToken?: string) {
    this.pageToken = pageToken ?? process.env['TENANT_FB_PAGE_TOKEN'] ?? null;
  }

  /** True when no real page token is wired — methods return mock data. */
  get isMock(): boolean {
    return this.pageToken === null;
  }

  // ─── Core methods ─────────────────────────────────────────────────────────

  /**
   * Send a text message to a customer via their PSID.
   *
   * POST /me/messages
   * messaging_type=RESPONSE (valid within 24h of last customer message)
   */
  async sendMessage(
    psid: string,
    text: string,
    opts: SendMessageOptions = {},
  ): Promise<SendMessageResult> {
    const messagingType = opts.messagingType ?? 'RESPONSE';

    if (this.isMock) {
      // TODO: real Graph API call when TENANT_FB_PAGE_TOKEN is wired
      // POST https://graph.facebook.com/v19.0/me/messages?access_token=<token>
      // body: { recipient: { id: psid }, message: { text }, messaging_type, notification_type }
      return {
        recipient_id: psid,
        message_id: `mock_mid_${Date.now()}`,
        mock: true,
      };
    }

    const body: Record<string, unknown> = {
      recipient: { id: psid },
      message: {
        text,
        ...(opts.quickReplies ? { quick_replies: opts.quickReplies } : {}),
      },
      messaging_type: messagingType,
      notification_type: opts.notificationType ?? 'REGULAR',
      ...(opts.tag ? { tag: opts.tag } : {}),
    };

    const res = await fetch(`${GRAPH_BASE}/me/messages?access_token=${this.pageToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[FacebookMessengerAdapter] sendMessage failed (${res.status}): ${err}`);
    }

    return (await res.json()) as SendMessageResult;
  }

  /**
   * Add (or remove) a reaction to a message.
   *
   * POST /me/messages — sender_action=react
   * Replicates the reaction support added to the Penelope FB adapter.
   *
   * Note: Facebook only accepts a fixed reaction emoji whitelist:
   *   ❤ 😍 😮 😂 😢 👍 👎
   * Non-whitelisted emoji are silently rejected by the Graph API.
   */
  async reactToMessage(
    psid: string,
    messageId: string,
    opts: ReactToMessageOptions = {},
  ): Promise<void> {
    const reaction = opts.reaction ?? '👍';
    const action = opts.action ?? 'react';

    if (this.isMock) {
      // TODO: real Graph API call when TENANT_FB_PAGE_TOKEN is wired
      // POST https://graph.facebook.com/v19.0/me/messages?access_token=<token>
      // body: { recipient: { id: psid }, sender_action: 'react', payload: { message_id, reaction: 'love'|'haha'|'wow'|'sad'|'angry'|'like'|'dislike' } }
      return;
    }

    // Map emoji to Graph API reaction strings
    const emojiToReaction: Record<string, string> = {
      '❤': 'love',
      '😍': 'love',
      '😮': 'wow',
      '😂': 'haha',
      '😢': 'sad',
      '😡': 'angry',
      '👍': 'like',
      '👎': 'dislike',
    };

    const reactionStr = emojiToReaction[reaction] ?? 'like';

    const body: Record<string, unknown> = {
      recipient: { id: psid },
      sender_action: action,
      payload: {
        message_id: messageId,
        reaction: reactionStr,
      },
    };

    const res = await fetch(`${GRAPH_BASE}/me/messages?access_token=${this.pageToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[FacebookMessengerAdapter] reactToMessage failed (${res.status}): ${err}`);
    }
  }

  /**
   * Fetch message history for a thread.
   *
   * GET /<thread_id>/messages?fields=id,message,from,created_time
   */
  async getThreadHistory(
    threadId: string,
    limit = 20,
  ): Promise<ThreadHistoryResult> {
    if (this.isMock) {
      // TODO: real Graph API call when TENANT_FB_PAGE_TOKEN is wired
      // GET https://graph.facebook.com/v19.0/<threadId>/messages?fields=id,message,from,created_time&limit=<limit>&access_token=<token>
      return {
        data: [
          {
            id: `mock_mid_1`,
            message: '[mock] hi, how much for headlights?',
            from: { id: 'mock_psid_123', name: 'Mock Customer' },
            created_time: new Date(Date.now() - 3600_000).toISOString(),
          },
        ],
      };
    }

    const params = new URLSearchParams({
      fields: 'id,message,from,created_time',
      limit: String(limit),
      access_token: this.pageToken!,
    });

    const res = await fetch(`${GRAPH_BASE}/${threadId}/messages?${params}`);

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[FacebookMessengerAdapter] getThreadHistory failed (${res.status}): ${err}`);
    }

    return (await res.json()) as ThreadHistoryResult;
  }

  /**
   * List conversations on the Page inbox.
   *
   * GET /me/conversations?fields=id,updated_time,participants,snippet,unread_count
   */
  async getConversations(opts: GetConversationsOptions = {}): Promise<ConversationListResult> {
    const limit = opts.limit ?? 20;

    if (this.isMock) {
      // TODO: real Graph API call when TENANT_FB_PAGE_TOKEN is wired
      // GET https://graph.facebook.com/v19.0/me/conversations?fields=id,updated_time,participants,snippet,unread_count&limit=<limit>&access_token=<token>
      return {
        data: [
          {
            id: 'mock_thread_001',
            updated_time: new Date().toISOString(),
            participants: {
              data: [{ id: 'mock_psid_123', name: 'Mock Customer' }],
            },
            snippet: '[mock] interested in headlight restoration',
            unread_count: 1,
          },
        ],
      };
    }

    const params = new URLSearchParams({
      fields: 'id,updated_time,participants,snippet,unread_count',
      limit: String(limit),
      access_token: this.pageToken!,
    });

    if (opts.after) {
      params.set('after', opts.after);
    }

    if (opts.unread_only) {
      // Graph API doesn't support server-side unread filter — filter client-side
    }

    const res = await fetch(`${GRAPH_BASE}/me/conversations?${params}`);

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[FacebookMessengerAdapter] getConversations failed (${res.status}): ${err}`);
    }

    const result = (await res.json()) as ConversationListResult;

    if (opts.unread_only) {
      result.data = result.data.filter((c) => (c.unread_count ?? 0) > 0);
    }

    return result;
  }
}
