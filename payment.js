import { LoadingSpinner } from './loading-utils.js';
import { auth, db } from './firebase-config.js';
import {
    doc,
    getDoc,
    setDoc,
    collection,
    query,
    where,
    getDocs,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Helper function to create notifications
async function createNotification(recipientId, type, title, message, metadata = {}) {
  try {
    const notifRef = doc(collection(db, 'notifications'));
    await setDoc(notifRef, {
      recipientId,
      type,
      title,
      message,
      metadata,
      isRead: false,
      isDeleted: false,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

// Get platform settings
async function getPlatformSettings() {
  try {
    const settingsDoc = await getDoc(doc(db, 'settings', 'platform'));
    return settingsDoc.exists() ? settingsDoc.data() : { builtInMargin: 0 };
  } catch (error) {
    console.error('Error fetching platform settings:', error);
    return { builtInMargin: 0 };
  }
}

// UI
const serviceTitleEl = document.getElementById('service-title');
const providerNameEl = document.getElementById('provider-name');
const servicePriceEl = document.getElementById('service-price');
const confirmBookingBtn = document.getElementById('confirm-booking-btn');
const messageProviderBtn = document.getElementById('messageProviderBtn');
const userInfoEl = document.getElementById('user-info');

let serviceData = null;
let offerData = null;
let requestData = null;
let serviceId = null;
let offerId = null;
let requestId = null;
let currentUser = null;
let platformSettings = null;
let isOfferPayment = false;
let providerId = null;

// ================= INIT =================
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    serviceId = urlParams.get('serviceId');
    offerId = urlParams.get('offerId');
    requestId = urlParams.get('requestId');
    
    isOfferPayment = !!offerId;
    
    const backBtn = document.getElementById('backBtn');

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (isOfferPayment) {
                LoadingSpinner.navigateTo('my-requests.html');
            } else if (serviceId) {
                LoadingSpinner.navigateTo(`service.html?id=${encodeURIComponent(serviceId)}`);
            } else {
                LoadingSpinner.navigateTo('dashboard.html');
            }
        });
    }

    if (!serviceId && !offerId) {
        alert("No service or offer selected.");
        LoadingSpinner.navigateTo('dashboard.html');
        return;
    }

    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            const redirect = isOfferPayment 
                ? `payment.html?offerId=${offerId}&requestId=${requestId}`
                : `payment.html?serviceId=${serviceId}`;
            LoadingSpinner.navigateTo(`login.html?redirect=${redirect}`);
            return;
        }

        currentUser = user;
        userInfoEl.textContent = `Logged in as ${user.email}`;

        if (isOfferPayment) {
            await loadOfferDetails(offerId, requestId);
        } else {
            await loadServiceDetails(serviceId);
        }
    });

    confirmBookingBtn.addEventListener('click', handleBookingFlow);
    messageProviderBtn.addEventListener('click', () => messageProvider());
});

// ================= LOAD =================
async function loadServiceDetails(id) {
    try {
        const snap = await getDoc(doc(db, "services", id));

        if (!snap.exists()) throw new Error("Service not found");

        serviceData = snap.data();
        providerId = serviceData.providerId || serviceData.userId;

        // Get platform settings
        platformSettings = await getPlatformSettings();
        const builtInMargin = platformSettings.builtInMargin || 0;
        const servicePrice = Number(serviceData.price);
        const marginAmount = servicePrice * (builtInMargin / 100);
        const customerPrice = servicePrice + marginAmount;

        if (isNaN(servicePrice)) throw new Error("Invalid price");

        serviceTitleEl.textContent = serviceData.title || "Untitled Service";
        
        // Fetch provider name from users collection
        let providerName = serviceData.providerName;
        if (!providerName && providerId) {
            const userSnap = await getDoc(doc(db, "users", providerId));
            if (userSnap.exists()) {
                providerName = userSnap.data().name || userSnap.data().displayName || "Provider";
            }
        }
        providerNameEl.textContent = providerName || "Provider";
        servicePriceEl.textContent = `NGN ${customerPrice.toLocaleString()}`;

    } catch (err) {
        console.error(err);
        alert(err.message);
    }
}

