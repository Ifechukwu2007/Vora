import { supabase } from "./supabase.js";

const chatBox = document.getElementById("chatBox");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

let currentUser = null;
let chatId = null;

// =========================
// INIT
// =========================
document.addEventListener("DOMContentLoaded", async () => {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "login.html";
    return;
  }

  currentUser = session.user;

  const params = new URLSearchParams(window.location.search);
  chatId = params.get("chat_id");

  if (!chatId) {
    alert("Chat ID is missing.");
    return;
  }

  await loadChatInfo();
  await loadMessages();

  subscribeToMessages();
});

// =========================
// LOAD CHAT INFO
// =========================
async function loadChatInfo() {
  const { data, error } = await supabase
    .from("chats")
    .select(`
      *,
      services(title)
    `)
    .eq("id", chatId)
    .single();

  if (error) {
    console.error(error);
    return;
  }

  document.getElementById("service-title").textContent =
    data.services?.title || "Chat";

  let otherUserId =
    data.customer_id === currentUser.id
      ? data.provider_id
      : data.customer_id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", otherUserId)
    .single();

  document.getElementById("other-user-name").textContent =
    profile?.full_name || "User";
}

// =========================
// LOAD MESSAGES
// =========================
async function loadMessages() {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  chatBox.innerHTML = "";

  data.forEach(message => {
    renderMessage(message);
  });

  scrollBottom();
}

// =========================
// RENDER MESSAGE
// =========================
function renderMessage(message) {
  const isMine = message.sender_id === currentUser.id;

  const div = document.createElement("div");

  div.className = `flex ${
    isMine ? "justify-end" : "justify-start"
  }`;

  div.innerHTML = `
    <div class="
      max-w-xs
      px-4
      py-2
      rounded-2xl
      text-sm
      ${isMine
        ? "bg-blue-600 text-white"
        : "bg-white border text-gray-800"}
    ">
      ${message.message}
    </div>
  `;

  chatBox.appendChild(div);
}

// =========================
// SEND MESSAGE
// =========================
sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keypress", e => {
  if (e.key === "Enter") {
    sendMessage();
  }
});

async function sendMessage() {
  const text = messageInput.value.trim();

  if (!text) return;

  const { error } = await supabase
    .from("messages")
    .insert({
      chat_id: chatId,
      sender_id: currentUser.id,
      message: text
    });

  if (error) {
    console.error(error);
    alert(error.message);
    return;
  }

  messageInput.value = "";
}

// =========================
// REALTIME
// =========================
function subscribeToMessages() {
  supabase
    .channel(`chat-${chatId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `chat_id=eq.${chatId}`
      },
      payload => {
        renderMessage(payload.new);
        scrollBottom();
      }
    )
    .subscribe();
}

// =========================
// SCROLL
// =========================
function scrollBottom() {
  chatBox.scrollTop = chatBox.scrollHeight;
}