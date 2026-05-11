import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAFaajr2JtmI3rqnu1-R_78ktWDeM9LdzA",
  authDomain: "vora-d8987.firebaseapp.com",
  projectId: "vora-d8987",
  storageBucket: "vora-d8987.firebasestorage.app",
  messagingSenderId: "149332541676",
  appId: "1:149332541676:web:ad54ccc67c9cfa8574a5c9",
  measurementId: "G-CXNQSVSVMB"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };