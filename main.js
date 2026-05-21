import { testConnection, getRequests } from './db.js'
import { initializeRouter } from './router.js'

// Run app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {

  // UI setup
  initializeRouter()

  // Test Supabase connection (debug only)
  await testConnection()

  // Load requests into UI
  loadRequests()
})

// Render requests to page
async function loadRequests() {
  const container = document.querySelector('#requests')

  if (!container) return

  const requests = await getRequests()

  container.innerHTML = requests.map(req => `
    <div class="card border p-3 mb-2 rounded">
      <h3>${req.title ?? "Untitled Request"}</h3>
      <p>${req.category ?? "Uncategorized"}</p>
      <span>Status: ${req.status ?? "pending"}</span>
    </div>
  `).join('')
}