// ================= LOAD OFFER ================
async function loadOfferDetails(offId, reqId) {
    try {
        const offerSnap = await getDoc(doc(db, "offers", offId));
        const requestSnap = await getDoc(doc(db, "requests", reqId));

        if (!offerSnap.exists()) throw new Error("Offer not found");
        if (!requestSnap.exists()) throw new Error("Request not found");

        offerData = offerSnap.data();
        requestData = requestSnap.data();
        providerId = offerData.providerId || offerData.userId;

        // Get platform settings
        platformSettings = await getPlatformSettings();
        const builtInMargin = platformSettings.builtInMargin || 0;
        const offerPrice = Number(offerData.price);
        const marginAmount = offerPrice * (builtInMargin / 100);
        const customerPrice = offerPrice + marginAmount;

        if (isNaN(offerPrice)) throw new Error("Invalid price");

        serviceTitleEl.textContent = requestData.serviceType || "Service Request";
        
        // Fetch provider name from users collection
        let providerName = offerData.providerName;
        if (!providerName && providerId) {
            const userSnap = await getDoc(doc(db, "users", providerId));
            if (userSnap.exists()) {
                providerName = userSnap.data().name || userSnap.data().displayName || "Provider";
            }
        }
        providerNameEl.textContent = providerName || "Provider";
        servicePriceEl.textContent = `NGN ${customerPrice.toLocaleString()}`;

    } catch (err) {
        console.error(err);
        alert(err.message);
        LoadingSpinner.navigateTo('my-requests.html');
    }
}

// ================= PAYMENT =================
function handleBookingFlow() {
    try {
        const selected = document.querySelector('input[name="paymentMethod"]:checked');
        if (!selected) {
            alert("Select a payment method");
            return;
        }

        const method = selected.value;

        confirmBookingBtn.disabled = true;
        confirmBookingBtn.innerText = "Processing...";

        // Calculate prices - handle both service and offer
        const price = isOfferPayment 
            ? Number(offerData.price)
            : Number(serviceData.price);
        const builtInMargin = platformSettings.builtInMargin || 0;
        const marginAmount = price * (builtInMargin / 100);
        const customerPrice = price + marginAmount;

        if (isNaN(customerPrice)) throw new Error("Invalid price");

        if (method === 'paystack') {

            if (typeof PaystackPop === "undefined") {
                throw new Error("Paystack not loaded");
            }

            const handler = PaystackPop.setup({
                key: 'pk_live_27b721ec9cd9be469fe24d0acd065dc8d6b9e67c', // ✅ LIVE KEY
                email: currentUser.email,
                amount: Math.round(customerPrice * 100),
                currency: 'NGN',
                ref: 'VORA-' + Date.now(),

                callback: function(response) {
                    console.log("REFERENCE:", response.reference);

                    if (isOfferPayment) {
                        saveOfferPaymentToFirestore(response.reference, 'paystack', 'pending', price, marginAmount, customerPrice)
                            .then(() => {
                                alert("Payment received. Awaiting verification.");
                                LoadingSpinner.navigateTo('my-requests.html');
                            })
                            .catch(err => {
                                console.error(err);
                                alert("Error saving payment");
                                resetButton();
                            });
                    } else {
                        saveBookingToFirestore('paystack', 'pending', response.reference, price, marginAmount, customerPrice)
                            .then((bookingId) => savePaymentToFirestore({
                                bookingId,
                                paymentMethod: 'paystack',
                                status: 'pending',
                                transactionRef: response.reference,
                                amount: customerPrice,
                                servicePrice: price,
                                marginAmount: marginAmount
                            }))
                            .then(() => {
                                alert("Payment received. Awaiting verification.");
                                LoadingSpinner.navigateTo('my-bookings.html');
                            })
                            .catch(err => {
                                console.error(err);
                                alert("Error saving booking/payment");
                                resetButton();
                            });
                    }
                },

                onClose: function() {
                    resetButton();
                }
            });

            handler.openIframe();

        } else {
            if (isOfferPayment) {
                saveOfferPaymentToFirestore(null, 'cash', 'pending', price, marginAmount, customerPrice)
                    .then(() => {
                        alert("Booking placed successfully!");
                        LoadingSpinner.navigateTo('my-requests.html');
                    })
                    .catch(err => {
                        console.error(err);
                        alert("Error saving payment");
                        resetButton();
                    });
            } else {
                saveBookingToFirestore('cash', 'pending', null, price, marginAmount, customerPrice)
                    .then((bookingId) => savePaymentToFirestore({
                        bookingId,
                        paymentMethod: 'cash',
                        status: 'pending',
                        transactionRef: null,
                        amount: customerPrice,
                        servicePrice: price,
                        marginAmount: marginAmount
                    }))
                    .then(() => {
                        alert("Booking placed successfully!");
                        LoadingSpinner.navigateTo('my-bookings.html');
                    })
                    .catch(err => {
                        console.error(err);
                        alert("Error saving booking/payment");
                        resetButton();
                    });
            }
        }

    } catch (err) {
        console.error(err);
        alert(err.message);
        resetButton();
    }
}

