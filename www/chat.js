// chat.js
import { supabase } from './supabase.js';
import { NotificationService } from './notification-service.js';

export class ChatService {
  static channels = {};

  /**
   * Get or create a chat row for two users.
   * - We store one chat row with:
   *   - chats.sender_id = current user id
   *   - chats.participants = other user id
   *
   * If you already have chats created differently, adjust this matcher.
   */
  static async getOrCreateChat({ currentUserId, otherUserId }) {
    // Try to find an existing chat
    const { data: existing, error: findError } = await supabase
      .from('chats')
      .select('*')
      .or(
        `and(sender_id.eq.${currentUserId},participants.eq.${otherUserId}),and(sender_id.eq.${otherUserId},participants.eq.${currentUserId})`
      )
      .limit(1)
      .maybeSingle();

    if (findError) throw findError;
    if (existing) return existing;

    // Create a new chat
    const { data: created, error: createError } = await supabase
      .from('chats')
      .insert({
        sender_id: currentUserId,
        participants: otherUserId,
        last_message: null,
        last_timestamp: new Date().toISOString(),
        // chat_id column exists in schema, but it’s not needed for this relationship.
        // We leave it unset.
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
      await NotificationService.createNotification(
        otherUserId,
        'message',
        'New Message',
        message,
        {}, // if your NotificationService expects metadata column, adapt there
        currentUserId
      );
    } catch (e) {
      console.warn('⚠️ Notification failed (message still sent):', e?.message || e);
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