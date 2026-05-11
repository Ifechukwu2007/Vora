import { LoadingSpinner } from './loading-utils.js';
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, query, where, onSnapshot, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Logout functionality
const initLogout = () => {
  const logoutBtns = document.querySelectorAll('#logoutBtn');
  const logout = () => {
    signOut(auth).then(() => {
      LoadingSpinner.navigateTo('index.html');
    }).catch((error) => {
      console.error('Logout Error:', error);
    });
  };
  logoutBtns.forEach(btn => {
    if (btn) btn.addEventListener('click', logout);
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLogout);
} else {
  initLogout();
}

document.addEventListener('DOMContentLoaded', () => {
    const conversationsContainer = document.getElementById('conversations-container');

    onAuthStateChanged(auth, (user) => {
        if (!user) {
            LoadingSpinner.navigateTo('login.html');
            return;
        }

        const userId = user.uid;
        
        // Listeners for both collections
        const collectionsToQuery = ['chats', 'conversations'];
        let activeSnapshots = { chats: [], conversations: [] };

        collectionsToQuery.forEach(colName => {
            const q = query(
                collection(db, colName), 
                where('participants', 'array-contains', userId)
            );

            onSnapshot(q, async (snapshot) => {
                activeSnapshots[colName] = snapshot.docs;
                renderInbox(activeSnapshots, userId);
            }, (error) => {
                console.error(`Error listening to ${colName}:`, error);
            });
        });

        async function renderInbox(snapshots, currentUserId) {
            const allDocs = [...snapshots.chats, ...snapshots.conversations];

            if (allDocs.length === 0) {
                conversationsContainer.innerHTML = `
                    <div class="text-center p-8 bg-white rounded-lg shadow mt-4">
                        <p class="text-gray-500 italic">You have no messages yet.</p>
                    </div>`;
                return;
            }

            // Sort manually in JavaScript by timestamp descending
            const sortedDocs = allDocs.sort((a, b) => {
                const dataA = a.data();
                const dataB = b.data();
                const timeA = (dataA.lastTimestamp || dataA.timestamp)?.toMillis() || 0;
                const timeB = (dataB.lastTimestamp || dataB.timestamp)?.toMillis() || 0;
                return timeB - timeA;
            });

            // Fetch details for each
            const chatItems = await Promise.all(sortedDocs.map(async (chatDoc) => {
                const chat = chatDoc.data();
                const chatId = chatDoc.id;
                const otherUserId = chat.participants.find(id => id !== currentUserId);

                // Fetch other user profile and service title
                const [userSnap, serviceSnap] = await Promise.all([
                    otherUserId ? getDoc(doc(db, 'users', otherUserId)) : Promise.resolve({ exists: () => false }),
                    chat.serviceId ? getDoc(doc(db, 'services', chat.serviceId)) : Promise.resolve({ exists: () => false })
                ]);

                return {
                    id: chatId,
                    otherUserName: userSnap.exists() ? userSnap.data().name : 'Unknown User',
                    serviceTitle: serviceSnap.exists() ? serviceSnap.data().title : 'General Inquiry',
                    lastMessage: chat.lastMessage || 'Chat initiated.',
                    timestamp: (chat.lastTimestamp || chat.timestamp) ? 
                        new Date((chat.lastTimestamp || chat.timestamp).toDate()).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : ''
                };
            }));

            // Render
            conversationsContainer.innerHTML = '';
            chatItems.forEach(item => {
                const conversationElement = document.createElement('div');
                conversationElement.className = 'bg-white p-4 mb-3 rounded-lg shadow hover:shadow-md border-l-4 border-blue-600 cursor-pointer transition-all';
                
                conversationElement.innerHTML = `
                    <div class="flex justify-between items-start">
                        <div>
                            <h3 class="font-bold text-gray-900">${item.otherUserName}</h3>
                            <p class="text-xs text-blue-500 font-semibold mb-1 uppercase tracking-wide">${item.serviceTitle}</p>
                        </div>
                        <span class="text-xs text-gray-400 whitespace-nowrap">${item.timestamp}</span>
                    </div>
                    <p class="text-sm text-gray-600 truncate mt-1">${item.lastMessage}</p>
                `;

                conversationElement.onclick = () => {
                    LoadingSpinner.navigateTo(`chat.html?id=${item.id}`);
                };
                
                conversationsContainer.appendChild(conversationElement);
            });
        }
    });
});