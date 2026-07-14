import { supabase } from './supabase.js';

async function sendEmail({ to, subject, html, text }) {
  if (!to || !subject || (!html && !text)) {
    throw new Error('Missing email recipient, subject, or content');
  }

  const { data, error } = await supabase.functions.invoke('send-email', {
    body: {
      to,
      subject,
      html,
      text,
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function getUserContactInfo(userId) {
  if (!userId) return null;

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('email, full_name')
    .eq('id', userId)
    .maybeSingle();

  if (userError) {
    console.warn('Could not load user contact info:', userError.message || userError);
  }

  if (user?.email) {
    return user;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.warn('Could not load profile contact info:', profileError.message || profileError);
  }

  return profile || null;
}

export async function sendEmailToAddress({ to, subject, html, text }) {
  return sendEmail({ to, subject, html, text });
}

export async function sendEmailToUserId(userId, subject, html, text) {
  const contact = await getUserContactInfo(userId);
  if (!contact?.email) {
    throw new Error('User email not found for userId=' + userId);
  }
  return sendEmail({ to: contact.email, subject, html, text });
}
