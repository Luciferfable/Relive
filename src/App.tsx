import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, ShieldCheck, LogOut, RefreshCw, Key, Users, 
  HelpCircle, Mail, Phone, Lock, ArrowRight, CornerRightDown, MapPin,
  Check, X, Eye, EyeOff
} from 'lucide-react';

import { AppUser, FileItem, Order, Appointment, FamilyVault, AppNotification } from './types';
import { 
  INITIAL_USERS, INITIAL_ALBUMS, INITIAL_FILES, 
  INITIAL_ORDERS, INITIAL_APPOINTMENTS, INITIAL_NOTIFICATIONS 
} from './data';

import LandingPage from './components/LandingPage';
import DashboardUser from './components/DashboardUser';
import DashboardAdmin from './components/DashboardAdmin';
import DashboardPartner from './components/DashboardPartner';
import DashboardRestoration from './components/DashboardRestoration';

// Live Firebase Integration Elements
import { auth, db, googleProvider, handleFirestoreError, setCachedAccessToken } from './firebase';
import { 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
  updatePassword
} from 'firebase/auth';
import { 
  collection,
  onSnapshot,
  query,
  where,
  setDoc,
  doc,
  getDoc,
  deleteDoc,
  getDocFromServer
} from 'firebase/firestore';
import { ensureAndAuthenticateDemoUser, seedFirestoreCollectionsIfEmpty } from './firebaseHelpers';

