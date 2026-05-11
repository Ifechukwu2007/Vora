import { LoadingSpinner } from './loading-utils.js';
import { db, auth } from './firebase-config.js';
import { doc, getDoc, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat-container');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const serviceTitleEl = document.getElementById('service-title');
    const otherUserNameEl = document.getElementById('other-user-name');

    // Retrieve 'id' parameter from the URL
    const urlParams = new URLSearchParams(window.location.search);
    const chatId = urlParams.get('id');

    onAuthStateChanged(auth, async (currentUser) => {
        // Handle logic only when auth state is resolved and id is present
        if (!currentUser) {
            chatContainer.innerHTML = '<p class="text-red-500 text-center">User not logged in. Redirecting to login...</p>';
            setTimeout(() => {
                LoadingSpinner.navigateTo('login.html');
            }, 2000);
            return;
        }

        if (!chatId) {
            chatContainer.innerHTML = '<p class="text-red-500 text-center">Chat ID is missing. Please return to your messages.</p>';
            return;
        }

        const chatDocRef = doc(db, 'chats', chatId);
        const messagesRef = collection(chatDocRef, 'messages');

        try {
            const chatSnap = await getDoc(chatDocRef);
            if (chatSnap.exists()) {
                const chat = chatSnap.data();
                
                // Ensure the current user is a participant in this chat
                if (!chat.participants || !chat.participants.includes(currentUser.uid)) {
                    chatContainer.innerHTML = '<p class="text-red-500 text-center">You do not have permission to view this chat.</p>';
                    return;
                }

                const otherUserId = chat.participants.find(uid => uid !== currentUser.uid);

                if (!otherUserId) {
                    chatContainer.innerHTML = '<p class="text-red-500 text-center">Error: Chat is not configured correctly.</p>';
                    return;
                }

                // Fetch service and other user's details
                if (chat.serviceId) {
                    const serviceDocRef = doc(db, 'services', chat.serviceId);
                    const serviceSnap = await getDoc(serviceDocRef);
                    if (serviceSnap.exists()) {
                        serviceTitleEl.textContent = serviceSnap.data().title;
                    } else {
                        serviceTitleEl.textContent = 'General Inquiry';
                    }
                } else {
                    serviceTitleEl.textContent = 'General Inquiry';
                }

                const userDocRef = doc(db, 'users', otherUserId);
                const userSnap = await getDoc(userDocRef);
                if (userSnap.exists()) {
                    otherUserNameEl.textContent = `with ${userSnap.data().name}`;
                }

                // Listen for new messages in real-time
                const q = query(messagesRef, orderBy('timestamp'));
                onSnapshot(q, (snapshot) => {
                    chatContainer.innerHTML = '';
                    snapshot.forEach(doc => {
                        const message = doc.data();
                        const messageClass = message.senderId === currentUser.uid ? 'text-right' : 'text-left';
                        const messageBg = message.senderId === currentUser.uid ? 'bg-blue-500 text-white' : 'bg-gray-300';
                        
                        const messageEl = document.createElement('div');
                        messageEl.className = `mb-4 ${messageClass}`;
                        messageEl.innerHTML = `
                            <div class="inline-block p-2 rounded-lg ${messageBg}">
                                <p>${message.text}</p>
                            </div>
                        `;
                        chatContainer.appendChild(messageEl);
                    });
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                });

                // Send message logic using currentUser object
                const sendMessage = async () => {
                    const messageText = messageInput.value.trim();
                    if (messageText) {
                        try {
                            await addDoc(messagesRef, {
                                text: messageText,
                                senderId: currentUser.uid,
                                timestamp: serverTimestamp()
                            });

                            await updateDoc(chatDocRef, {
                                lastMessage: messageText,
                                lastTimestamp: serverTimestamp()
                            });

                            messageInput.value = '';
                        } catch (err) {
                            console.error("Error sending message:", err);
                        }
                    }
                };

                sendButton.addEventListener('click', sendMessage);

                messageInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        sendMessage();
                    }
                });

            } else {
                chatContainer.innerHTML = '<p class="text-red-500 text-center">Chat not found.</p>';
            }
        } catch (error) {
            console.error('Error loading chat:', error);
            chatContainer.innerHTML = '<p class="text-red-500 text-center">Error loading chat. Please try again later.</p>';
        }
    });
});