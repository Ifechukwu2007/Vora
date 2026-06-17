import { supabase } from "./supabase.js";
import { MessageRealtimeService } from "./message-realtime-service.js";

const messagesContainer = document.getElementById("messagesContainer");
const emptyState = document.getElementById("emptyState");

let currentUser = null;
let realtimeChannel = null;
let loadConversationsTimeout = null;

document.addEventListener("DOMContentLoaded", async () => {
  await initialize();
});

async function initialize() {
  try {
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session) {
      window.location.href = "login.html";
      return;
    }

    currentUser = session.user;

    setupLogout();
    await loadConversations();
    setupRealtime();

  } catch (error) {
    console.error(error);
  }
}

function setupLogout() {
  const logoutBtn = document.getElementById("logoutBtn");
  const logoutBtnSideMenu = document.getElementById("logoutBtnSideMenu");
  
  const handleLogout = async () => {
    clearTimeout(loadConversationsTimeout);
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
    }
    await supabase.auth.signOut();
    window.location.href = "login.html";
  };
  
  logoutBtn?.addEventListener("click", handleLogout);
  logoutBtnSideMenu?.addEventListener("click", handleLogout);
}

async function loadConversations() {
  messagesContainer.innerHTML = `
    <div class="bg-white rounded-xl p-6 text-center shadow">
      <div class="text-5xl mb-4 animate-pulse">⏳</div>
      <p class="text-gray-600 text-lg">Loading conversations...</p>
    </div>
  `;

  try {
    const { data: chats, error } = await supabase
      .from("chats")
      .select("*")
      .or(
        `participants.eq.${currentUser.id},sender_id.eq.${currentUser.id}`
      )
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    if (!chats || chats.length === 0) {
      messagesContainer.innerHTML = "";
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");
    messagesContainer.innerHTML = "";

    for (const chat of chats) {
      await renderConversation(chat);
    }
  } catch (error) {
    console.error("Error loading conversations:", error);
    messagesContainer.innerHTML = `
      <div class="bg-white rounded-xl p-6 text-center shadow">
        <div class="text-6xl mb-4">❌</div>
        <p class="text-gray-600 text-lg">Failed to load conversations</p>
        <p class="text-gray-500 text-sm mt-2">${error.message || "Unknown error"}</p>
        <button onclick="location.reload()" class="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          Retry
        </button>
      </div>
    `;
  }
}

async function renderConversation(chat) {
  try {
    const otherUserId =
      chat.participants === currentUser.id
        ? chat.sender_id
        : chat.participants;

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("full_name, profile_picture")
      .eq("id", otherUserId)
      .maybeSingle();

    if (profileError) {
      console.error("Profile fetch error:", profileError);
    }

    const { data: lastMessage, error: messageError } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chat.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (messageError) {
      console.error("Last message fetch error:", messageError);
    }

    let unreadCount = 0;
    try {
      const unreadCountResult = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("chat_id", chat.id)
        .neq("sender_id", currentUser.id)
        .eq("is_read", false);

      unreadCount = unreadCountResult.count || 0;
    } catch (err) {
      console.error("Unread count error:", err);
    }

    const card = document.createElement("div");

    card.className =
      "bg-white rounded-xl shadow hover:shadow-lg transition cursor-pointer";
    
    card.id = `chat-card-${chat.id}`;

    const profilePicture = profile?.profile_picture && profile.profile_picture.trim() !== ""
      ? profile.profile_picture
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.full_name || "User")}&background=random`;

    card.innerHTML = `
      <div class="p-4 flex items-center gap-4">

        <div class="w-14 h-14 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center flex-shrink-0">

          <img src="${profilePicture}" alt="${profile?.full_name || "User"}" class="w-full h-full object-cover" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.full_name || "User")}'" />

        </div>

        <div class="flex-1 min-w-0">

          <div class="flex justify-between items-start gap-2">

            <h3 class="font-bold truncate">
              ${profile?.full_name || "User"}
            </h3>

            <span class="text-xs text-gray-500 flex-shrink-0">
              ${formatTime(lastMessage?.created_at)}
            </span>

          </div>

          <p class="text-gray-600 text-sm truncate mt-1">
            ${lastMessage?.message || "No messages yet"}
          </p>

        </div>

        ${
          unreadCount > 0
            ? `
            <div class="bg-blue-600 text-white text-xs min-w-[24px] h-6 rounded-full flex items-center justify-center px-2 flex-shrink-0">
              ${unreadCount}
            </div>
          `
            : "" 
        }

      </div>
    `;

    card.addEventListener("click", () => {
      window.location.href =
        `chat.html?chat_id=${chat.id}`;
    });

    messagesContainer.appendChild(card);
  } catch (error) {
    console.error("Error rendering conversation:", error);
  }
}

async function upsertConversationCard(chatId) {
  console.log('📝 Upserting conversation card for:', chatId);
  
  try {
    const { data: chat, error } = await supabase
      .from("chats")
      .select("*")
      .or(`participants.eq.${currentUser.id},sender_id.eq.${currentUser.id}`)
      .eq("id", chatId)
      .maybeSingle();
    
    if (error || !chat) {
      console.error('❌ Error fetching chat:', error);
      return;
    }
    
    // Remove the old card
    const oldCard = document.getElementById(`chat-card-${chatId}`);
    if (oldCard) {
      oldCard.remove();
      console.log('🗑️ Removed old card for:', chatId);
    }
    
    // Re-render the card with updated data
    await renderConversation(chat);
    console.log('✅ Card updated for:', chatId);
  } catch (error) {
    console.error('❌ Error upserting conversation card:', error);
  }
}

function setupRealtime() {
  realtimeChannel = MessageRealtimeService.subscribeToMessagesList(
    async (event, chatId) => {
      // Optional batching to avoid thrashing
      clearTimeout(loadConversationsTimeout);
      loadConversationsTimeout = setTimeout(async () => {
        if (chatId) {
          console.log('🔄 Updating card for chat:', chatId);
          await upsertConversationCard(chatId);
        } else {
          // Fallback (shouldn't happen)
          console.log('🔄 Fallback: reloading all conversations');
          await loadConversations();
        }
      }, 150);
    }
  );
}

function formatTime(dateString) {

  if (!dateString) return "";

  const date = new Date(dateString);
  const now = new Date();

  const diff =
    now.getTime() - date.getTime();

  const hours =
    Math.floor(diff / (1000 * 60 * 60));

  const days =
    Math.floor(diff / (1000 * 60 * 60 * 24));

  if (hours < 24) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  if (days < 7) {
    return `${days}d`;
  }

  return date.toLocaleDateString();
}

// =========================
// CLEANUP ON PAGE UNLOAD
// =========================
window.addEventListener("beforeunload", () => {
  clearTimeout(loadConversationsTimeout);
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }
});