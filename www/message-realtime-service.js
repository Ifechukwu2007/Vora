import { supabase } from './supabase.js';
import { NotificationService } from './notification-service.js';

export class MessageRealtimeService {
  static channels = {};

  /**
   * Send a message with notifications
   */
  static async sendMessage(chatId, senderId, message, otherUserId) {
    try {
      console.log('📤 Sending message to chat:', chatId);
      
      // Insert message (no is_read field - column doesn't exist in schema)
      const { data: newMessage, error } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          sender_id: senderId,
          message: message
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Error inserting message:', error);
        throw error;
      }

      console.log('✅ Message saved to database:', newMessage);

      // Create notification for recipient
      try {
        await NotificationService.createNotification(
          otherUserId,
          'message',
          'New Message',
          message,
          {}, // Empty metadata - column doesn't exist
          senderId
        );
        console.log('🔔 Notification created for user:', otherUserId);
      } catch (notifError) {
        console.error('⚠️ Error creating notification:', notifError);
        // Don't throw - message was sent successfully even if notification failed
      }

      return newMessage;
    } catch (error) {
      console.error('❌ Error sending message:', error);
      throw error;
    }
  }

  /**
   * Mark messages as read in a chat
   * Note: No-op since is_read column doesn't exist in database
   */
  static async markMessagesAsRead(chatId, currentUserId) {
    // Database schema doesn't have is_read column
    // Keeping method for future use if column is added
    return;
  }

  /**
   * Subscribe to messages in a chat with real-time updates
   */
  static subscribeToChat(chatId, currentUserId, callback) {
    // Remove existing channel if it exists
    if (this.channels[chatId]) {
      console.log('🔌 Removing existing subscription for:', chatId);
      supabase.removeChannel(this.channels[chatId]);
    }

    console.log('🔌 Creating new subscription for chat:', chatId);
    
    const channel = supabase
      .channel(`chat-${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`
        },
        (payload) => {
          console.log('📨 Postgres Change Event - INSERT:', payload);
          // Prevent duplicate render - sender already sees message immediately
          if (payload.new.sender_id === currentUserId) {
            console.log('⏭️ Skipping - this is sender\'s own message');
            return;
          }
          console.log('🎯 Delivering message to callback');
          callback(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`
        },
        (payload) => {
          console.log('📨 Postgres Change Event - UPDATE:', payload);
          callback(payload.new, 'update');
        }
      )
      .on('subscribe', (status) => {
        console.log('✅ Subscription status:', status);
      })
      .on('error', (error) => {
        console.error('❌ Subscription error:', error);
      })
      .subscribe((status, err) => {
        console.log('📡 Subscribe callback - Status:', status, 'Error:', err);
      });

    this.channels[chatId] = channel;
    console.log('✅ Subscription created for chat:', chatId);
    return channel;
  }

  /**
   * Subscribe to message list updates (for my-messages.html)
   */
  static subscribeToMessagesList(callback) {
    console.log('🔌 Creating subscription for messages list');
    
    const channel = supabase 
      .channel('messages-list-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          console.log('📨 Messages List - New message inserted:', payload.new);
          callback('message_inserted', payload.new.chat_id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          console.log('📨 Messages List - Message updated:', payload.new);
          callback('message_updated', payload.new.chat_id);
        }
      )
      .on('subscribe', (status) => {
        console.log('✅ Messages List subscription status:', status);
      })
      .on('error', (error) => {
        console.error('❌ Messages List subscription error:', error);
      })
      .subscribe((status, err) => {
        console.log('📡 Messages List subscribe callback - Status:', status, 'Error:', err);
      });

    console.log('✅ Messages List subscription created');
    return channel;
  }

  /**
   * Clean up channels
   */
  static unsubscribe(chatId) {
    if (this.channels[chatId]) {
      supabase.removeChannel(this.channels[chatId]);
      delete this.channels[chatId];
    }
  }

  static unsubscribeAll() {
    Object.keys(this.channels).forEach(chatId => {
      this.unsubscribe(chatId);
    });
  }
}