// ================= SAVE =================
async function saveBookingToFirestore(method, status, ref = null, servicePrice, marginAmount, customerPrice) {
    const providerId = serviceData.providerId || serviceData.userId;
    if (!providerId) {
        throw new Error('Missing provider ID for booking');
    }

    const newDoc = doc(collection(db, "bookings"));
    const bookingData = {
        bookingId: newDoc.id,
        serviceId: serviceId,
        serviceTitle: serviceData.title,
        providerId,
        providerName: serviceData.providerName || '',
        customerId: currentUser.uid,
        customerEmail: currentUser.email,
        servicePrice: servicePrice,
        marginAmount: marginAmount,
        customerPrice: customerPrice,
        paymentMethod: method,
        status: status, // ⚠️ always pending for paystack
        transactionRef: ref,
        createdAt: new Date()
    };
    console.log('Booking data to save:', bookingData);
    await setDoc(newDoc, bookingData).catch(error => {
        console.error('Error saving booking:', error);
        throw error;
    });
    return newDoc.id;
}

async function savePaymentToFirestore({ bookingId, paymentMethod, status, transactionRef = null, amount, servicePrice, marginAmount }) {
    const providerId = serviceData.providerId || serviceData.userId;
    if (!providerId) {
        throw new Error('Missing provider ID for payment');
    }

    const newDoc = doc(collection(db, "payments"));
    const paymentData = {
        paymentId: newDoc.id,
        bookingId: bookingId,
        serviceId: serviceId,
        serviceTitle: serviceData.title,
        providerId,
        providerName: serviceData.providerName || '',
        customerId: currentUser.uid,
        customerEmail: currentUser.email,
        userName: currentUser.displayName || currentUser.email,
        amount: Number(amount),
        servicePrice: servicePrice,
        marginAmount: marginAmount,
        paymentMethod: paymentMethod,
        status: status,
        transactionRef: transactionRef,
        reference: transactionRef || `CASH-${Date.now()}`,
        createdAt: new Date().toISOString()
    };
    console.log('Payment data to save:', paymentData);
    
    await setDoc(newDoc, paymentData).catch(error => {
        console.error('Error saving payment:', error);
        throw error;
    });

    // Create notification for provider
    await createNotification(
        providerId,
        'payment',
        '💳 New Booking Payment',
        `You have received a payment of ₦${amount.toLocaleString()} for your service "${serviceData.title}".`,
        {
            bookingId: bookingId,
            serviceId: serviceId,
            amount: amount,
            paymentMethod: paymentMethod
        }
    );

    // Create notification for customer
    await createNotification(
        currentUser.uid,
        'payment',
        '✅ Booking Confirmed',
        `Your booking for "${serviceData.title}" is confirmed. Payment: ₦${amount.toLocaleString()}`,
        {
            bookingId: bookingId,
            serviceId: serviceId,
            amount: amount,
            paymentMethod: paymentMethod
        }
    );
}

