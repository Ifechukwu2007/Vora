import { supabase } from './supabaseClient.js'

// Test connection (call manually)
export async function testConnection() {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .limit(5)

  if (error) {
    console.log("Connection failed:", error.message)
    return null
  }

  console.log("Connected to Supabase:", data)
  return data
}

// Fetch requests (Vora core feature)
export async function getRequests() {
  const { data, error } = await supabase
    .from('requests')
    .select('*')

  if (error) {
    console.log("Fetch error:", error.message)
    return []
  }

  return data
}

// Insert request
export async function createRequest(request) {
  const { data, error } = await supabase
    .from('requests')
    .insert([request])
    .select()

  if (error) {
    console.log("Insert error:", error.message)
    return null
  }

  return data
}