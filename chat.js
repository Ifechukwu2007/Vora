// chat.js
import { supabase } from './supabase.js';
import { NotificationService } from './notification-service.js';
import { sendEmailToUserId } from './email-service.js';

const PERSONAL_INFORMATION_MESSAGE = 'For your safety, do not share phone numbers, email addresses, social handles, links, bank details, or other personal information in Vorabukeen chat.';

function findRestrictedChatContent(value) {
  const text = String(value || '').trim();
  const patterns = [
    /\b[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\s*\.\s*[A-Z]{2,}\b/i,
    /(?:https?:\/\/|www\.)\S+/i,
    /(?:^|[^\d])(?:\+?234|0)\s*\d(?:[\s().-]*\d){9,10}(?:$|[^\d])/i,
    /\b(?:whatsapp|telegram|signal|instagram|facebook|snapchat|tiktok)\s*[:@]?\s*[a-z0-9._-]+/i,
    /\b(?:account|acct|sort\s*code|routing|iban|swift)\s*(?:number|no\.?|details?)?\s*[:#-]?\s*\d[\d\s-]{5,}/i,
  ];

  return patterns.find((pattern) => pattern.test(text)) || null;
}

export class ChatService {
  static channels = {};

  static normalizeUserId(value) {
    return value == null ? null : String(value).trim();
  }

  static async getUserRecord(userId) {
    const normalizedId = this.normalizeUserId(userId);
    if (!normalizedId) return null;

    const { data, error } = await supabase
      .from('users')
      .select('id, uid, full_name, profile_picture')
      .or(`id.eq.${normalizedId},uid.eq.${normalizedId}`)
      .maybeSingle();

    if (error) {
      console.warn('Could not resolve user record:', error.message || error);
      return null;
    }

    return data;
  }

  /**
   * Get or create a chat row for two users.
   * - We store one chat row with:
   *   - chats.sender_id = current user id
   *   - chats.participants = other user id
   *
   * If you already have chats created differently, adjust this matcher.
   */
  static async getOrCreateChat({ currentUserId, otherUserId }) {
    const current = this.normalizeUserId(currentUserId);
    const other = this.normalizeUserId(otherUserId);

    if (!current || !other) {
      throw new Error('Both users are required to create a chat.');
    }

    const { data: existing, error: findError } = await supabase
      .from('chats')
      .select('*')
      .or(
        `and(sender_id.eq.${current},participants.eq.${other}),and(sender_id.eq.${other},participants.eq.${current})`
      )
      .limit(1)
      .maybeSingle();

    if (findError) throw findError;
    if (existing) return existing;

    const { data: created, error: createError } = await supabase
      .from('chats')
      .insert({
        sender_id: current,
        participants: other,
        last_message: null,
        last_timestamp: new Date().toISOString(),
      })
      .select()
      .single();

    if (createError) throw createError;
    return created;
  }

  /**
   * Send a message inside a chat.
   * - Inserts into public.messages
   * - Updates last_message/last_timestamp in public.chats
   * - Creates notification (non-blocking)
   */
  static async sendMessage({ chatId, currentUserId, otherUserId, message }) {
    if (findRestrictedChatContent(message)) {
      const error = new Error(PERSONAL_INFORMATION_MESSAGE);
      error.code = 'CHAT_PERSONAL_INFORMATION_BLOCKED';
      throw error;
    }

    // 1) Insert message
    const { data: newMessage, error: insertError } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        sender_id: currentUserId,
        message,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 2) Update chat preview fields
    const { error: chatUpdateError } = await supabase
      .from('chats')
      .update({
        last_message: message,
        last_timestamp: new Date().toISOString(),
      })
      .eq('id', chatId);

    // Don’t fail the message if chat preview update fails
    if (chatUpdateError) {
      console.warn('⚠️ Failed to update chat preview:', chatUpdateError.message || chatUpdateError);
    }

    // 3) Create notification (non-blocking)
    try {
      if (otherUserId) {
        await NotificationService.createNotification(
          otherUserId,
          'message',
          'New Message',
          message,
          {},
          currentUserId
        );
      }
    } catch (e) {
      console.warn('⚠️ Notification failed (message still sent):', e?.message || e);
    }

    // 4) Send email notification without blocking the chat send flow
    try {
      if (otherUserId) {
        await sendEmailToUserId(
          otherUserId,
          'New Vorabukeen message received',
          `<p>You have a new message on Vorabukeen:</p><p>${message}</p><p><small>Open the chat to reply.</small></p>`,
          `You have a new message: ${message}`
        );
      }
    } catch (emailErr) {
      console.warn('⚠️ Email notification failed (message still sent):', emailErr?.message || emailErr);
    }

    return newMessage;
  }

  /**
   * Convenience: send message by user ids (it will get/create the chat first).
   */
  static async sendMessageToUser({ currentUserId, otherUserId, message }) {
    const chat = await this.getOrCreateChat({ currentUserId, otherUserId });
    const newMessage = await this.sendMessage({
      chatId: chat.id,
      currentUserId,
      otherUserId,
      message,
    });
    return { chat, newMessage };
  }

  /**
   * Subscribe to realtime messages for a given chatId.
   * callback(newMessage) will be called on INSERT.
   */
  static subscribeToChat({ chatId, currentUserId, callback }) {
    // Remove existing subscription for this chat
    if (this.channels[chatId]) {
      supabase.removeChannel(this.channels[chatId]);
      delete this.channels[chatId];
    }

    const channel = supabase
      .channel(`chat-${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          // Skip messages sent by yourself (so UI doesn't double-render)
          if (payload?.new?.sender_id === currentUserId) return;
          callback(payload.new);
        }
      )
      .subscribe();

    this.channels[chatId] = channel;
    return channel;
  }

  /**
   * Fetch messages for a chat (use on page load).
   */
  static async fetchMessages({ chatId, limit = 50, offset = 0 }) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data;
  }

  static unsubscribe(chatId) {
    if (this.channels[chatId]) {
      supabase.removeChannel(this.channels[chatId]);
      delete this.channels[chatId];
    }
  }
 
  static unsubscribeAll() {
    Object.keys(this.channels).forEach((chatId) => this.unsubscribe(chatId));
  }
}