// ================= SAVE OFFER PAYMENT =================
async function saveOfferPaymentToFirestore(transactionRef, paymentMethod, status, price, marginAmount, customerPrice) {
    const providerId = offerData.providerId || offerData.userId;
    if (!providerId) {
        throw new Error('Missing provider ID for offer payment');
    }

    const newDoc = doc(collection(db, "offerPayments"));
    const paymentData = {
        paymentId: newDoc.id,
        offerId: offerId,
        requestId: requestId,
        serviceType: requestData.serviceType,
        providerId,
        providerName: offerData.providerName || '',
        customerId: currentUser.uid,
        customerEmail: currentUser.email,
        userName: currentUser.displayName || currentUser.email,
        amount: Number(customerPrice),
        servicePrice: price,
        marginAmount: marginAmount,
        paymentMethod: paymentMethod,
        status: status,
        transactionRef: transactionRef,
        reference: transactionRef || `CASH-${Date.now()}`,
        createdAt: new Date().toISOString()
    };
    console.log('Offer payment data to save:', paymentData);
    
    await setDoc(newDoc, paymentData).catch(error => {
        console.error('Error saving offer payment:', error);
        throw error;
    });

    // Create notification for provider
    await createNotification(
        providerId,
        'payment',
        '💳 Payment Received',
        `Your offer for ₦${customerPrice.toLocaleString()} has been accepted and payment received!`,
        {
            offerId: offerId,
            requestId: requestId,
            amount: customerPrice,
            paymentMethod: paymentMethod
        }
    );

    // Create notification for customer
    await createNotification(
        currentUser.uid,
        'payment',
        '✅ Payment Confirmed',
        `Your payment of ₦${customerPrice.toLocaleString()} has been processed successfully.`,
        {
            offerId: offerId,
            requestId: requestId,
            amount: customerPrice,
            paymentMethod: paymentMethod
        }
    );
}

// ================= RESET =================
function resetButton() {
    confirmBookingBtn.disabled = false;
    confirmBookingBtn.innerText = "Confirm & Pay";
}

// ================= MESSAGE PROVIDER =================
async function messageProvider() {
    if (!providerId || !currentUser) {
        alert("Unable to message provider at this moment");
        return;
    }

    try {
        // Find existing chat between current user and provider
        const q = query(
            collection(db, "chats"),
            where("participants", "array-contains", currentUser.uid)
        );
        
        const chatsSnapshot = await getDocs(q);
        let existingChatId = null;

        // Check if chat with this provider already exists
        chatsSnapshot.forEach(chatDoc => {
            const chatData = chatDoc.data();
            if (chatData.participants && chatData.participants.includes(providerId)) {
                existingChatId = chatDoc.id;
            }
        });

        // If chat exists, go to it
        if (existingChatId) {
            LoadingSpinner.navigateTo(`chat.html?id=${existingChatId}`);
            return;
        }

        // Create new chat
        const newChatRef = doc(collection(db, "chats"));
        const serviceTitle = isOfferPayment 
            ? requestData.serviceType 
            : serviceData.title;

        await setDoc(newChatRef, {
            participants: [currentUser.uid, providerId],
            serviceId: isOfferPayment ? requestId : serviceId,
            lastMessage: "Chat initiated",
            timestamp: serverTimestamp(),
            lastTimestamp: serverTimestamp()
        });

        // Redirect to new chat
        LoadingSpinner.navigateTo(`chat.html?id=${newChatRef.id}`);

    } catch (err) {
        console.error("Error messaging provider:", err);
        alert("Error opening chat with provider");
    }
}
