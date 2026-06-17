import { supabase } from './supabase.js';
import { ChatService } from './chat.js';

const chatBox = document.getElementById('chatBox');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const typingIndicator = document.getElementById('typingIndicator');
const typingUser = document.getElementById('typingUser');
const otherUserNameEl = document.getElementById('other-user-name');
const serviceTitleEl = document.getElementById('service-title');
const backBtn = document.getElementById('backBtn');
const logoutBtn = document.getElementById('logoutBtn');
 
let currentUser = null;
let chatId = null;
let otherUserId = null;
let otherUserName = 'User';
let typingTimeout = null;
let typingChannel = null;

// =========================
// INITIALIZATION
// =========================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      window.location.href = 'login.html';
      return;
    }

    currentUser = session.user;
    const params = new URLSearchParams(window.location.search);
    chatId = params.get('chat_id');

    if (!chatId) {
      alert('Chat ID is missing.');
      window.location.href = 'my-messages.html';
      return;
    }

    await loadChatInfo();
    await loadMessages();
    subscribeToMessages();
    subscribeToTyping();
    setupEventListeners();
    setupLogout();
  } catch (error) {
    console.error('Init error:', error);
  }
});

// =========================
// LOAD CHAT INFO
// =========================
async function loadChatInfo() {
  try {
    const { data: chat } = await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .single();

    if (!chat) {
      otherUserNameEl.textContent = 'User';
      serviceTitleEl.textContent = 'Direct Message';
      return;
    }

    // Determine the other user
    otherUserId = chat.sender_id === currentUser.id ? chat.participants : chat.sender_id;

    // Fetch other user's profile
    const { data: profile } = await supabase
      .from('users')
      .select('full_name, profile_picture')
      .eq('id', otherUserId)
      .single();

    otherUserName = profile?.full_name || 'User';
    otherUserNameEl.textContent = otherUserName;
    serviceTitleEl.textContent = 'Direct Message';
  } catch (error) {
    console.error('Error loading chat info:', error);
  }
}

// =========================
// LOAD MESSAGES
// =========================
async function loadMessages() {
  try {
    const messages = await ChatService.fetchMessages({ chatId, limit: 50 });
    chatBox.innerHTML = '';

    if (!messages || messages.length === 0) {
      chatBox.innerHTML = '<div class="text-center text-gray-400 py-8"><p>No messages yet. Start the conversation!</p></div>';
      return;
    }

    messages.forEach(msg => renderMessage(msg));
    scrollToBottom();
  } catch (error) {
    console.error('Error loading messages:', error);
  }
}

// =========================
// RENDER MESSAGE (EBAY-LIKE)
// =========================
function renderMessage(message, animate = false) {
  const isMine = message.sender_id === currentUser.id;
  
  const div = document.createElement('div');
  div.className = `flex ${isMine ? 'justify-end' : 'justify-start'} ${animate ? 'message-bubble' : ''}`;

  const timeStr = formatTime(new Date(message.created_at));
  const displayName = isMine ? 'You' : otherUserName;

  div.innerHTML = `
    <div class="max-w-sm">
      <div class="flex ${isMine ? 'flex-row-reverse' : 'flex-row'} gap-2">
        <!-- Avatar -->
        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          ${displayName.charAt(0).toUpperCase()}
        </div>

        <!-- Message Bubble -->
        <div class="${isMine ? 'text-right' : 'text-left'}">
          <p class="text-xs text-gray-500 mb-1 px-3">${displayName}</p>
          <div class="px-4 py-2 rounded-2xl ${
            isMine
              ? 'bg-blue-600 text-white rounded-br-none'
              : 'bg-gray-200 text-gray-900 rounded-bl-none'
          } break-words">
            <p class="text-sm">${escapeHTML(message.message)}</p>
          </div>
          <p class="text-xs text-gray-500 mt-1 px-3">${timeStr}</p>
        </div>
      </div>
    </div>
  `;

  chatBox.appendChild(div);
}

// =========================
// SEND MESSAGE
// =========================
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  messageInput.value = '';
  sendBtn.disabled = true;

  // Optimistic UI
  renderMessage({
    sender_id: currentUser.id,
    message: text,
    created_at: new Date().toISOString()
  }, true);

  scrollToBottom();

  try {
    await ChatService.sendMessage({
      chatId,
      currentUserId: currentUser.id,
      otherUserId,
      message: text
    });
    
    // Stop typing indicator
    broadcastTyping(false);
  } catch (error) {
    console.error('Error sending message:', error);
    alert('Failed to send message');
  } finally {
    sendBtn.disabled = false;
    messageInput.focus();
  }
}

// =========================
// TYPING INDICATOR
// =========================
function subscribeToTyping() {
  typingChannel = supabase
    .channel(`typing-${chatId}`)
    .on('broadcast', { event: 'user_typing' }, (payload) => {
      if (payload.payload.userId !== currentUser.id) {
        showTypingIndicator(payload.payload.isTyping);
      }
    })
    .subscribe();
}

function showTypingIndicator(isTyping) {
  if (isTyping) {
    typingUser.textContent = otherUserName;
    typingIndicator.classList.remove('hidden');
  } else {
    typingIndicator.classList.add('hidden');
  }
}

function broadcastTyping(isTyping) {
  if (typingChannel) {
    typingChannel.send({
      type: 'broadcast',
      event: 'user_typing',
      payload: {
        userId: currentUser.id,
        isTyping
      }
    });
  }
}

// =========================
// REAL-TIME SUBSCRIPTION
// =========================
function subscribeToMessages() {
  ChatService.subscribeToChat({
    chatId,
    currentUserId: currentUser.id,
    callback: (message) => {
      renderMessage(message, true);
      scrollToBottom();
      showTypingIndicator(false);
    }
  });
}

// =========================
// EVENT LISTENERS
// =========================
function setupEventListeners() {
  sendBtn.addEventListener('click', sendMessage);

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  messageInput.addEventListener('input', () => {
    broadcastTyping(messageInput.value.trim().length > 0);
  });

  messageInput.addEventListener('blur', () => {
    broadcastTyping(false);
  });
}

function setupLogout() {
  logoutBtn?.addEventListener('click', async () => {
    ChatService.unsubscribe(chatId);
    if (typingChannel) supabase.removeChannel(typingChannel);
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });
}

// =========================
// HELPERS
// =========================
function escapeHTML(str = '') {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatTime(date) {
  const now = new Date();
  const diff = now - date;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (hours < 1) {
    const mins = Math.floor(diff / (1000 * 60));
    return `${mins}m ago`;
  }

  if (hours < 24) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (days < 7) {
    return `${days}d ago`;
  }

  return date.toLocaleDateString();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatBox.scrollTop = chatBox.scrollHeight;
  });
}

// Cleanup
window.addEventListener('beforeunload', () => {
  ChatService.unsubscribe(chatId);
  if (typingChannel) supabase.removeChannel(typingChannel);
});
