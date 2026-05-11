import { auth, db } from './firebase-config.js';
import { 
  doc, 
  getDoc, 
  setDoc 
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import LoadingSpinner from './loading-utils.js';

// Check admin access
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    LoadingSpinner.navigateTo('login.html');
    return;
  }

  try {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists() || userSnap.data().role !== 'admin') {
      // Redirect without showing page content
      LoadingSpinner.navigateTo('404.html?attempted=admin-settings');
      return;
    }

    // User is authorized - show the page
    document.body.classList.add('authorized');
  } catch (error) {
    console.error('Error checking admin role:', error);
    LoadingSpinner.navigateTo('404.html?attempted=admin-settings');
  }
});

const marginPercentageEl = document.getElementById('marginPercentage');
const saveMarginBtn = document.getElementById('saveMargin');
const currentMarginEl = document.getElementById('currentMargin');

const builtInMarginEl = document.getElementById('builtInMargin');
const saveBuiltInMarginBtn = document.getElementById('saveBuiltInMargin');
const currentBuiltInMarginEl = document.getElementById('currentBuiltInMargin');

// Load current settings
async function loadSettings() {
  try {
    const settingsDoc = await getDoc(doc(db, 'settings', 'platform'));
    if (settingsDoc.exists()) {
      const data = settingsDoc.data();
      const margin = data.marginPercentage || 0;
      const builtInMargin = data.builtInMargin || 0;
      currentMarginEl.textContent = `Current margin: ${margin}%`;
      marginPercentageEl.value = margin;
      currentBuiltInMarginEl.textContent = `Current built-in margin: ${builtInMargin}%`;
      builtInMarginEl.value = builtInMargin;
    } else {
      currentMarginEl.textContent = 'Current margin: 0%';
      currentBuiltInMarginEl.textContent = 'Current built-in margin: 0%';
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    currentMarginEl.textContent = 'Error loading margin';
    currentBuiltInMarginEl.textContent = 'Error loading built-in margin';
  }
}

// Save margin
saveMarginBtn.addEventListener('click', async () => {
  const margin = parseFloat(marginPercentageEl.value);
  if (isNaN(margin) || margin < 0 || margin > 100) {
    alert('Please enter a valid percentage between 0 and 100');
    return;
  }

  try {
    await setDoc(doc(db, 'settings', 'platform'), {
      marginPercentage: margin,
      updatedAt: new Date()
    }, { merge: true });
    alert('Margin updated successfully!');
    loadSettings();
  } catch (error) {
    console.error('Error saving margin:', error);
    alert('Error saving margin: ' + error.message);
  }
});

// Save built-in margin
saveBuiltInMarginBtn.addEventListener('click', async () => {
  const builtInMargin = parseFloat(builtInMarginEl.value);
  if (isNaN(builtInMargin) || builtInMargin < 0 || builtInMargin > 100) {
    alert('Please enter a valid percentage between 0 and 100');
    return;
  }

  try {
    await setDoc(doc(db, 'settings', 'platform'), {
      builtInMargin: builtInMargin,
      updatedAt: new Date()
    }, { merge: true });
    alert('Built-in margin updated successfully!');
    loadSettings();
  } catch (error) {
    console.error('Error saving built-in margin:', error);
    alert('Error saving built-in margin: ' + error.message);
  }
});

// Load on page load
loadSettings();