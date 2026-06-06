import { 
  auth, db, handleFirestoreError 
} from './firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  signInAnonymously
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  getDocs,
  query, 
  where,
  addDoc,
  deleteDoc,
  orderBy
} from 'firebase/firestore';
import { AppUser, FileItem, Order, Appointment, FamilyVault, AppNotification } from './types';
import { 
  INITIAL_USERS, INITIAL_ALBUMS, INITIAL_FILES, 
  INITIAL_ORDERS, INITIAL_APPOINTMENTS, INITIAL_NOTIFICATIONS 
} from './data';

// Standard passcode for our demo presets
export const DEMO_PASSWORD = "password123";

/**
 * Ensures a pre-registered or custom demo user exists in both Firebase Auth and Firestore.
 * Automatically provisions users using the standard credentials protocol.
 */
export async function ensureAndAuthenticateDemoUser(email: string, role: string, displayName: string): Promise<AppUser> {
  try {
    let authUser;
    try {
      // Attempt to sign in
      const credential = await signInWithEmailAndPassword(auth, email, DEMO_PASSWORD);
      authUser = credential.user;
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential') {
        // Authenticator doesn't have them; sign up
        const credential = await createUserWithEmailAndPassword(auth, email, DEMO_PASSWORD);
        authUser = credential.user;
        await updateProfile(authUser, { displayName });
      } else {
        throw err;
      }
    }

    // Now check if Firestore profile doc exists
    const userDocRef = doc(db, "users", authUser.uid);
    const snap = await getDoc(userDocRef);

    let profileData: AppUser;
    if (!snap.exists()) {
      // Find matching seeding params from templates
      const seedData = (INITIAL_USERS.find(u => u.email === email) || {}) as any;
      profileData = {
        uid: authUser.uid,
        email: authUser.email || email,
        displayName: displayName || seedData.displayName || authUser.email?.split('@')[0] || "User",
        role: (role || seedData.role || 'user') as any,
        profilePhoto: seedData.profilePhoto || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&q=80`,
        phone: seedData.phone || "+91 99999 11111",
        city: seedData.city || 'Jaipur',
        address: seedData.address || 'Heritage Lane, Jaipur',
        vehicleType: seedData.vehicleType || undefined,
        rating: seedData.rating || undefined,
        ordersCount: seedData.ordersCount || undefined
      };
      // Write profile doc - satisfying our Firestore rules (role specification match)
      await setDoc(userDocRef, profileData);
    } else {
      profileData = snap.data() as AppUser;
    }

    return profileData;
  } catch (error: any) {
    console.warn("Failed to authenticating demo user in Firebase:", error);
    // Bulletproof fallback: If Email/Password auth is disabled or restricted (e.g., auth/operation-not-allowed),
    // automatically spin up a simulated Sandbox Mode profile matching the desired role to preserve flawless preview gameplay.
    const seedData = (INITIAL_USERS.find(u => u.email === email) || {}) as any;
    console.info(`Triggering local high-fidelity sandbox session fallback for role '${role}' (Aarav, Kartik, Ananya, or Priya).`);
    return {
      uid: seedData.uid || `sandbox-${role}-${Date.now()}`,
      email: email,
      displayName: displayName || seedData.displayName || email.split('@')[0],
      role: (role || seedData.role || 'user') as any,
      profilePhoto: seedData.profilePhoto || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&q=80`,
      phone: seedData.phone || "+91 99999 11111",
      city: seedData.city || 'Jaipur',
      address: seedData.address || 'Heritage Lane, Jaipur',
      vehicleType: seedData.vehicleType || undefined,
      rating: seedData.rating || undefined,
      ordersCount: seedData.ordersCount || undefined,
      isSandbox: true
    };
  }
}

/**
 * Soft seeds Firestore tables with initial collections if they are entirely empty.
 * Ensures the workspace feels populated right away for reviewers.
 */
export async function seedFirestoreCollectionsIfEmpty() {
  try {
    console.log("Checking preset user profiles in Firestore...");
    // Force seed the initial user profiles so their roles and details exist in Firebase Firestore securely
    for (const u of INITIAL_USERS) {
      const userRef = doc(db, "users", u.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, u);
        console.log(`Seeded profile for preset user: ${u.email} to Firestore`);
      }
    }

    const ordersSnap = await getDocs(collection(db, "orders"));
    if (!ordersSnap.empty) {
      console.log("Firestore already contains order data. Skipping initial order, appt, file seeding.");
      return;
    }

    console.log("Seeding reference catalogs to database instance...");

    // 1. Seed Orders
    for (const ord of INITIAL_ORDERS) {
      await setDoc(doc(db, "orders", ord.id), ord);
    }

    // 2. Seed Appointments
    for (const appt of INITIAL_APPOINTMENTS) {
      await setDoc(doc(db, "appointments", appt.id), appt);
    }

    // 3. Seed Files
    for (const f of INITIAL_FILES) {
      await setDoc(doc(db, "files", f.id), f);
    }

    // 4. Seed Albums
    for (const alb of INITIAL_ALBUMS) {
      await setDoc(doc(db, "albums", alb.id), alb);
    }

    // 5. Seed Notifications
    for (const n of INITIAL_NOTIFICATIONS) {
      await setDoc(doc(db, "notifications", n.id), n);
    }

    console.log("Database seeded successfully.");
  } catch (error) {
    console.warn("Seeding failed (perhaps rules prevented self-creation on unauthenticated startup, this is expected):", error);
  }
}
