import { supabase } from './supabase.js';

class NotificationService {
  static async createNotification(recipientId, type, title, message, metadata = {}, senderId = null) {
    return NotificationService.insertNotification({
      user_id: recipientId,
      type,
      title,
      message,
      sender_id: senderId,
      read: false,
      created_at: new Date().toISOString()
      // Note: 'metadata' column doesn't exist in the notifications table
    });
  }

  static async insertNotification(notificationObj) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert([notificationObj])
        .select()
        .single();

      if (error) {
        console.error('Error inserting notification:', error);
        return null;
      }

      return data;
    } catch (err) {
      console.error('Error in insertNotification:', err);
      return null;
    }
  }

  static async markAsRead(notificationId) {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) {
        console.error('Error marking notification as read:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error in markAsRead:', err);
      return false;
    }
  }

  static async markAllAsRead(userId) {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId);

      if (error) {
        console.error('Error marking all as read:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error in markAllAsRead:', err);
      return false;
    }
  }

  static async getNotifications(userId, limit = 50) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching notifications:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('Error in getNotifications:', err);
      return [];
    }
  }

  static async deleteNotification(notificationId) {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) {
        console.error('Error deleting notification:', error);
        return false;
      }
 
      return true;
    } catch (err) {
      console.error('Error in deleteNotification:', err);
      return false;
    }
  }
}

export { NotificationService }; 