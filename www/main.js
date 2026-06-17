import { testConnection, getRequests } from './db.js'
import { initializeRouter } from './router.js'
import { updateProfilePictureInHeader } from './auth.js'

// Run app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // UI setup
    initializeRouter()

    // Test Supabase connection (debug only)
    await testConnection()

    // Load requests into UI
    await loadRequests()

    // Update profile picture in header
    await updateProfilePictureInHeader()

  } catch (error) {
    console.error('App initialization error:', error)
  }
})

// Render requests to page 
async function loadRequests() {
  const container = document.querySelector('#requests')

  if (!container) {
    console.warn('No #requests container found in DOM')
    return
  }

  try {
    const requests = await getRequests()

    if (!Array.isArray(requests)) {
      console.warn('Invalid requests data:', requests)
      return
    }

    container.innerHTML = requests.length
      ? requests.map(req => `
        <div class="card border p-3 mb-2 rounded"> 
          <h3>${req?.title ?? "Untitled Request"}</h3>
          <p>${req?.category ?? "Uncategorized"}</p>
          <span>Status: ${req?.status ?? "pending"}</span>
        </div>
      `).join('')
      : `<p class="text-gray-500">No requests found</p>`

  } catch (error) {
    console.error('Failed to load requests:', error)
    container.innerHTML = `<p class="text-red-500">Failed to load requests</p>`
  }
}