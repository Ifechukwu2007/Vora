/**
 * User Country Loader
 * Loads user's country from database and applies all country-specific settings
 */

import { supabase } from "./supabase.js";
import { setUserCountry } from "./country-config.js";

/**
 * Load user's country from database and apply settings
 * @param {string} userId - User ID from auth
 * @returns {Promise<string>} User's country
 */
export async function loadAndApplyUserCountry(userId) {
  try {
    if (!userId) return null;

    // Try to load from profiles table first, then users table
    let userCountry = null;

    // Load from profiles table
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('country')
      .eq('id', userId)
      .single();

    if (!profileError && profileData?.country) {
      userCountry = profileData.country;
    } else {
      // Fallback to users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('country')
        .eq('uid', userId)
        .single();

      if (!userError && userData?.country) {
        userCountry = userData.country;
      }
    }

    // Apply country settings if found
    if (userCountry) {
      setUserCountry(userCountry);
      return userCountry;
    }

    return null;
  } catch (error) {
    console.error('Error loading user country:', error);
    return null;
  }
}

/**
 * Initialize country on page load
 * Call this early in your page's initialization
 * @returns {Promise<string>} User's country if logged in, null otherwise
 */
export async function initializeUserCountry() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user?.id) {
      return await loadAndApplyUserCountry(session.user.id);
    }

    return null;
  } catch (error) {
    console.error('Error initializing user country:', error);
    return null;
  }
}

/**
 * Get user's full profile with country
 * @param {string} userId - User ID from auth
 * @returns {Promise<Object>} User profile data
 */
export async function getUserProfile(userId) {
  try {
    if (!userId) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error loading user profile:', error);
    return null;
  }
}

/**
 * Update user's country in database
 * @param {string} userId - User ID from auth
 * @param {string} country - New country name
 * @returns {Promise<boolean>} Success status
 */
export async function updateUserCountry(userId, country) {
  try {
    // Update in profiles table
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ country })
      .eq('id', userId);

    // Also update in users table
    const { error: userError } = await supabase
      .from('users')
      .update({ country })
      .eq('uid', userId);

    if (profileError || userError) {
      throw new Error(profileError?.message || userError?.message);
    }

    // Apply the country settings
    setUserCountry(country);
    return true;
  } catch (error) {
    console.error('Error updating user country:', error);
    return false;
  }
}