const uniqueById = <T extends { id: string }>(arr: T[]): T[] => {
  const seen = new Set<string>();
  return arr.filter(item => {
    if (!item || !item.id) return false;
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

export default function App() {
  // Real-time state arrays synced from active Firestore instance
  const [users, setUsers] = useState<AppUser[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [albums, setAlbums] = useState<FamilyVault[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Connection diagnostics states
  const [isFirestoreOffline, setIsFirestoreOffline] = useState(false);
  const [showFirestoreGuide, setShowFirestoreGuide] = useState(false);

  // Auth & View States
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [isAuthMode, setIsAuthMode] = useState(false); // Active login register panel
  const [authForm, setAuthForm] = useState({ email: '', password: '', role: 'user' as any, name: '' });
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] = useState<1 | 2 | 3 | 4>(1);
  const [generatedResetToken, setGeneratedResetToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetPasswordInput, setShowResetPasswordInput] = useState(false);
  const [isResetShowPassword, setIsResetShowPassword] = useState(false);
  const [isResetShowConfirmPassword, setIsResetShowConfirmPassword] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [inactivityLoggedOut, setInactivityLoggedOut] = useState(false);

  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, text: 'No Password Entered', color: 'bg-stone-200', textTailwind: 'text-stone-400', requirements: [], metAll: false };
    
    const requirements = [
      { id: 'length', label: "At least 8 characters", met: pass.length >= 8 },
      { id: 'uppercase', label: "At least one uppercase letter (A-Z)", met: /[A-Z]/.test(pass) },
      { id: 'lowercase', label: "At least one lowercase letter (a-z)", met: /[a-z]/.test(pass) },
      { id: 'number', label: "At least one numeric digit (0-9)", met: /[0-9]/.test(pass) },
      { id: 'special', label: "At least one special character (!@#$%^&*)", met: /[^A-Za-z0-9]/.test(pass) }
    ];
    
    const metCount = requirements.filter(r => r.met).length;
    let text = 'Too Weak ❌';
    let color = 'bg-stone-200';
    let textTailwind = 'text-red-500';
    
    if (metCount === 5) {
      text = 'Excellent Strength ✨';
      color = 'bg-emerald-550';
      textTailwind = 'text-green-600';
    } else if (metCount === 4) {
      text = 'Good Strength ✅';
      color = 'bg-teal-500';
      textTailwind = 'text-teal-600';
    } else if (metCount === 3) {
      text = 'Moderate ⚠️';
      color = 'bg-amber-500';
      textTailwind = 'text-amber-600';
    } else if (metCount >= 1) {
      text = 'Weak Password 🔴';
      color = 'bg-red-500';
      textTailwind = 'text-red-500';
    }
    
    return { score: metCount, text, color, textTailwind, requirements, metAll: metCount === 5 };
  };

  // Email Verification States
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [userInputCode, setUserInputCode] = useState<string>('');
  const [isEmailVerified, setIsEmailVerified] = useState<boolean>(false);
  const [verificationLoading, setVerificationLoading] = useState<boolean>(false);
  const [verificationSent, setVerificationSent] = useState<boolean>(false);
  const [verificationError, setVerificationError] = useState<string>('');

  // Loading and Error parameters
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Test connection on boot to detect if Cloud Firestore is unreachable/uncreated
  useEffect(() => {
    const checkConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        setIsFirestoreOffline(false);
      } catch (err: any) {
        console.warn("[FIRESTORE DIAGNOSTICS] Connection check result:", err);
        if (
          err?.code === 'unavailable' || 
          err?.code === 'failed-precondition' ||
          (err?.message && (err.message.includes('unavailable') || err.message.includes('Could not reach') || err.message.includes('offline')))
        ) {
          setIsFirestoreOffline(true);
        }
      }
    };
    checkConnection();
  }, []);

  // 1. Setup Firebase Auth Subscriber
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        try {
          // Fetch authenticated profile document
          const userDocRef = doc(db, "users", authUser.uid);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            setCurrentUser(userSnap.data() as AppUser);
          } else {
            // Self-register profile fallback on first-time login
            const profile: AppUser = {
              uid: authUser.uid,
              email: authUser.email || "",
              displayName: authUser.displayName || authUser.email?.split('@')[0] || "User",
              role: 'user',
              city: 'Jaipur'
            };
            await setDoc(userDocRef, profile);
            setCurrentUser(profile);
          }
        } catch (err: any) {
          console.warn("Auth sync fallback user creation:", err);
          if (err?.code === 'unavailable') {
            setIsFirestoreOffline(true);
          }
          // Set standard currentUser with fallback if we are offline
          const found = INITIAL_USERS.find(u => u.email === authUser.email) || INITIAL_USERS[0];
          setCurrentUser({
            uid: authUser.uid,
            email: authUser.email || "",
            displayName: authUser.displayName || authUser.email?.split('@')[0] || found.displayName,
            role: found.role as any,
            city: found.city || 'Jaipur',
            isSandbox: true
          });
        }
      } else {
        setCurrentUser(null);
        setCachedAccessToken(null);
      }
    });

    // Seed preset records if system database is empty initially
    seedFirestoreCollectionsIfEmpty();

    return () => unsubscribeAuth();
  }, []);

  // 2. Setup Role-Aware Realtime Firestore Collection Listeners
  useEffect(() => {
    if (!currentUser) {
      setOrders([]);
      setAppointments([]);
      setFiles([]);
      setAlbums([]);
      setNotifications([]);
      return;
    }

    const { role, uid } = currentUser;

    // If local simulated/sandbox session is active or Firestore is offline, bypass live queries and populate with fallback data
    if (currentUser.isSandbox || isFirestoreOffline) {
      const customOrders = JSON.parse(localStorage.getItem(`relive_sand_orders_${uid}`) || '[]');
      const customAppts = JSON.parse(localStorage.getItem(`relive_sand_appts_${uid}`) || '[]');
      const customFilesRaw = JSON.parse(localStorage.getItem(`relive_sand_files_${uid}`) || '[]');
      const customAlbums = JSON.parse(localStorage.getItem(`relive_sand_albums_${uid}`) || '[]');
      const customNotifs = JSON.parse(localStorage.getItem(`relive_sand_notifs_${uid}`) || '[]');

      const customFiles = customFilesRaw.map((f: any) => ({
        ...f,
        previewUrl: f.previewUrl || `https://relive-images-processed.s3.us-east-1.amazonaws.com/processed-${f.name.replace(/\s+/g, '_')}`
      }));

      const processedInitial = INITIAL_FILES.map(f => ({
        ...f,
        previewUrl: f.previewUrl || `https://relive-images-processed.s3.us-east-1.amazonaws.com/processed-${f.name.replace(/\s+/g, '_')}`
      }));

      setOrders(uniqueById([...customOrders, ...INITIAL_ORDERS.filter(o => role !== 'user' || o.userId === 'user-01' || o.userId === uid)]));
      setAppointments(uniqueById([...customAppts, ...INITIAL_APPOINTMENTS.filter(a => role !== 'user' || a.userId === 'user-01' || a.userId === uid)]));
      setFiles(uniqueById([...customFiles, ...processedInitial.filter(f => role !== 'user' || f.userId === 'user-01' || f.userId === uid)]));
      setAlbums(uniqueById([...customAlbums, ...INITIAL_ALBUMS.filter(al => al.ownerId === 'user-01' || al.ownerId === uid)]));
      setNotifications(uniqueById([...customNotifs, ...INITIAL_NOTIFICATIONS.filter(n => role !== 'user' || n.userId === 'user-01' || n.userId === uid)]));
      if (role === 'admin') {
        setUsers(INITIAL_USERS);
      }
      return;
    }

    // A. Subscribe to Orders (User can only read or list their own, admin/partner/restorer can query all)
    let ordersQuery = collection(db, "orders") as any;
    if (role === 'user') {
      ordersQuery = query(collection(db, "orders"), where("userId", "==", uid));
    }
    const unsubscribeOrders = onSnapshot(ordersQuery, (snap) => {
      const ords: Order[] = [];
      snap.forEach(doc => ords.push(doc.data() as Order));
      ords.sort((a, b) => b.dateCreated.localeCompare(a.dateCreated));
      setOrders(ords);
    }, (err) => {
      console.warn("Orders listener permission gate (Using offline fallback cache):", err);
      if (err?.code === 'unavailable') {
        setIsFirestoreOffline(true);
      }
      setOrders(prev => prev.length ? prev : INITIAL_ORDERS.filter(o => role !== 'user' || o.userId === 'user-01'));
    });

    // B. Subscribe to Appointments (Role-restricted filters)
    let apptsQuery = collection(db, "appointments") as any;
    if (role === 'user') {
      apptsQuery = query(collection(db, "appointments"), where("userId", "==", uid));
    }
    const unsubscribeAppts = onSnapshot(apptsQuery, (snap) => {
      const appts: Appointment[] = [];
      snap.forEach(doc => appts.push(doc.data() as Appointment));
      setAppointments(appts);
    }, (err) => {
      console.warn("Appointments listener permission gate (Using offline fallback cache):", err);
      if (err?.code === 'unavailable') {
        setIsFirestoreOffline(true);
      }
      setAppointments(prev => prev.length ? prev : INITIAL_APPOINTMENTS.filter(a => role !== 'user' || a.userId === 'user-01'));
    });

    // C. Subscribe to Files (Secure assets query)
    let filesQuery = collection(db, "files") as any;
    if (role === 'user') {
      filesQuery = query(collection(db, "files"), where("userId", "==", uid));
    }
    const unsubscribeFiles = onSnapshot(filesQuery, (snap) => {
      const fls: FileItem[] = [];
      snap.forEach(doc => {
        const item = doc.data() as FileItem;
        if (!item.previewUrl && item.name) {
          item.previewUrl = `https://relive-images-processed.s3.us-east-1.amazonaws.com/processed-${item.name.replace(/\s+/g, '_')}`;
        }
        fls.push(item);
      });
      fls.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));
      setFiles(fls);
    }, (err) => {
      console.warn("Files listener permission gate (Using offline fallback cache):", err);
      if (err?.code === 'unavailable') {
        setIsFirestoreOffline(true);
      }
      const processedInitial = INITIAL_FILES.map(f => ({
        ...f,
        previewUrl: f.previewUrl || `https://relive-images-processed.s3.us-east-1.amazonaws.com/processed-${f.name.replace(/\s+/g, '_')}`
      }));
      setFiles(prev => prev.length ? prev : processedInitial.filter(f => role !== 'user' || f.userId === 'user-01'));
    });

    // D. Subscribe to FamilyVault Albums (Shared & Owner restrictions)
    let albumsQuery = collection(db, "albums") as any;
    if (role === 'user') {
      albumsQuery = query(collection(db, "albums"), where("ownerId", "==", uid));
    }
    const unsubscribeAlbums = onSnapshot(albumsQuery, (snap) => {
      const albs: FamilyVault[] = [];
      snap.forEach(doc => albs.push(doc.data() as FamilyVault));
      albs.sort((a, b) => b.createdDate.localeCompare(a.createdDate));
      setAlbums(albs);
    }, (err) => {
      console.warn("Albums listener permission gate (Using offline fallback cache):", err);
      if (err?.code === 'unavailable') {
        setIsFirestoreOffline(true);
      }
      setAlbums(prev => prev.length ? prev : INITIAL_ALBUMS.filter(al => role !== 'user' || al.ownerId === 'user-01'));
    });

    // E. Subscribe to Notifications
    let notifsQuery = collection(db, "notifications") as any;
    if (role === 'user') {
      notifsQuery = query(collection(db, "notifications"), where("userId", "==", uid));
    }
    const unsubscribeNotifs = onSnapshot(notifsQuery, (snap) => {
      const notifs: AppNotification[] = [];
      snap.forEach(doc => notifs.push(doc.data() as AppNotification));
      notifs.sort((a, b) => b.date.localeCompare(a.date));
      setNotifications(notifs);
    }, (err) => {
      console.warn("Notifications listener permission gate (Using offline fallback cache):", err);
      if (err?.code === 'unavailable') {
        setIsFirestoreOffline(true);
      }
      setNotifications(prev => prev.length ? prev : INITIAL_NOTIFICATIONS.filter(n => role !== 'user' || n.userId === 'user-01'));
    });

    // F. Subscribe to Users (Admins only)
    let unsubscribeUsers = () => {};
    if (role === 'admin') {
      unsubscribeUsers = onSnapshot(collection(db, "users"), (snap) => {
        const usrArray: AppUser[] = [];
        snap.forEach(doc => usrArray.push(doc.data() as AppUser));
        setUsers(usrArray);
      }, (err) => {
        console.warn("Users subscriber error (Using offline user directory):", err);
        if (err?.code === 'unavailable') {
          setIsFirestoreOffline(true);
        }
        setUsers(prev => prev.length ? prev : INITIAL_USERS);
      });
    }

    return () => {
      unsubscribeOrders();
      unsubscribeAppts();
      unsubscribeFiles();
      unsubscribeAlbums();
      unsubscribeNotifs();
      unsubscribeUsers();
    };
  }, [currentUser]);

  const dispatchSmtpStatusUpdate = async (title: string, status: string, description: string, userMail?: string) => {
    try {
      const emailToSend = userMail || currentUser?.email || "itzmebalustrade@gmail.com";
      await fetch('/api/smtp-send-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser?.uid || 'guest'}`,
          'X-User-Email': currentUser?.email || '',
          'X-User-Role': currentUser?.role || 'user'
        },
        body: JSON.stringify({
          email: emailToSend,
          title,
          status,
          description
        })
      });
    } catch (e) {
      console.warn("Silent SMTP status update notify skipped:", e);
    }
  };

  const syncToAdminFirebase = async (collectionName: string, docId: string, data: any) => {
    try {
      await fetch('/api/sync-to-firebase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser?.uid || 'guest'}`,
          'X-User-Email': currentUser?.email || '',
          'X-User-Role': currentUser?.role || 'user'
        },
        body: JSON.stringify({ collectionName, docId, data })
      });
      console.log(`[ReLive Admin Sync] successfully replicated doc "${docId}" in collection "${collectionName}" to live Admin SDK Firestore!`);
    } catch (e) {
      console.warn("[ReLive Admin Sync skipped]", e);
    }
  };

  const deleteFromAdminFirebase = async (collectionName: string, docId: string) => {
    try {
      await fetch('/api/delete-from-firebase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser?.uid || 'guest'}`,
          'X-User-Email': currentUser?.email || '',
          'X-User-Role': currentUser?.role || 'user'
        },
        body: JSON.stringify({ collectionName, docId })
      });
      console.log(`[ReLive Admin Sync] successfully deleted doc "${docId}" from collection "${collectionName}" in live Admin SDK Firestore.`);
    } catch (e) {
      console.warn("[ReLive Admin Sync Delete skipped]", e);
    }
  };

  const handleUpdateUser = async (updatedUser: AppUser) => {
    setCurrentUser(updatedUser);
    if (!updatedUser.isSandbox) {
      try {
        await setDoc(doc(db, "users", updatedUser.uid), updatedUser, { merge: true });
        console.log("Successfully synchronized user profile in Firestore!");
        dispatchSmtpStatusUpdate("User Profile Updated", "success", `User profile for "${updatedUser.displayName}" (${updatedUser.email}) was updated with new configuration parameters.`, updatedUser.email);
        await syncToAdminFirebase("users", updatedUser.uid, updatedUser);
      } catch (err: any) {
        console.warn("Could not synchronize user profile in Firestore:", err);
      }
    }
  };

  // Firestore DB Mutations
  const handleAddFile = async (newFile: FileItem) => {
    const fileWithMeta: FileItem = {
      ...newFile,
      thumbnailUrl: newFile.thumbnailUrl || (newFile.restoredUrl.includes('unsplash.com') ? newFile.restoredUrl.replace(/w=\d+/, 'w=300').replace(/q=\d+/, 'q=80') : newFile.restoredUrl),
      previewUrl: newFile.previewUrl || `https://relive-images-processed.s3.us-east-1.amazonaws.com/processed-${newFile.name.replace(/\s+/g, '_')}`,
      createdAt: newFile.createdAt || new Date().toISOString()
    };
    setFiles(prev => {
      if (prev.some(f => f.id === fileWithMeta.id)) return prev;
      const updated = uniqueById([fileWithMeta, ...prev]);
      if (currentUser?.isSandbox || isFirestoreOffline) {
        const customRaw = JSON.parse(localStorage.getItem(`relive_sand_files_${currentUser?.uid}`) || '[]');
        const custom = uniqueById(customRaw);
        if (!custom.some((f: any) => f.id === fileWithMeta.id)) {
          localStorage.setItem(`relive_sand_files_${currentUser?.uid}`, JSON.stringify(uniqueById([fileWithMeta, ...custom])));
        }
      }
      return updated;
    });
    try {
      await setDoc(doc(db, "files", fileWithMeta.id), fileWithMeta);
      dispatchSmtpStatusUpdate("New Archival File Digitized", "uploaded", `New archival file entry "${fileWithMeta.name}" has been uploaded and stored securely in ReLive restored files. Notes: ${fileWithMeta.restorationNotes || "None"}`, currentUser?.email);
      await syncToAdminFirebase("files", fileWithMeta.id, fileWithMeta);
    } catch (err: any) {
      console.warn("Firestore file insertion skipped or restricted, offline mock persistent state updated:", err);
    }
  };

  const handleDeleteFile = async (id: string) => {
    setFiles(prev => {
      const updated = prev.filter(f => f.id !== id);
      if (currentUser?.isSandbox || isFirestoreOffline) {
        const custom = JSON.parse(localStorage.getItem(`relive_sand_files_${currentUser?.uid}`) || '[]');
        localStorage.setItem(`relive_sand_files_${currentUser?.uid}`, JSON.stringify(custom.filter((f: any) => f.id !== id)));
      }
      return updated;
    });
    try {
      await deleteDoc(doc(db, "files", id));
      dispatchSmtpStatusUpdate("Archival File Removed", "deleted", `An archival photo reference with ID "${id}" has been deleted from ReLive restored files.`, currentUser?.email);
      await deleteFromAdminFirebase("files", id);
    } catch (err: any) {
      console.warn("Firestore file deletion skipped or restricted, offline mock persistent state updated:", err);
    }
  };

  const handleUpdateOrder = async (updatedOrder: Order) => {
    setOrders(prev => {
      const updated = prev.map(o => o.id === updatedOrder.id ? updatedOrder : o);
      if (currentUser?.isSandbox || isFirestoreOffline) {
        const custom = JSON.parse(localStorage.getItem(`relive_sand_orders_${currentUser?.uid}`) || '[]');
        const updatedCustom = custom.some((o: any) => o.id === updatedOrder.id)
          ? custom.map((o: any) => o.id === updatedOrder.id ? updatedOrder : o)
          : [updatedOrder, ...custom];
        localStorage.setItem(`relive_sand_orders_${currentUser?.uid}`, JSON.stringify(updatedCustom));
      }
      return updated;
    });
    try {
      await setDoc(doc(db, "orders", updatedOrder.id), updatedOrder);
      dispatchSmtpStatusUpdate("Preservation Order Updated", updatedOrder.deliveryStatus, `Order status updated for Reference ID: ${updatedOrder.id}.\nNew Delivery Status: ${updatedOrder.deliveryStatus}\nItem Count: ${updatedOrder.itemCount} units of ${updatedOrder.serviceType}.`, currentUser?.email);
      await syncToAdminFirebase("orders", updatedOrder.id, updatedOrder);

      // Trigger automatic realtime user notification inside Firestore if handover is completed
      if (updatedOrder.deliveryStatus === 'pickup_verified') {
        const addedNotif: AppNotification = {
          id: `notif-${Date.now()}`,
          userId: updatedOrder.userId,
          title: 'Pickup Verified & Collected 🔒',
          message: 'Our regional logistics partner verified your Secure OTP. Handover complete. Spool transit in progress.',
          type: 'pickup',
          date: new Date().toISOString().split('T')[0],
          isRead: false
        };
        await handleAddNotification(addedNotif);
      }
    } catch (err: any) {
      console.warn("Firestore order update skipped or restricted, offline mock persistent state updated:", err);
    }
  };

  const handleAddOrder = async (newOrder: Order) => {
    setOrders(prev => {
      if (prev.some(o => o.id === newOrder.id)) return prev;
      const updated = [newOrder, ...prev];
      if (currentUser?.isSandbox || isFirestoreOffline) {
        const custom = JSON.parse(localStorage.getItem(`relive_sand_orders_${currentUser?.uid}`) || '[]');
        localStorage.setItem(`relive_sand_orders_${currentUser?.uid}`, JSON.stringify([newOrder, ...custom]));
      }
      return updated;
    });
    try {
      await setDoc(doc(db, "orders", newOrder.id), newOrder);
      dispatchSmtpStatusUpdate("New Preservation Order Placed", newOrder.deliveryStatus, `A new memory preservation order has been successfully placed!\nOrder Reference ID: ${newOrder.id}\nPreserved Volume: ${newOrder.itemCount} cassettes/reels of ${newOrder.serviceType}\nScheduled Delivery Status: ${newOrder.deliveryStatus}.`, currentUser?.email);
      await syncToAdminFirebase("orders", newOrder.id, newOrder);
    } catch (err: any) {
      console.warn("Firestore order insertion skipped or restricted, offline mock persistent state updated:", err);
    }
  };

  const handleAddAppointment = async (newAppt: Appointment) => {
    setAppointments(prev => {
      if (prev.some(a => a.id === newAppt.id)) return prev;
      const updated = [newAppt, ...prev];
      if (currentUser?.isSandbox || isFirestoreOffline) {
        const custom = JSON.parse(localStorage.getItem(`relive_sand_appts_${currentUser?.uid}`) || '[]');
        localStorage.setItem(`relive_sand_appts_${currentUser?.uid}`, JSON.stringify([newAppt, ...custom]));
      }
      return updated;
    });
    try {
      await setDoc(doc(db, "appointments", newAppt.id), newAppt);
      dispatchSmtpStatusUpdate("Doorstep Pickup Booked", "scheduled", `New doorstep pickup appointment booked successfully!\nAppointment Reference ID: ${newAppt.id}\nAddress: ${newAppt.address}\nScheduled Date: ${newAppt.scheduledDate} (${newAppt.timeSlot})\nContact Name: ${newAppt.customerName}`, currentUser?.email);
      await syncToAdminFirebase("appointments", newAppt.id, newAppt);
    } catch (err: any) {
      console.warn("Firestore appointment insertion skipped or restricted, offline mock persistent state updated:", err);
    }
  };

  const handleUpdateAppointment = async (updatedAppt: Appointment) => {
    setAppointments(prev => {
      const updated = prev.map(a => a.id === updatedAppt.id ? updatedAppt : a);
      if (currentUser?.isSandbox || isFirestoreOffline) {
        const custom = JSON.parse(localStorage.getItem(`relive_sand_appts_${currentUser?.uid}`) || '[]');
        const updatedCustom = custom.some((a: any) => a.id === updatedAppt.id)
          ? custom.map((a: any) => a.id === updatedAppt.id ? updatedAppt : a)
          : [updatedAppt, ...custom];
        localStorage.setItem(`relive_sand_appts_${currentUser?.uid}`, JSON.stringify(updatedCustom));
      }
      return updated;
    });
    try {
      await setDoc(doc(db, "appointments", updatedAppt.id), updatedAppt);
      dispatchSmtpStatusUpdate("Doorstep Pickup Appointment Updated", updatedAppt.status, `Your doorstep pickup appointment ID: ${updatedAppt.id} has been modified.\nNew Status: ${updatedAppt.status}\nScheduled Date: ${updatedAppt.scheduledDate} (${updatedAppt.timeSlot})`, currentUser?.email);
      await syncToAdminFirebase("appointments", updatedAppt.id, updatedAppt);
    } catch (err: any) {
      console.warn("Firestore appointment update skipped, offline mock state updated:", err);
    }
  };

  const handleAddAlbum = async (newSub: FamilyVault) => {
    setAlbums(prev => {
      if (prev.some(a => a.id === newSub.id)) return prev;
      const updated = [newSub, ...prev];
      if (currentUser?.isSandbox || isFirestoreOffline) {
        const custom = JSON.parse(localStorage.getItem(`relive_sand_albums_${currentUser?.uid}`) || '[]');
        localStorage.setItem(`relive_sand_albums_${currentUser?.uid}`, JSON.stringify([newSub, ...custom]));
      }
      return updated;
    });
    try {
      await setDoc(doc(db, "albums", newSub.id), newSub);
      await syncToAdminFirebase("albums", newSub.id, newSub);
    } catch (err: any) {
      console.warn("Firestore album registration skipped, offline mock state updated:", err);
    }
  };

  const handleAddNotification = async (newNotif: AppNotification) => {
    setNotifications(prev => {
      if (prev.some(n => n.id === newNotif.id)) return prev;
      const updated = uniqueById([newNotif, ...prev]);
      if (currentUser?.isSandbox || isFirestoreOffline) {
        const customRaw = JSON.parse(localStorage.getItem(`relive_sand_notifs_${currentUser?.uid}`) || '[]');
        const custom = uniqueById(customRaw);
        if (!custom.some((n: any) => n.id === newNotif.id)) {
          localStorage.setItem(`relive_sand_notifs_${currentUser?.uid}`, JSON.stringify(uniqueById([newNotif, ...custom])));
        }
      }
      return updated;
    });
    try {
      await setDoc(doc(db, "notifications", newNotif.id), newNotif);
      await syncToAdminFirebase("notifications", newNotif.id, newNotif);
    } catch (err: any) {
      console.warn("Firestore notification insertion skipped, offline mock state updated:", err);
    }
  };

  // Authenticate & register demo characters directly in Firebase Auth and Firestore on request
  const handleDevRoleSwitch = async (role: 'user' | 'admin' | 'partner' | 'restorer') => {
    setIsAuthLoading(true);
    setErrorMsg('');
    try {
      const emailMap = {
        user: 'itzmebalustrade@gmail.com',
        admin: 'admin@relive.club',
        partner: 'kartik@relive.club',
        restorer: 'ananya@relive.club'
      };
      const nameMap = {
        user: 'Aarav Sharma',
        admin: 'Priya Iyer',
        partner: 'Kartik Yadav',
        restorer: 'Ananya Sen'
      };
      const email = emailMap[role];
      const name = nameMap[role];

      const profile = await ensureAndAuthenticateDemoUser(email, role, name);
      setCurrentUser(profile);
      setIsAuthMode(false);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Role switch authentication failed: ${err.message || err}`);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSendVerificationEmail = async () => {
    if (!authForm.email || !authForm.email.includes('@')) {
      setVerificationError("Please input a valid email address first.");
      return;
    }
    setVerificationLoading(true);
    setVerificationError('');
    try {
      const response = await fetch('/api/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser?.uid || authForm.email || 'guest'}`,
          'X-User-Email': authForm.email || currentUser?.email || '',
          'X-User-Role': currentUser?.role || 'user'
        },
        body: JSON.stringify({ email: authForm.email })
      });
      const data = await response.json();
      if (data.success) {
        setVerificationCode(data.code);
        setVerificationSent(true);
        setVerificationError('');
        console.log(`[VERIFICATION EMAIL SENT] Simulation code is: ${data.code}`);
      } else {
        setVerificationError("Failed sending verification email.");
      }
    } catch (e: any) {
      setVerificationError("Verification connection failed.");
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleVerifyCode = () => {
    if (userInputCode.trim() === verificationCode && verificationCode !== '') {
      setIsEmailVerified(true);
      setVerificationError('');
      alert("✓ Registered Email Successfully Verified! You can now proceed to register.");
    } else {
      setVerificationError("Invalid confirmation code. Please check your console or email!");
    }
  };

  const detectRoleFromEmail = (email: string): 'user' | 'admin' | 'partner' | 'restorer' => {
    const e = email.toLowerCase();
    const found = INITIAL_USERS.find(u => u.email.toLowerCase() === e);
    if (found) return found.role;
    if (e.includes('admin')) return 'admin';
    if (e.includes('partner') || e.includes('kartik') || e.includes('vikram')) return 'partner';
    if (e.includes('restorer') || e.includes('ananya')) return 'restorer';
    return 'user';
  };

  // Submit active credential validation
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setErrorMsg('');
    const resolvedRole = detectRoleFromEmail(authForm.email);
    try {
      if (isSignup) {
        if (!isEmailVerified) {
          setErrorMsg("Safety Error: Please click 'Verify Email' and enter your secure confirmation code to register.");
          setIsAuthLoading(false);
          return;
        }
        
        const pwdStrength = getPasswordStrength(authForm.password);
        if (!pwdStrength.metAll) {
          setErrorMsg("🔒 Security requirement error: Please ensure your password meets all strength criteria displayed above.");
          setIsAuthLoading(false);
          return;
        }

        try {
          // 1. Create authenticator account
          const credential = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
          const authUser = credential.user;
          await updateProfile(authUser, { displayName: authForm.name });

          // 2. Create custom role record in Firestore
          const profile: AppUser = {
            uid: authUser.uid,
            email: authForm.email,
            displayName: authForm.name || authForm.email.split('@')[0],
            role: resolvedRole,
            city: 'Jaipur'
          };
          
          try {
            await setDoc(doc(db, "users", authUser.uid), profile);
          } catch (dbErr) {
            console.warn("Firestore setDoc failed during registration; continuing with local signin state:", dbErr);
          }
          
          setCurrentUser(profile);
        } catch (authErr: any) {
          console.warn("Auth signup failed or unconfigured, falling back to dynamic sandbox registration...", authErr);
          const profile: AppUser = {
            uid: `sandbox-${Date.now()}`,
            email: authForm.email,
            displayName: authForm.name || authForm.email.split('@')[0],
            role: resolvedRole,
            city: 'Jaipur',
            isSandbox: true
          };
          const sandCreds = JSON.parse(localStorage.getItem('relive_sand_creds') || '[]');
          sandCreds.push({ email: authForm.email.toLowerCase(), password: authForm.password, profile });
          localStorage.setItem('relive_sand_creds', JSON.stringify(sandCreds));
          
          try {
            await setDoc(doc(db, "users", profile.uid), profile);
          } catch (dbErr) {
            console.warn("Could not sync sandbox user to Firestore:", dbErr);
          }
          
          setCurrentUser(profile);
        }
      } else {
        try {
          // Sign in standard user with auto-creation fallback for initial demo users
          let credential;
          try {
            const matchedPreset = INITIAL_USERS.find(u => u.email.toLowerCase() === authForm.email.toLowerCase());
            if (matchedPreset && authForm.password !== 'password123') {
              throw { code: 'auth/wrong-password', message: "🔒 Incorrect password. Please try again with the correct credentials." };
            }
            credential = await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
          } catch (signInErr: any) {
            if (signInErr?.code === 'auth/wrong-password') {
              throw signInErr;
            }
            const matchedUser = INITIAL_USERS.find(u => u.email.toLowerCase() === authForm.email.toLowerCase());
            if (matchedUser && (signInErr?.code === 'auth/user-not-found' || signInErr?.code === 'auth/invalid-credential' || signInErr?.code === 'auth/invalid-login-credentials')) {
              console.log("Auto-provisioning first-time initial demo user:", authForm.email);
              try {
                credential = await createUserWithEmailAndPassword(auth, authForm.email, 'password123');
                await updateProfile(credential.user, { displayName: matchedUser.displayName });
              } catch (createErr) {
                throw signInErr;
              }
            } else {
              throw signInErr;
            }
          }

          const authUser = credential.user;

          // Retrieve role definitions
          const userDocRef = doc(db, "users", authUser.uid);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            setCurrentUser(userSnap.data() as AppUser);
          } else {
            const seedData = (INITIAL_USERS.find(u => u.email.toLowerCase() === authForm.email.toLowerCase()) || {}) as any;
            const fallbackProfile: AppUser = {
              uid: authUser.uid,
              email: authUser.email || authForm.email,
              displayName: authUser.displayName || seedData.displayName || authForm.name || authForm.email.split('@')[0],
              role: resolvedRole,
              city: seedData.city || 'Jaipur',
              profilePhoto: seedData.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&q=80',
              phone: seedData.phone || "+91 99999 11111",
              address: seedData.address || 'Heritage Lane, Jaipur',
              vehicleType: seedData.vehicleType,
              rating: seedData.rating,
              ordersCount: seedData.ordersCount
            };
            await setDoc(userDocRef, fallbackProfile);
            setCurrentUser(fallbackProfile);
          }
        } catch (authErr: any) {
          if (authErr?.code === 'auth/operation-not-allowed' || authErr?.code === 'auth/wrong-password' || authErr?.code === 'auth/user-not-found') {
            console.warn("Handling authentication flow via dynamic sandbox router...");
            
            const targetEmail = authForm.email.toLowerCase();
            const matchedPresetUser = INITIAL_USERS.find(u => u.email.toLowerCase() === targetEmail);
            
            const sandCreds = JSON.parse(localStorage.getItem('relive_sand_creds') || '[]');
            const matchedDynamic = sandCreds.find((c: any) => c.email === targetEmail);
            
            let authenticatedProfile: AppUser | null = null;
            
            if (matchedPresetUser) {
              if (authForm.password === 'password123') {
                authenticatedProfile = matchedPresetUser;
              } else {
                throw { code: 'auth/wrong-password', message: "🔒 Incorrect password. Please try again with the correct credentials ('password123' for demo users)." };
              }
            } else if (matchedDynamic) {
              if (authForm.password === matchedDynamic.password) {
                authenticatedProfile = matchedDynamic.profile;
              } else {
                throw { code: 'auth/wrong-password', message: "🔒 Incorrect password. Please try again with the correct credentials." };
              }
            } else {
              throw { code: 'auth/user-not-found', message: "📧 No registered account found with this email. Click 'Create new account' to register." };
            }

            const profile: AppUser = {
              ...authenticatedProfile,
              isSandbox: true
            };
            setCurrentUser(profile);
          } else {
            throw authErr;
          }
        }
      }

      setIsAuthMode(false);

      const targetUid = currentUser?.uid || auth.currentUser?.uid || 'user-01';
      handleAddNotification({
        id: `no-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
        userId: targetUid,
        title: 'Platform Handshake Activated 🛡️',
        message: `Successfully authenticated to the ReLive portal. Happy exploring!`,
        type: 'general',
        date: new Date().toISOString().split('T')[0],
        isRead: false
      });
    } catch (err: any) {
      console.error("Auth submit error:", err);
      let errMsg = "Credential verification failed. Please check your email and password.";
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential' || err?.code === 'err/invalid-login-credentials' || err?.code === 'auth/invalid-login-credentials' || err?.message?.includes('password')) {
        errMsg = "🔒 Incorrect password. Please try again with the correct credentials.";
      } else if (err?.code === 'auth/user-not-found') {
        errMsg = "📧 No registered account found with this email. Click 'Create new account' to register.";
      } else if (err?.code === 'auth/email-already-in-use') {
        errMsg = "📧 This email is already registered. Please login instead.";
      } else if (err?.code === 'auth/weak-password') {
        errMsg = "🔑 Password is too weak. Please use at least 6 characters.";
      } else if (err?.message) {
        errMsg = err.message;
      }
      setErrorMsg(errMsg);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsAuthLoading(true);
    setErrorMsg('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const authUser = result.user;
      const resolvedRole = detectRoleFromEmail(authUser.email || '');

      // Retrieve or create role definitions from Firestore
      const userDocRef = doc(db, "users", authUser.uid);
      const userSnap = await getDoc(userDocRef);
      let profile: AppUser;
      if (userSnap.exists()) {
        profile = userSnap.data() as AppUser;
      } else {
        const seedData = (INITIAL_USERS.find(u => u.email.toLowerCase() === (authUser.email || '').toLowerCase()) || {}) as any;
        profile = {
          uid: authUser.uid,
          email: authUser.email || '',
          displayName: authUser.displayName || seedData.displayName || authUser.email?.split('@')[0] || "Google Member",
          role: resolvedRole,
          city: seedData.city || 'Jaipur',
          profilePhoto: authUser.photoURL || seedData.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&q=80',
          phone: seedData.phone || "+91 99999 11111",
          address: seedData.address || 'Heritage Lane, Jaipur',
          vehicleType: seedData.vehicleType,
          rating: seedData.rating,
          ordersCount: seedData.ordersCount
        };
        await setDoc(userDocRef, profile);
      }

      setCurrentUser(profile);
      setIsAuthMode(false);

      handleAddNotification({
        id: `no-g-${Date.now()}`,
        userId: authUser.uid,
        title: 'Google Handshake Activated 🛡️',
        message: `Welcome ${profile.displayName}! Successfully authenticated to the ReLive portal via Google.`,
        type: 'general',
        date: new Date().toISOString().split('T')[0],
        isRead: false
      });
    } catch (err: any) {
      console.error("Google Sign-In Error:", err);
      if (err?.code === 'auth/popup-closed-by-user') {
        setErrorMsg("Google Sign-In was cancelled.");
      } else if (err?.code === 'auth/operation-not-allowed') {
        console.warn("Google Auth operation disabled. Connecting sandbox profile...");
        const fallbackEmail = authForm.email || 'itzmebalustrade@gmail.com';
        const resolvedRole = detectRoleFromEmail(fallbackEmail);
        const selectedMatch = INITIAL_USERS.find(u => u.email === fallbackEmail) || INITIAL_USERS.find(u => u.role === resolvedRole) || INITIAL_USERS[0];
        const profile: AppUser = {
          uid: selectedMatch.uid,
          email: fallbackEmail,
          displayName: selectedMatch.displayName || fallbackEmail.split('@')[0],
          role: resolvedRole,
          city: selectedMatch.city || 'Jaipur',
          isSandbox: true
        };
        setCurrentUser(profile);
        setIsAuthMode(false);
      } else {
        setErrorMsg(err.message || "Google Sign-In failed.");
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const triggerPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotPasswordEmail) {
      setIsAuthLoading(true);
      try {
        // Option fallback check: attempt to invoke base Firebase Auth reset email trigger
        try {
          await sendPasswordResetEmail(auth, forgotPasswordEmail);
        } catch (fbErr) {
          console.warn("Base Firebase Auth reset email failed or unconfigured, falling back to simulated secure cryptographic link generation:", fbErr);
        }
        
        // Generate simulated secure cryptographic reset token (lifespan: 15 minutes)
        const expiry = Date.now() + 15 * 60 * 1000;
        const payload = JSON.stringify({ 
          email: forgotPasswordEmail.toLowerCase().trim(), 
          expires: expiry, 
          salt: "reLive_secure_pwd_reset_28fc1" 
        });
        
        // Make URL-safe Base64 representation of the payload
        const b64Token = btoa(payload)
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
        
        setGeneratedResetToken(`https://relive.club/secure-reset?token=${b64Token}`);
        setForgotPasswordStep(2); // Progress to token inspection step
      } catch (err: any) {
        alert(`Reset dispatch error: ${err.message || err}`);
      } finally {
        setIsAuthLoading(false);
      }
    }
  };

  const handleVerifyResetToken = (tokenUrl: string) => {
    try {
      const url = new URL(tokenUrl);
      const token = url.searchParams.get('token');
      if (!token) {
        alert("Verification Error: No cryptographic token found in secure link.");
        return;
      }
      
      // Decode URL-safe Base64 token
      let b64 = token.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) {
        b64 += '=';
      }
      const rawJson = atob(b64);
      const data = JSON.parse(rawJson);
      
      if (!data.email || !data.expires) {
        alert("Security Violation: Cryptographic signature mismatch or corrupted token structural payload.");
        return;
      }
      
      if (Date.now() > data.expires) {
        alert("Security Violation: This cryptographically signed link has expired (15 minutes lifespan lapsed). Please generate a new one.");
        return;
      }
      
      // Securely authorize state machine update transitions
      setForgotPasswordEmail(data.email);
      setForgotPasswordStep(3); // Password replacement step
      setResetNewPassword('');
      setResetConfirmPassword('');
    } catch (e) {
      alert("Cryptographic Integrity Error: Failed to parse secure token signature. The link may have been corrupted or tampered with.");
    }
  };

  const handleSaveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const pwdStrength = getPasswordStrength(resetNewPassword);
    if (!pwdStrength.metAll) {
      alert("🔒 Security requirement error: Please ensure your new password meets all strength criteria displayed on screen.");
      return;
    }
    
    if (resetNewPassword !== resetConfirmPassword) {
      alert("Verification mismatch: The entered passwords do not match. Please verify.");
      return;
    }

    setIsAuthLoading(true);
    try {
      // 1. Update fallback local sandbox stored accounts
      const sandCreds = JSON.parse(localStorage.getItem('relive_sand_creds') || '[]');
      const targetEmail = forgotPasswordEmail.toLowerCase().trim();
      let updated = false;
      const updatedCreds = sandCreds.map((cred: any) => {
        if (cred.email.toLowerCase() === targetEmail) {
          updated = true;
          return { ...cred, password: resetNewPassword };
        }
        return cred;
      });
      
      if (!updated) {
        // Register credentials into sandbox if this email hasn't logged in with sandbox yet
        updatedCreds.push({
          email: targetEmail,
          password: resetNewPassword,
          profile: {
            uid: `sandbox-${Date.now()}`,
            email: targetEmail,
            displayName: targetEmail.split('@')[0],
            role: 'user',
            city: 'Jaipur',
            isSandbox: true
          }
        });
      }
      localStorage.setItem('relive_sand_creds', JSON.stringify(updatedCreds));

      // 2. Perform live Firebase Auth matching account update if currently signed in 
      if (auth.currentUser && auth.currentUser.email?.toLowerCase() === targetEmail) {
        try {
          await updatePassword(auth.currentUser, resetNewPassword);
        } catch (fbErr: any) {
          console.warn("Base Firebase Auth matching password update bypassed - recent signin context required:", fbErr);
        }
      }

      setForgotPasswordStep(4); // Display completion confirmation screen in the modal
    } catch (err: any) {
      alert(`Save failed: ${err.message || err}`);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setCurrentUser(null);
      setIsAuthMode(false);
    } catch (err: any) {
      console.error("Signout error:", err);
    }
  };

  // User activity tracker for 30 minutes automatic session termination
  useEffect(() => {
    if (!currentUser) return;

    // 30 minutes: 30 * 60 * 1000 ms
    const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
    let logoutTimer: any;

    const performInactivityLogout = () => {
      console.warn("🔐 [ReLive Security] Session expired due to 30 minutes of inactivity. Logging out.");
      handleLogout();
      setInactivityLoggedOut(true);
      setIsAuthMode(true); // Direct user to Member Login
    };

    const resetTimer = () => {
      if (logoutTimer) clearTimeout(logoutTimer);
      logoutTimer = setTimeout(performInactivityLogout, INACTIVITY_TIMEOUT_MS);
    };

    // Initialise timer with boot
    resetTimer();

    // Event listeners to detect activity
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    
    // Throttle calling reset to be efficient with DOM interaction
    let lastResetTime = Date.now();
    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastResetTime > 1000) { // Throttle resetting to max once per second
        resetTimer();
        lastResetTime = now;
      }
    };

    activityEvents.forEach((event) => {
      window.addEventListener(event, handleUserActivity);
    });

    return () => {
      if (logoutTimer) clearTimeout(logoutTimer);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleUserActivity);
      });
    };
  }, [currentUser]);

  // Sync state: when user is logged back in, clear the logged out alert
  useEffect(() => {
    if (currentUser) {
      setInactivityLoggedOut(false);
    }
  }, [currentUser]);

  return (
    <div className="bg-stone-50 min-h-screen text-stone-900 font-sans flex flex-col justify-between">
      {isFirestoreOffline && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-6 py-2.5 text-center text-xs relative z-40 flex flex-wrap items-center justify-center gap-2 shadow-sm font-sans shrink-0">
          <span className="flex items-center gap-1.5 font-semibold">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            ⚠️ Firestore Connection Standby:
          </span>
          <span>
            Database backend is currently unreachable. ReLive has gracefully enabled high-fidelity mock sandbox simulation.
          </span>
          <button
            onClick={() => setShowFirestoreGuide(true)}
            className="underline hover:text-amber-800 font-bold ml-1 cursor-pointer"
          >
            Database Setup Guide & Real-Time Sync Activation ➔
          </button>
        </div>
      )}

      {/* Primary Header - Upgraded to floating glass-nav */}
      <header className="glass-nav sticky top-3 z-45 px-5 sm:px-8 py-4.5 mx-auto max-w-7xl w-[94%] rounded-3xl shadow-lg border border-white/40 flex items-center justify-between transition-all duration-300">
        <div 
          onClick={() => {
            setIsAuthMode(false);
          }}
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-xl bg-stone-950 flex items-center justify-center font-serif text-white font-serif font-black group-hover:bg-amber-500 transition-colors">
            RL
          </div>
          <div>
            <span className="font-serif font-black tracking-tight text-lg text-stone-950 group-hover:text-amber-600 transition-colors">ReLive</span>
            <span className="block text-[8px] tracking-widest font-mono text-stone-400 uppercase">Memory Restoration Core</span>
          </div>
        </div>

        {!currentUser && (
          <nav className="hidden md:flex gap-8 text-xs sm:text-sm font-semibold text-stone-600">
            <button onClick={() => { setIsAuthMode(false); }} className="hover:text-stone-950 cursor-pointer transition-colors">Science & Process</button>
            <button onClick={() => { setIsAuthMode(false); }} className="hover:text-stone-950 cursor-pointer transition-colors">Laboratories</button>
            <button onClick={() => { setIsAuthMode(false); }} className="hover:text-stone-950 cursor-pointer transition-colors">Joint Family Pricing</button>
          </nav>
        )}

        <div className="flex items-center gap-3">
          {currentUser ? (
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline bg-stone-950 text-amber-400 text-[9px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-lg border border-stone-800">
                👤 {currentUser.role}
              </span>
              <button
                id="header-logout"
                onClick={handleLogout}
                className="px-3 py-2 text-stone-700 hover:text-stone-950 hover:bg-stone-100 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs text-stone-700 font-bold"
                title="Secure logout"
              >
                <LogOut className="w-4 h-4 text-stone-600" />
                Logout
              </button>
            </div>
          ) : (
            <button
              id="header-login-trigger"
              onClick={() => {
                setIsAuthMode(true);
                setIsSignup(false);
              }}
              className="px-5 py-2.5 bg-stone-950 hover:bg-stone-850 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              Access Portal
            </button>
          )}
        </div>
      </header>

      {/* Core main container */}
      <main className="flex-grow">
        {isAuthMode ? (
          <div className="relative min-h-[85vh] w-[94%] flex items-center justify-center p-4 sm:p-8 bg-stone-900/40 overflow-hidden rounded-3xl my-6 max-w-7xl mx-auto shadow-inner">
            {/* Indian Family Background Showcase with Hover Zoom-Color Effect */}
            <motion.div 
              className="absolute inset-0 z-0 bg-stone-950"
              initial={{ scale: 1.05 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.5 }}
            >
              <img
                src="https://images.unsplash.com/photo-1605001011156-cbf0b0f67a51?w=1600&q=80"
                alt="Cherished Indian Family Heritage"
                className="w-full h-full object-cover opacity-60 filter grayscale brightness-55 contrast-125 transition-all duration-1000 ease-in-out hover:scale-110 hover:filter-none hover:opacity-85 cursor-pointer"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/20 to-stone-950/60 pointer-events-none" />
            </motion.div>

            {/* Showcase Overlay Note */}
            <div className="absolute bottom-8 left-8 z-10 hidden xl:block text-left max-w-sm">
              <span className="text-amber-400 font-mono text-[10px] tracking-widest font-extrabold uppercase bg-stone-900/80 px-3 py-1 rounded-full border border-amber-500/20">RESTORATION HERO</span>
              <h3 className="font-serif text-2xl font-bold text-white mt-3 leading-normal drop-shadow">"Reviving Faded Generations."</h3>
              <p className="text-xs text-stone-300 mt-2 leading-relaxed">Hover or interact with the family portrait background. Watch the nostalgic monochrome pigments instantly adapt into full living family spectrums.</p>
            </div>

            <div className="relative z-10 w-full max-w-md mx-auto px-4 sm:px-6">
              {/* Secure Login form */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full p-6 sm:p-8 md:p-10 bg-white/95 backdrop-blur-md shadow-2xl rounded-3xl space-y-6 font-sans border border-white/60"
              >
                <div className="text-center space-y-2">
                  <span className="text-amber-700 text-[10px] uppercase font-mono font-bold tracking-widest bg-amber-50 px-3 py-1 rounded-full border border-amber-200">PORTAL</span>
                  <h2 className="text-2xl font-serif text-stone-950 font-black">Member Login</h2>
                  <p className="text-stone-500 text-xs">Enter your credentials to access your secure memory vault</p>
                </div>

                {/* Inactivity Logout alert */}
                {inactivityLoggedOut && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-900 text-xs font-semibold leading-relaxed flex items-start gap-2.5 shadow-xs"
                  >
                    <span className="text-base shrink-0 select-none">🛡️</span>
                    <div>
                      <p className="font-bold text-stone-950 text-xs">Secure Session Terminated</p>
                      <p className="text-[11px] font-normal text-stone-600 mt-0.5 leading-relaxed">
                        For your protection, you were logged out automatically after 30 minutes of inactivity. Please sign back in.
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Error alerts banner inside gateway */}
                {errorMsg && (
                  <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-red-950 text-xs font-medium leading-relaxed">
                    🚨 {errorMsg}
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4 text-xs font-sans">
                  {isSignup && (
                    <div>
                      <label className="block text-stone-600 mb-1 font-semibold">Your Full Name</label>
                      <input
                        id="auth-signup-name"
                        type="text"
                        required
                        value={authForm.name}
                        onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                        className="w-full bg-stone-50 border border-stone-200 p-2.5 rounded text-stone-950 outline-none focus:border-amber-600"
                        placeholder="e.g. Aarav Sharma"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-stone-600 mb-1 flex items-center justify-between font-semibold">
                      <span>Email Address</span>
                      {isEmailVerified ? (
                        <span className="text-[9px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          Verified ✓
                        </span>
                      ) : (
                        <span className="text-[9px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-mono">
                          Unverified
                        </span>
                      )}
                    </label>
                    <input
                      id="auth-email-field"
                      type="email"
                      required
                      value={authForm.email}
                      onChange={(e) => {
                        setAuthForm({ ...authForm, email: e.target.value });
                        setIsEmailVerified(false);
                        setVerificationSent(false);
                      }}
                      className="w-full bg-stone-50 border border-stone-200 p-2.5 rounded text-stone-950 focus:outline-none focus:border-amber-500 font-sans"
                      placeholder="e.g. Aarav@relive.club"
                    />

                    {isSignup && (
                      <div className="mt-2 bg-stone-50 p-2.5 rounded border border-stone-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-stone-500">
                            {isEmailVerified 
                              ? "Registered mailbox authenticated successfully." 
                              : "Verification email is required for secure signup."}
                          </span>
                          {!isEmailVerified && (
                            <button
                              id="verify-email-auth-btn"
                              type="button"
                              onClick={handleSendVerificationEmail}
                              disabled={verificationLoading}
                              className="px-2.5 py-1 bg-amber-800 hover:bg-amber-900 text-white font-bold text-[10px] rounded cursor-pointer"
                            >
                              {verificationLoading ? "Sending..." : "Verify Email ✉️"}
                            </button>
                          )}
                        </div>

                        {verificationSent && !isEmailVerified && (
                          <div className="space-y-2 pt-1.5 border-t border-stone-200/60">
                            <p className="text-[10px] text-emerald-800 font-medium leading-normal">
                              ✓ Security pin dispatched. Check your inbox or copy the test pin below!
                            </p>
                            {verificationCode && (
                              <div className="text-[11px] text-stone-700 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20 font-mono flex items-center justify-between gap-1">
                                <span>Test/Simulated Pin:</span>
                                <span className="text-amber-805 font-bold tracking-widest text-xs bg-white px-2 py-0.5 rounded border border-amber-500/20 select-all">{verificationCode}</span>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <input
                                id="auth-verification-code-input"
                                type="text"
                                placeholder="Enter 4-Digit PIN"
                                value={userInputCode}
                                onChange={(e) => setUserInputCode(e.target.value)}
                                className="bg-white border border-stone-300 p-1.5 rounded text-[11px] text-stone-900 font-mono w-28 uppercase text-center"
                              />
                              <button
                                id="confirm-verification-auth-btn"
                                type="button"
                                onClick={handleVerifyCode}
                                className="px-3 py-1 bg-stone-900 hover:bg-stone-800 text-white text-[10px] font-bold rounded cursor-pointer"
                              >
                                Submit Code
                              </button>
                            </div>
                          </div>
                        )}

                        {verificationError && (
                          <p className="text-[10px] text-red-650 font-medium">{verificationError}</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label id="auth-pass-label" className="text-stone-600 font-semibold text-[11px] uppercase tracking-wider">
                        {isSignup ? "Create Secure Password" : "Password"}
                      </label>
                      {authForm.password && (
                        <span className="text-[10px] font-semibold text-stone-400">
                          {authForm.password.length} chars
                        </span>
                      )}
                    </div>
                    
                    <div className="relative">
                      <input
                        id="auth-pass-field"
                        type={showPassword ? "text" : "password"}
                        required
                        value={authForm.password}
                        onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                        className="w-full bg-stone-50 border border-stone-200 p-2.5 pr-10 rounded text-stone-950 focus:outline-none focus:border-amber-500 font-sans"
                        placeholder="••••••••"
                      />
                      <button
                        id="auth-toggle-pass-visibility"
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 select-none cursor-pointer"
                        title={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {isSignup && (
                      <div className="mt-2.5 space-y-2 bg-stone-50 p-2.5 rounded-lg border border-stone-200">
                        {/* Strength Metric / Tier Header */}
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-stone-500 font-medium">Password Strength:</span>
                          <span className={`font-bold uppercase tracking-wider ${getPasswordStrength(authForm.password).textTailwind}`}>
                            {getPasswordStrength(authForm.password).text}
                          </span>
                        </div>

                        {/* Visual Strength Meter Segments */}
                        <div className="flex gap-1 h-1.5 w-full bg-stone-200 rounded-full overflow-hidden">
                          {[1, 2, 3, 4, 5].map((level) => {
                            const currentStrength = getPasswordStrength(authForm.password);
                            const isActive = currentStrength.score >= level;
                            return (
                              <div
                                key={level}
                                className={`h-full flex-1 transition-all duration-300 rounded-full ${
                                  isActive ? currentStrength.color : 'bg-stone-200/60'
                                }`}
                              />
                            );
                          })}
                        </div>

                        {/* Real-time Checklist */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1.5 border-t border-stone-200/55 text-[10px]">
                          {getPasswordStrength(authForm.password).requirements.map((req) => (
                            <div key={req.id} className="flex items-center gap-1.5 leading-tight">
                              {req.met ? (
                                <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                              ) : (
                                <X className="w-3 h-3 text-red-400 shrink-0" />
                              )}
                              <span className={req.met ? "text-stone-800 font-medium" : "text-stone-400"}>
                                {req.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    id="submit-auth-form"
                    type="submit"
                    disabled={isAuthLoading}
                    className={`w-full py-3 bg-stone-900 hover:bg-stone-850 text-white font-bold rounded-lg transition-all ${isAuthLoading ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer animate-none hover:shadow-md'}`}
                  >
                    {isAuthLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" /> Verifying Credentials...
                      </span>
                    ) : isSignup ? 'Register New Heritage Account' : 'Sign In to Account'}
                  </button>
                </form>

                <div className="space-y-3 pt-2">
                  <button
                    id="auth-google-btn"
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="w-full py-2.5 bg-stone-50 border border-stone-200 rounded-lg text-stone-700 font-bold text-xs flex items-center justify-center gap-2.5 hover:bg-stone-100 transition cursor-pointer"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                      <g transform="matrix(1, 0, 0, 1, 0, 0)">
                        <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.57h3.3c1.93,-1.78 3.04,-4.4 3.04,-7.4C21.68,11.75 21.56,11.4 21.35,11.1z" fill="#4285F4" />
                        <path d="M12,20.62c2.43,0 4.47,-0.8 5.96,-2.18l-3.3,-2.57c-0.91,0.61 -2.08,0.98 -3.1,0.98 -2.39,0 -4.41,-1.61 -5.14,-3.78H2.98v2.66C4.47,18.7 7.99,20.62 12,20.62z" fill="#34A853" />
                        <path d="M6.86,13.07C6.67,12.5 6.57,11.89 6.57,11.25s0.1,-1.25 0.29,-1.82V6.77H2.98c-0.63,1.27 -0.98,2.71 -0.98,4.48s0.35,3.21 0.98,4.48l3.88,-2.66z" fill="#FBBC05" />
                        <path d="M12,4.88c1.32,0 2.51,0.45 3.44,1.35l2.58,-2.58C16.46,2.21 14.43,1.38 12,1.38c-4.01,0 -7.53,1.92 -9.02,4.89l3.88,2.66C7.59,6.49 9.61,4.88 12,4.88z" fill="#EA4335" />
                      </g>
                    </svg>
                    {isSignup ? 'Sign up with Google' : 'Sign in with Google'}
                  </button>

                  <div className="flex justify-between text-[11px] text-stone-500">
                    <button
                      id="forgot-password"
                      onClick={() => setIsForgotOpen(true)}
                      className="hover:underline cursor-pointer"
                    >
                      Forgot password passcode?
                    </button>

                    <button
                      id="signup-toggle"
                      onClick={() => setIsSignup(!isSignup)}
                      className="text-amber-800 font-bold hover:underline cursor-pointer"
                    >
                      {isSignup ? 'Already have credentials? Login' : 'Create new account'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        ) : currentUser ? (
          <div>
            {currentUser.role === 'user' && (
              <DashboardUser
                currentUser={currentUser}
                onUpdateUser={handleUpdateUser}
                orders={orders}
                files={files}
                appointments={appointments}
                albums={albums}
                notifications={notifications}
                onAddOrder={handleAddOrder}
                onAddAppointment={handleAddAppointment}
                onAddAlbum={handleAddAlbum}
                onUpdateOrder={handleUpdateOrder}
                onAddNotification={handleAddNotification}
                onAddFile={handleAddFile}
              />
            )}

            {currentUser.role === 'admin' && (
              <DashboardAdmin
                users={users}
                orders={orders}
                appointments={appointments}
                files={files}
                currentUser={currentUser}
                onAddFile={handleAddFile}
                onUpdateOrder={handleUpdateOrder}
                onUpdateAppointment={handleUpdateAppointment}
                onDeleteFile={handleDeleteFile}
                onAddNotification={handleAddNotification}
              />
            )}

            {currentUser.role === 'partner' && (
              <DashboardPartner
                orders={orders}
                onUpdateOrder={handleUpdateOrder}
              />
            )}

            {currentUser.role === 'restorer' && (
              <DashboardRestoration
                orders={orders}
                onUpdateOrder={handleUpdateOrder}
              />
            )}
          </div>
        ) : (
          <LandingPage
            onNavigateToAuth={(role) => {
              setIsAuthMode(true);
              setAuthForm(prev => ({ ...prev, role: role || 'user' }));
            }}
            onQuickBook={() => {
              setIsAuthMode(true);
              setAuthForm(prev => ({ ...prev, role: 'user' }));
              alert("Verify credentials first to configure secure OTP metrics!");
            }}
          />
        )}
      </main>

      {/* Footer (only visible when not logged in to keep the dashboard full-bleed and focused) */}
      {!currentUser && (
        <footer className="bg-stone-900 text-stone-400 py-12 px-6 border-t border-stone-850 mt-16">
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 text-xs sm:text-sm">
            <div className="space-y-4">
              <h4 className="font-serif font-black text-white text-base">ReLive Archive Hub</h4>
              <p className="text-light text-stone-400 leading-normal">
                State-of-the-art memory restoration, secure transport logistics, and joint-family digital heritage vaults. Under museum quality controls.
              </p>
            </div>

            <div className="space-y-2">
              <h5 className="font-bold text-white text-xs uppercase tracking-wider">Restoration services</h5>
              <ul className="space-y-1 text-stone-400">
                <li>• Photographic Color calibration</li>
                <li>• VHS video tracking stabilization</li>
                <li>• Audio tape crackle dampening</li>
                <li>• Ancient glass slide chemical transfer</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h5 className="font-bold text-white text-xs uppercase tracking-wider">Scientific protocols</h5>
              <ul className="space-y-1 text-stone-400">
                <li>• ISO-5 dust-reduction chambers</li>
                <li>• Sealed Faraday magnetic cases</li>
                <li>• GPS logistics track OTP locks</li>
                <li>• Secure cloud version layers</li>
              </ul>
            </div>

            <div className="space-y-4">
              <h5 className="font-bold text-white text-xs uppercase tracking-wider">Preserving Legacies</h5>
              <p className="text-stone-500 font-mono text-[11px]">
                Active servers: Jaipur Core (RJ), New Delhi NCR Node. All rights reserved © 2026 ReLive Club.
              </p>
            </div>
          </div>
        </footer>
      )}

      {/* POPUP: Forgot password simulator */}
      <AnimatePresence>
        {isForgotOpen && (
          <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white max-w-sm w-full rounded-2xl overflow-hidden shadow-2xl p-6 text-xs space-y-4 border border-stone-200"
            >
              {forgotPasswordStep === 1 && (
                <div className="text-center space-y-4">
                  <div className="w-12 h-12 bg-amber-100 text-amber-805 rounded-full flex items-center justify-center mx-auto text-xl shadow-inner">
                    <Key className="w-6 h-6" />
                  </div>

                  <div>
                    <h3 className="font-serif font-bold text-sm text-stone-950">Password Recovery Key</h3>
                    <p className="text-stone-500 text-[10px] mt-1">Provide registered email address to receive secure cryptographic restore signals.</p>
                  </div>

                  <form onSubmit={triggerPasswordReset} className="space-y-3">
                    <input
                      id="forgot-email-input"
                      type="email"
                      required
                      value={forgotPasswordEmail}
                      onChange={(e) => setForgotPasswordEmail(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-300 p-2.5 rounded text-center focus:outline-none focus:border-stone-500 font-medium text-stone-800"
                      placeholder="name@email.com"
                    />

                    <div className="flex gap-2">
                      <button
                        id="submit-forgot-pass"
                        type="submit"
                        disabled={isAuthLoading}
                        className="flex-1 py-2.5 bg-stone-900 text-white rounded-lg font-bold hover:bg-stone-850 cursor-pointer disabled:bg-stone-400 transition-all text-[11px]"
                      >
                        {isAuthLoading ? "Processing..." : "Confirm Dispatch"}
                      </button>
                      <button
                        id="cancel-forgot-pass"
                        type="button"
                        onClick={() => {
                          setIsForgotOpen(false);
                          setForgotPasswordEmail('');
                          setForgotPasswordStep(1);
                        }}
                        className="px-4 py-2.5 bg-stone-100 text-stone-600 rounded-lg font-medium hover:bg-stone-200"
                      >
                        Close
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {forgotPasswordStep === 2 && (
                <div className="text-center space-y-4 text-stone-900">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto text-xl shadow-inner">
                    <ShieldCheck className="w-6 h-6" />
                  </div>

                  <div>
                    <h3 className="font-serif font-bold text-sm text-stone-950">Cryptographic Key Dispatched</h3>
                    <p className="text-stone-500 text-[10px] mt-1">A secure encrypted restore link has been dispatched for verification.</p>
                  </div>

                  <div className="bg-stone-50 p-3 rounded-lg border border-stone-200 text-left space-y-2">
                    <span className="text-[9px] font-bold text-stone-500 uppercase tracking-wider block">Generated Cryptographic Reset Link:</span>
                    <div className="font-mono text-[9px] bg-white p-2 rounded border border-stone-250 select-all break-all text-stone-850 leading-normal max-h-20 overflow-y-auto">
                      {generatedResetToken}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(generatedResetToken);
                          alert("Link successfully copied to clipboard.");
                        }}
                        className="text-[10px] text-stone-700 bg-white border border-stone-250 py-1 px-2.5 rounded hover:bg-stone-50 font-bold"
                      >
                        Copy Link
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => handleVerifyResetToken(generatedResetToken)}
                      className="w-full py-2.5 bg-amber-550 hover:bg-amber-605 bg-amber-500 hover:bg-amber-600 font-bold rounded-lg text-stone-950 flex items-center justify-center gap-1.5 transition-all text-[11px] cursor-pointer shadow-sm shadow-amber-550/10"
                    >
                      🔗 Click Simulated Reset Link
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotOpen(false);
                        setForgotPasswordEmail('');
                        setForgotPasswordStep(1);
                      }}
                      className="w-full py-2 bg-stone-100 text-stone-600 rounded-lg font-bold hover:bg-stone-200 text-[11px]"
                    >
                      Close Recovery Manager
                    </button>
                  </div>
                </div>
              )}

              {forgotPasswordStep === 3 && (
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-amber-100 text-amber-805 rounded-full flex items-center justify-center mx-auto text-xl shadow-inner mb-3">
                      <Lock className="w-6 h-6" />
                    </div>
                    <h3 className="font-serif font-bold text-sm text-stone-950">Replace Member Passcode</h3>
                    <p className="text-stone-500 text-[10px] mt-1 break-all bg-amber-500/10 text-amber-800 border border-amber-500/20 py-1 px-2 rounded-md font-mono inline-block">
                      Secure session: {forgotPasswordEmail}
                    </p>
                  </div>

                  <form onSubmit={handleSaveNewPassword} className="space-y-3">
                    {/* New Password field */}
                    <div className="space-y-1 relative">
                      <label className="block text-stone-500 font-medium text-[10px] text-left">New Security Passcode</label>
                      <div className="relative">
                        <input
                          id="reset-new-pass"
                          type={isResetShowPassword ? "text" : "password"}
                          required
                          value={resetNewPassword}
                          onChange={(e) => setResetNewPassword(e.target.value)}
                          className="w-full bg-stone-50 border border-stone-300 p-2 rounded text-left pr-8 focus:outline-none focus:border-stone-500 text-stone-800"
                          placeholder="••••••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setIsResetShowPassword(!isResetShowPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                        >
                          {isResetShowPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Commit verification field */}
                    <div className="space-y-1 relative">
                      <label className="block text-stone-500 font-medium text-[10px] text-left">Confirm Passcode</label>
                      <div className="relative">
                        <input
                          id="reset-confirm-pass"
                          type={isResetShowConfirmPassword ? "text" : "password"}
                          required
                          value={resetConfirmPassword}
                          onChange={(e) => setResetConfirmPassword(e.target.value)}
                          className="w-full bg-stone-50 border border-stone-300 p-2 rounded text-left pr-8 focus:outline-none focus:border-stone-500 text-stone-800"
                          placeholder="••••••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setIsResetShowConfirmPassword(!isResetShowConfirmPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                        >
                          {isResetShowConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Secure password strength checklist */}
                    <div className="space-y-2 bg-stone-50 p-2.5 rounded-lg border border-stone-200">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-stone-500 font-medium">Password Strength:</span>
                        <span className={`font-bold uppercase tracking-wider ${getPasswordStrength(resetNewPassword).textTailwind}`}>
                          {getPasswordStrength(resetNewPassword).text}
                        </span>
                      </div>

                      {/* Visual Strength Meter Segments */}
                      <div className="flex gap-1 h-1.5 w-full bg-stone-200 rounded-full overflow-hidden">
                        {[1, 2, 3, 4, 5].map((level) => {
                          const currentStrength = getPasswordStrength(resetNewPassword);
                          const isActive = currentStrength.score >= level;
                          return (
                            <div
                              key={level}
                              className={`h-full flex-1 transition-all duration-300 rounded-full ${
                                isActive ? currentStrength.color : 'bg-stone-200/60'
                              }`}
                            />
                          );
                        })}
                      </div>

                      {/* Real-time Checklist */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1.5 border-t border-stone-200/55 text-[9px] text-left">
                        {getPasswordStrength(resetNewPassword).requirements.map((req) => (
                          <div key={req.id} className="flex items-center gap-1 leading-tight">
                            {req.met ? (
                              <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                            ) : (
                              <X className="w-3 h-3 text-red-400 shrink-0" />
                            )}
                            <span className={req.met ? "text-stone-850 font-medium" : "text-stone-400"}>
                              {req.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1 select-none">
                      <button
                        type="submit"
                        disabled={isAuthLoading}
                        className="flex-1 py-2.5 bg-stone-900 text-white rounded-lg font-bold hover:bg-stone-850 cursor-pointer disabled:bg-stone-400 transition-all text-[11px]"
                      >
                        {isAuthLoading ? "Hashing passcode..." : "🔐 Securely Save Passcode"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setForgotPasswordStep(2);
                        }}
                        className="px-3.5 py-2.5 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 font-semibold"
                      >
                        Back
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {forgotPasswordStep === 4 && (
                <div className="text-center space-y-4 text-stone-900">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto text-xl shadow-inner animate-bounce">
                    <ShieldCheck className="w-6 h-6" />
                  </div>

                  <div>
                    <h3 className="font-serif font-bold text-sm text-stone-950">Identity Verified & Sealed</h3>
                    <p className="text-stone-500 text-[10px] mt-1 leading-normal">
                      Your new passcode has been cryptographically-hashed and secured inside local registries successfully.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotOpen(false);
                      setForgotPasswordEmail('');
                      setForgotPasswordStep(1);
                    }}
                    className="w-full py-2.5 bg-stone-950 hover:bg-stone-850 text-white font-bold rounded-lg text-[11px] cursor-pointer block border border-transparent shadow-md"
                  >
                    Done - Return to Login
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FIRESTORE ACTIVE CONNECTION TROUBLESHOOTING DIAGNOSTIC GUIDE */}
      <AnimatePresence>
        {showFirestoreGuide && (
          <div className="fixed inset-0 bg-stone-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              className="bg-white border border-stone-200 max-w-lg w-full rounded-3xl overflow-hidden shadow-2xl p-7 relative font-sans text-stone-900"
            >
              {/* Decorative accent glow */}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-40 bg-amber-100/40 rounded-full blur-3xl -z-10" />

              {/* Close Button */}
              <button
                onClick={() => setShowFirestoreGuide(false)}
                className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 font-bold p-1 cursor-pointer text-lg"
              >
                ✕
              </button>

              <h3 className="font-serif text-lg font-bold text-stone-950 tracking-tight text-center flex items-center justify-center gap-1.5">
                💼 Firebase Cloud Database Sync Diagnostics
              </h3>
              
              <p className="text-stone-600 text-xs mt-3 leading-relaxed text-center">
                Your application failed to establish a direct connection with Google Cloud Firestore. This happens when Firestore has not been created or initialization has not finished inside your Firebase Console for project ID <code className="bg-stone-100 px-1.5 py-0.5 rounded text-stone-750 font-mono text-[10px]">abstract-phalanx-lr5vm</code>.
              </p>

              {/* Step-by-Step Instructions */}
              <div className="mt-4 bg-stone-50 border border-stone-200 rounded-2xl p-4.5 space-y-3 text-left leading-normal">
                <span className="text-[10px] uppercase font-mono font-bold text-stone-500 tracking-wider block">How to resolve and activate real-time syncing:</span>
                
                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-stone-200 border border-stone-300 text-stone-800 flex items-center justify-center font-mono font-bold text-[9px] shrink-0 mt-0.5">1</span>
                  <p className="text-xs text-stone-600 leading-normal">
                    Open your project's Firestore database page in the Firebase Console: <a href="https://console.firebase.google.com/project/abstract-phalanx-lr5vm/firestore" target="_blank" rel="noopener noreferrer" className="text-amber-800 hover:underline font-bold inline-flex items-center gap-0.5">console.firebase.google.com ➔</a>
                  </p>
                </div>

                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-stone-200 border border-stone-300 text-stone-800 flex items-center justify-center font-mono font-bold text-[9px] shrink-0 mt-0.5">2</span>
                  <p className="text-xs text-stone-600 leading-normal">
                    Click the <strong className="text-stone-800">"Create Database"</strong> button and select "Start in Test Mode" or "Start in Production Mode."
                  </p>
                </div>

                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-stone-200 border border-stone-300 text-stone-800 flex items-center justify-center font-mono font-bold text-[9px] shrink-0 mt-0.5">3</span>
                  <p className="text-xs text-stone-600 leading-normal">
                    Select a Cloud region for database storage (e.g. <code className="bg-stone-100 px-1 rounded font-mono">asia-southeast1</code> or <code className="bg-stone-100 px-1 rounded font-mono">us-central</code>) and click Enable.
                  </p>
                </div>

                <div className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-stone-200 border border-stone-300 text-stone-800 flex items-center justify-center font-mono font-bold text-[9px] shrink-0 mt-0.5">4</span>
                  <p className="text-xs text-stone-600 leading-normal">
                    Refresh this page. Once provisioned on Firebase, memory spools, files, and parcel logistics data will sync and persist instantly across all dashboards!
                  </p>
                </div>
              </div>

              {/* Status Section */}
              <div className="mt-5 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                <p className="text-[11px] text-emerald-800 leading-relaxed font-semibold">
                  💡 <strong>Seamless Sandbox Active:</strong> ReLive has automatically enabled local sandbox simulation. All orders, photo files, restoration states, pickup schedulers, and alerts can be fully tested and modified inside your browser right now!
                </p>
              </div>

              {/* Close Action */}
              <button
                onClick={() => setShowFirestoreGuide(false)}
                className="mt-5 w-full py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Continue in Offline Sandbox Simulation
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
