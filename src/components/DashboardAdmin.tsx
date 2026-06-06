import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Users, ShoppingBag, Truck, IndianRupee, Search, 
  MapPin, Check, Plus, Trash2, Download, AlertCircle, FileUp, 
  Sparkles, Calendar, ClipboardList, TrendingUp, ShieldAlert, BadgeInfo
} from 'lucide-react';
import { FileItem, Order, Appointment, AppUser } from '../types';

interface DashboardAdminProps {
  users: AppUser[];
  orders: Order[];
  appointments: Appointment[];
  files: FileItem[];
  currentUser: AppUser | null;
  onAddFile: (file: FileItem) => void;
  onUpdateOrder: (order: Order) => void;
  onUpdateAppointment: (appt: Appointment) => void;
  onDeleteFile: (id: string) => void;
  onAddNotification?: (notif: any) => void;
}

export default function DashboardAdmin({
  users,
  orders,
  appointments,
  files,
  currentUser,
  onAddFile,
  onUpdateOrder,
  onUpdateAppointment,
  onDeleteFile,
  onAddNotification
}: DashboardAdminProps) {
  // Tabs: 'analytics', 'customers', 'appointments', 'operations', 'upload_center', 'fastapi_console'
  const [activeTab, setActiveTab] = useState<'analytics' | 'customers' | 'appointments' | 'operations' | 'upload_center' | 'fastapi_console'>('analytics');
  
  // Interactive FastAPI Playground States
  const [fastApiTokenPreset, setFastApiTokenPreset] = useState<'guest' | 'user' | 'admin' | 'custom'>('guest');
  const [fastApiCustomToken, setFastApiCustomToken] = useState('');
  const [rateLimitState, setRateLimitState] = useState<any>(null);
  
  const [optTargetSize, setOptTargetSize] = useState('original-quality');
  const [optNoiseFilter, setOptNoiseFilter] = useState(true);
  const [optColorPrecision, setOptColorPrecision] = useState('16-bit-heritage');
  const [optFilename, setOptFilename] = useState('heritage_polaroid_1974.jpg');

  const [customSyncCollection, setCustomSyncCollection] = useState('notifications');
  const [customSyncDocId, setCustomSyncDocId] = useState('admin_dashboard_sync_test');
  const [customSyncData, setCustomSyncData] = useState('{\n  "title": "FastAPI Console Sync Test",\n  "message": "Validated from custom React testing interface",\n  "type": "general",\n  "isRead": false\n}');

  const [fastApiResult, setFastApiResult] = useState<string>('');
  const [fastApiHeaders, setFastApiHeaders] = useState<string>('');
  const [isLoadingApi, setIsLoadingApi] = useState(false);

  const getEffectiveToken = () => {
    if (fastApiTokenPreset === 'guest') return 'guest';
    if (fastApiTokenPreset === 'user') return 'user-mock-vintage';
    if (fastApiTokenPreset === 'admin') return 'admin-supersecret-token';
    return fastApiCustomToken;
  };

  const loadRateLimitStatus = async () => {
    try {
      const response = await fetch('/api/fastapi/rate-limit-status');
      const data = await response.json();
      setRateLimitState(data);
    } catch (e) {
      console.warn("Could not load rate limit status:", e);
    }
  };

  React.useEffect(() => {
    if (activeTab === 'fastapi_console') {
      loadRateLimitStatus();
    }
  }, [activeTab]);

  const runApiTest = async (method: string, path: string, payload?: any) => {
    setIsLoadingApi(true);
    setFastApiResult('');
    setFastApiHeaders('');
    const start = performance.now();
    const token = getEffectiveToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (token && token !== 'guest') {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-User-Role'] = token === 'admin-supersecret-token' ? 'admin' : 'user';
      headers['X-User-Email'] = token === 'admin-supersecret-token' ? 'itzmebalustrade@gmail.com' : 'explorer@relive.co';
    }

    try {
      const res = await fetch(path, {
        method,
        headers,
        body: payload ? JSON.stringify(payload) : undefined
      });
      const end = performance.now();
      const text = await res.text();
      
      let parsedBody = text;
      try {
        parsedBody = JSON.stringify(JSON.parse(text), null, 2);
      } catch (err) {}

      let headerStr = `Status: ${res.status} ${res.statusText}\n`;
      headerStr += `Roundtrip Time: ${(end - start).toFixed(1)}ms\n`;
      res.headers.forEach((v, k) => {
        if (k.toLowerCase().startsWith('x-') || k.toLowerCase() === 'content-type') {
          headerStr += `${k}: ${v}\n`;
        }
      });

      setFastApiHeaders(headerStr);
      setFastApiResult(parsedBody);
      loadRateLimitStatus();
    } catch (err: any) {
      setFastApiHeaders("CONNECTION FAILURE");
      setFastApiResult(err.message || String(err));
    } finally {
      setIsLoadingApi(false);
    }
  };
  
  // Filters & Search
  const [custSearch, setCustSearch] = useState('');
  const [activeCustIdForHistory, setActiveCustIdForHistory] = useState<string | null>(null);

  // Upload state
  const [uploadState, setUploadState] = useState({
    name: '',
    category: 'heritage' as 'wedding' | 'childhood' | 'heritage' | 'general',
    notes: 'Neural face synthesis calibrated at pigment restoration density 4. Super resolution x4.',
    originalUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&q=80&sepia=100',
    restoredUrl: '',
    resolution: '3840 x 2160',
    fileSize: '0.0 MB',
    targetUserId: 'user-01',
    s3Bucket: 'relive-vault-oxford',
    s3Key: ''
  });

  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Real S3 File States
  const [restoredFile, setRestoredFile] = useState<File | null>(null);
  const [restoredPreview, setRestoredPreview] = useState<string>('');
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [originalPreview, setOriginalPreview] = useState<string>('');
  const [isDragOverRestored, setIsDragOverRestored] = useState(false);
  const [isDragOverOriginal, setIsDragOverOriginal] = useState(false);
  const [uploadLogs, setUploadLogs] = useState<string[]>([]);

  // Courier Assignment Suggestion state
  const [selectedApptToAssign, setSelectedApptToAssign] = useState<Appointment | null>(null);

  // Auto-initialize first user ID and bucket settings
  React.useEffect(() => {
    if (users && users.length > 0 && (uploadState.targetUserId === 'user-01' || !uploadState.targetUserId)) {
      const firstUser = users[0];
      setUploadState(prev => ({
        ...prev,
        targetUserId: firstUser.uid,
        s3Key: `users/${firstUser.uid}/${prev.name || 'document_restored.png'}`
      }));
    }
  }, [users]);

  // Convert File to Base64 helper
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string || '');
      reader.onerror = error => reject(error);
    });
  };

  const handleRestoredFileSelection = (file: File) => {
    setRestoredFile(file);
    const sizeStr = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    
    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setRestoredPreview(previewUrl);

    setUploadState(prev => ({
      ...prev,
      name: file.name,
      fileSize: sizeStr,
      s3Key: `users/${prev.targetUserId}/${file.name.replace(/\s+/g, '_')}`
    }));
  };

  const handleOriginalFileSelection = (file: File) => {
    setOriginalFile(file);
    
    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setOriginalPreview(previewUrl);
  };

  const handleRealS3Upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoredFile) {
      alert("Please choose or drag-and-drop the Restored Clear Photograph first!");
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);
    setUploadLogs([
      "Initiating secure S3 transmission pipeline...",
      "Preparing network connection parameters..."
    ]);

    try {
      // 1. Read Restored File
      setUploadLogs(prev => [...prev, `Converting "${restoredFile.name}" into raw base64 stream...`]);
      const restoredB64 = await fileToBase64(restoredFile);
      setUploadProgress(25);

      // 2. Read Original File if present
      let originalB64 = "";
      if (originalFile) {
        setUploadLogs(prev => [...prev, `Converting damaged original "${originalFile.name}" into base64...`]);
        originalB64 = await fileToBase64(originalFile);
      }
      setUploadProgress(40);

      // 3. Upload Restored colorized to AWS S3
      setUploadLogs(prev => [...prev, `[S3] Uploading Restored Colorized scan directly to secure S3 bucket: "${uploadState.s3Bucket}"...`]);
      const restoredRes = await fetch('/api/upload-s3', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser?.uid || 'guest'}`,
          'X-User-Email': currentUser?.email || 'itzmebalustrade@gmail.com',
          'X-User-Role': currentUser?.role || 'admin'
        },
        body: JSON.stringify({
          fileBase64: restoredB64,
          fileName: restoredFile.name,
          fileType: restoredFile.type,
          userId: uploadState.targetUserId
        })
      });

      if (!restoredRes.ok) {
        const errorData = await restoredRes.json();
        throw new Error(errorData.error || errorData.detailedError || "S3 upload request refused by server.");
      }

      const restoredS3Info = await restoredRes.json();
      setUploadProgress(70);
      setUploadLogs(prev => [...prev, `✓ [S3 SUCCESS] Restored output saved to S3. URL: ${restoredS3Info.s3Url}`]);

      // 4. Upload Original sepia to S3 if attached
      let finalOriginalUrl = uploadState.originalUrl;
      if (originalFile && originalB64) {
        setUploadLogs(prev => [...prev, `[S3] Uploading Original raw file directly to secure S3 bucket...`]);
        const originalRes = await fetch('/api/upload-s3', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentUser?.uid || 'guest'}`,
            'X-User-Email': currentUser?.email || 'itzmebalustrade@gmail.com',
            'X-User-Role': currentUser?.role || 'admin'
          },
          body: JSON.stringify({
            fileBase64: originalB64,
            fileName: originalFile.name,
            fileType: originalFile.type,
            userId: uploadState.targetUserId
          })
        });

        if (originalRes.ok) {
          const originalS3Info = await originalRes.json();
          finalOriginalUrl = originalS3Info.s3Url;
          setUploadLogs(prev => [...prev, `✓ [S3 SUCCESS] Raw original file saved to S3.`]);
        } else {
          setUploadLogs(prev => [...prev, "⚠ [S3 WARNING] Original file upload failed, using Unsplash sample fallback for original view."]);
        }
      } else {
        setUploadLogs(prev => [...prev, "No local original file provided. Applying Unsplash placeholder for original view."]);
      }
      setUploadProgress(90);

      // 5. Complete state: create FileItem with secure S3 storage configuration
      const associatedOrder = orders.find(o => o.userId === uploadState.targetUserId && o.deliveryStatus !== 'delivered');
      const orderIdToUse = associatedOrder?.id || `ord-manual-${Date.now().toString().slice(-4)}`;

      const newFile: FileItem = {
        id: `file-${Date.now()}`,
        name: restoredFile.name,
        type: 'image',
        category: uploadState.category,
        originalUrl: finalOriginalUrl,
        restoredUrl: restoredS3Info.s3Url,
        thumbnailUrl: restoredS3Info.s3Url.includes('unsplash.com') 
          ? restoredS3Info.s3Url.replace(/w=\d+/, 'w=300').replace(/q=\d+/, 'q=80') 
          : restoredS3Info.s3Url,
        createdAt: new Date().toISOString(),
        aiEnhancementLog: [
          'Archival flatbed scanner engaged at 3600 DPI.',
          'De-corroding algorithm completed: mold stains extracted.',
          'Original skin balance optimized with Jaipur historical palettes.',
          'Amazon S3 high-security bucket replication completed.'
        ],
        restorationNotes: uploadState.notes,
        resolution: uploadState.resolution || '3840 x 2160',
        fileSize: uploadState.fileSize,
        dateAdded: new Date().toISOString().split('T')[0],
        userId: uploadState.targetUserId,
        s3Url: `s3://${uploadState.s3Bucket}/${restoredS3Info.key}`,
        uploadedToS3: true,
        previewUrl: `https://relive-images-processed.s3.us-east-1.amazonaws.com/processed-${restoredFile.name.replace(/\s+/g, '_')}`,
        isLocked: true, // Needs payment to release
        orderId: orderIdToUse
      };

      onAddFile(newFile);

      // 6. Set associated order status and notify user
      if (associatedOrder) {
        const calculatedPrice = associatedOrder.priceAmount || (associatedOrder.itemCount * 399);
        onUpdateOrder({
          ...associatedOrder,
          deliveryStatus: 'completed',
          restorationStage: 'uploaded',
          isPaid: false,
          priceAmount: calculatedPrice
        });

        if (onAddNotification) {
          onAddNotification({
            id: `notif-${Date.now()}`,
            userId: uploadState.targetUserId,
            title: "Your Heritage Restoration Order is Ready! 📦",
            message: `Archival scanning and colorization are complete for your ${associatedOrder.itemCount} items of ${associatedOrder.serviceType}. Please pay ₹${calculatedPrice} under your dashboard to unlock access.`,
            type: 'order',
            date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isRead: false
          });
        }
      } else {
        if (onAddNotification) {
          onAddNotification({
            id: `notif-${Date.now()}`,
            userId: uploadState.targetUserId,
            title: "New Heritage Asset Restored! Custom S3 Upload 🔔",
            message: `Our Jaipur laboratory has uploaded a newly restored asset "${restoredFile.name}" directly to your profile. Checkout now to link it!`,
            type: 'order',
            date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isRead: false
          });
        }
      }

      setUploadProgress(100);
      setUploadLogs(prev => [...prev, "✓ All upload sequences complete! Target family database synced."]);
      
      // Cleanup states
      setRestoredFile(null);
      setRestoredPreview('');
      setOriginalFile(null);
      setOriginalPreview('');
      setIsUploading(false);
      
      // Keep logs visible briefly before zeroing
      setTimeout(() => {
        setUploadProgress(0);
      }, 5000);

      alert(`Success! Photo "${restoredFile.name}" has been successfully uploaded to the S3 bucket and saved to the customer's vault!`);

    } catch (error: any) {
      console.error("[S3 Upload Fail]", error);
      setUploadLogs(prev => [...prev, `❌ ERROR: ${error.message || String(error)}`]);
      setIsUploading(false);
      alert(`Upload failed: ${error.message || String(error)}`);
    }
  };

  const assignCourierPartner = (appt: Appointment, partnerId: string) => {
    // 1. Assign Appointment state to completed/assigned
    onUpdateAppointment({
      ...appt,
      status: 'assigned'
    });

    // 2. Discover associated order and update state
    const associatedOrder = orders.find(o => o.userId === appt.userId && o.deliveryStatus === 'appointment_created');
    if (associatedOrder) {
      onUpdateOrder({
        ...associatedOrder,
        assignedPartnerId: partnerId,
        deliveryStatus: 'partner_assigned',
        eta: 'Tomorrow Morning'
      });
    }

    setSelectedApptToAssign(null);
    alert(`Success! Scheduled partner dispatched. High-impact waterproofing container logged.`);
  };

  // Custom high-contrast responsive SVG Path coordinates generator for trend lines
  // Data: revenue across some seasons (Mar-₹40k, Apr-₹65k, May-₹54k, Jun-₹98k, Jul-₹120k)
  const revenuePoints = "30,130 110,95 190,110 270,55 350,30 430,20";

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Overview stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Verified Dynasties', val: users.filter(u => u.role === 'user').length, icon: Users, color: 'text-amber-600 bg-amber-50' },
          { label: 'Active Channels', val: orders.filter(o => o.deliveryStatus !== 'delivered').length, icon: ShoppingBag, color: 'text-orange-600 bg-orange-50' },
          { label: 'Dispatch Couriers', val: 2, icon: Truck, color: 'text-blue-600 bg-blue-50' },
          { label: 'Preservation Revenue', val: '₹144.5K', icon: IndianRupee, color: 'text-green-600 bg-green-50' }
        ].map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="bg-white border border-stone-200 p-5 rounded-2xl shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] text-stone-500 uppercase tracking-widest font-semibold">{stat.label}</p>
                <p className="text-xl sm:text-2xl font-serif font-black text-stone-900">{stat.val}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl ${stat.color} flex items-center justify-center shrink-0`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto gap-2 pb-2 border-b border-stone-200">
        {[
          { id: 'analytics', label: 'Operations & Charts', icon: TrendingUp },
          { id: 'appointments', label: 'Doorstep Courier Routing', icon: Calendar },
          { id: 'customers', label: 'Customer Preserves', icon: Users },
          { id: 'operations', label: 'Lab Queues monitor', icon: ClipboardList },
          { id: 'upload_center', label: 'Upload Center Integration', icon: FileUp },
          { id: 'fastapi_console', label: 'FastAPI Dev Console', icon: Sparkles }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              id={`admin-tab-btn-${tab.id}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-lg flex items-center gap-2 font-medium text-xs sm:text-sm whitespace-nowrap transition-all cursor-pointer ${
                isActive ? 'bg-stone-900 text-white shadow-md' : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENTS */}
      <div className="min-h-[400px]">
        {/* ANALYTICS & CHARTS */}
        {activeTab === 'analytics' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Custom SVG Trend graph */}
            <div className="lg:col-span-8 bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
              <div>
                <h3 className="font-serif font-medium text-stone-900 text-lg">Year-to-date Preservation Profit & Trends</h3>
                <p className="text-stone-500 text-xs">Dynamic high-fidelity operational volume logs (Jaipur central database)</p>
              </div>

              {/* Responsive SVG Chart */}
              <div className="relative h-64 w-full bg-stone-50 border border-stone-150 rounded-xl p-4 flex items-end">
                <svg className="absolute inset-0 w-full h-full p-6" viewBox="0 0 500 150" preserveAspectRatio="none">
                  {/* Grid Lines */}
                  <line x1="0" y1="120" x2="500" y2="120" stroke="#f1f3f5" strokeWidth="2" />
                  <line x1="0" y1="80" x2="500" y2="80" stroke="#f1f3f5" strokeWidth="2" />
                  <line x1="0" y1="40" x2="500" y2="40" stroke="#f1f3f5" strokeWidth="2" />
                  
                  {/* Area fill */}
                  <path
                    d={`M 30,150 L ${revenuePoints} L 430,150 Z`}
                    fill="rgba(245, 158, 11, 0.08)"
                    stroke="none"
                  />
                  {/* Plot line */}
                  <polyline
                    fill="none"
                    stroke="url(#grad)"
                    strokeWidth="3.5"
                    points={revenuePoints}
                    strokeLinecap="round"
                  />
                  
                  {/* High contrast markers */}
                  <circle cx="30" cy="130" r="5" fill="#f59e0b" stroke="#fff" strokeWidth="2" />
                  <circle cx="110" cy="95" r="5" fill="#f59e0b" stroke="#fff" strokeWidth="2" />
                  <circle cx="190" cy="110" r="5" fill="#f59e0b" stroke="#fff" strokeWidth="2" />
                  <circle cx="270" cy="55" r="5" fill="#f59e0b" stroke="#fff" strokeWidth="2" />
                  <circle cx="350" cy="30" r="5" fill="#f59e0b" stroke="#fff" strokeWidth="2" />
                  <circle cx="430" cy="20" r="6" fill="#ef4444" stroke="#fff" strokeWidth="2" />

                  {/* Gradient definition */}
                  <defs>
                    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="150%">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#ef4444" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* X Axis Labels */}
                <div className="absolute inset-x-0 bottom-1 flex justify-between px-6 text-[9px] font-mono font-bold text-stone-400">
                  <span>MAR (₹40K)</span>
                  <span>APR (₹65K)</span>
                  <span>MAY (₹54K)</span>
                  <span>JUN (₹98K)</span>
                  <span>JUL (₹120K)</span>
                  <span className="text-red-500 animate-pulse">LIVE PROJECTED (₹145K)</span>
                </div>
              </div>

              <div className="flex gap-4 p-4 bg-amber-50 rounded-xl border border-amber-200/50 text-xs text-amber-800">
                <TrendingUp className="w-5 h-5 shrink-0" />
                <p>
                  <strong>Logistical Forecast:</strong> Faded colorization inquiries are elevating inside northern regions (Rajasthan & New Delhi NCR). We suggest provisioning silica containers for partners ahead of the monsoon months.
                </p>
              </div>
            </div>

            {/* Smart system alert widgets */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-stone-900 text-white rounded-3xl p-6 border border-stone-800 space-y-4">
                <div className="flex items-center gap-2 text-amber-400">
                  <ShieldAlert className="w-5 h-5" />
                  <h4 className="font-serif text-sm sm:text-base font-bold">Smart Assignment core</h4>
                </div>
                <p className="text-xs text-stone-300 leading-relaxed">
                  Our system crawls active partner ratings, vehicle efficiency parameters, and distance constraints to suggest optimum couriers.
                </p>
                <div className="bg-stone-950 p-3.5 rounded-xl border border-stone-800 text-[11px] space-y-2">
                  <p className="font-bold text-stone-300">Suggested Jaipur Partners:</p>
                  <p className="text-stone-400">1st: <strong>Kartik Yadav</strong> (Hero Electric scooter, 4.9 rating, current load: lightweight)</p>
                  <p className="text-stone-400">2nd: <strong>Vikram Choudhary</strong> (Bajaj motorcycle, 4.8 rating, current load: active on Delhi outskirts)</p>
                </div>
              </div>


            </div>
          </div>
        )}

        {/* DOORSTEP COURIER ROUTING / APPOINTMENTS */}
        {activeTab === 'appointments' && (
          <div className="space-y-6">
            <h3 className="font-serif text-lg text-stone-900">Doorstep Courier Scheduling Console</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Appointments list */}
              <div className="space-y-4 bg-white border border-stone-200 p-6 rounded-2xl max-h-[450px] overflow-y-auto">
                <h4 className="font-serif font-medium text-stone-950 text-sm pb-2 border-b">Inbound Pickup Requests</h4>
                {appointments.map((appt) => (
                  <div key={appt.id} className="p-4 bg-stone-50 border rounded-xl space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-stone-900">ID #{appt.id} • {appt.customerName}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] ${appt.status === 'assigned' ? 'bg-green-150 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                        {appt.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-stone-500 font-mono text-[10px]">Zone: {appt.city} • Slot: {appt.timeSlot}</p>
                    <p className="text-stone-600 italic">" {appt.notes} "</p>

                    {appt.status === 'pending' && (
                      <button
                        id={`admin-appt-select-assign-${appt.id}`}
                        onClick={() => setSelectedApptToAssign(appt)}
                        className="mt-3 px-3 py-1.5 bg-stone-950 hover:bg-stone-850 text-white rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        🚀 Dispatch Partner Router
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Assignment console */}
              <div className="bg-gradient-to-b from-stone-900 to-stone-950 text-stone-150 p-6 rounded-2xl border border-stone-800">
                {selectedApptToAssign ? (
                  <div className="space-y-6 text-xs">
                    <div className="space-y-2">
                      <span className="text-amber-400 font-bold uppercase tracking-wider text-[10px]">ROUTING SYSTEM TARGET DETECTED</span>
                      <h4 className="text-white font-serif text-lg">Dispatching Order #{selectedApptToAssign.id}</h4>
                      <p className="text-stone-300">Customer: {selectedApptToAssign.customerName} • {selectedApptToAssign.address}</p>
                    </div>

                    <div className="bg-stone-900 p-3.5 rounded-xl border border-stone-850 space-y-3">
                      <span className="text-[10px] uppercase font-bold text-amber-400 block font-mono">Suggested Logistical Partners:</span>
                      
                      <div className="space-y-3">
                        {/* Partner Delhi / Jaipur seed profiles */}
                        <div className="flex items-center justify-between bg-stone-950 p-3 rounded-lg border border-stone-800">
                          <div>
                            <p className="font-bold text-white">Kartik Yadav (Hero Electric, 4.9 rating)</p>
                            <p className="text-[10px] text-stone-400">Zone Match: Jaipur • Load: Lightweight</p>
                          </div>
                          <button
                            id="admin-assign-btn-kartik"
                            onClick={() => assignCourierPartner(selectedApptToAssign, 'partner-delhi')}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold rounded cursor-pointer"
                          >
                            Assign Kartik
                          </button>
                        </div>

                        <div className="flex items-center justify-between bg-stone-950 p-3 rounded-lg border border-stone-800">
                          <div>
                            <p className="font-bold text-white">Vikram Choudhary (Motorcycle, 4.8 rating)</p>
                            <p className="text-[10px] text-stone-400">Zone Match: Jaipur Outskirts • Load: Available</p>
                          </div>
                          <button
                            id="admin-assign-btn-vikram"
                            onClick={() => assignCourierPartner(selectedApptToAssign, 'partner-jaipur')}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold rounded cursor-pointer"
                          >
                            Assign Vikram
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col justify-center items-center text-center p-12 text-stone-400 space-y-3">
                    <BadgeInfo className="w-10 h-10 text-stone-600 animate-bounce" />
                    <p className="text-sm">Click "Dispatch Partner Router" on any pending request to configure courier assignment routing properties.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CUSTOMERS DIRECTORY */}
        {activeTab === 'customers' && (
          <div className="space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                id="cust-search-field"
                type="text"
                value={custSearch}
                onChange={(e) => setCustSearch(e.target.value)}
                className="pl-9 pr-4 py-2 w-full bg-white border border-stone-300 text-stone-900 rounded-lg text-xs focus:outline-none focus:border-amber-500"
                placeholder="Search registered families..."
              />
            </div>

            <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs bg-white">
                <thead className="bg-stone-100 text-stone-600 uppercase font-bold text-[9px] border-b">
                  <tr>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Region</th>
                    <th className="p-4">VIP Tier</th>
                    <th className="p-4">Archived Trunks</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {users.filter(u => u.role === 'user' && u.displayName.toLowerCase().includes(custSearch.toLowerCase())).map((cust) => (
                    <tr key={cust.uid} className="hover:bg-stone-50/50">
                      <td className="p-4 font-bold text-stone-900">{cust.displayName} ({cust.email})</td>
                      <td className="p-4">{cust.city || 'Jaipur'}</td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 bg-amber-100 border border-amber-200 text-amber-800 rounded font-semibold text-[10px]">
                          Preservation
                        </span>
                      </td>
                      <td className="p-4">2 file groups loaded</td>
                      <td className="p-4">
                        <button
                          id={`admin-cust-history-${cust.uid}`}
                          onClick={() => {
                            setActiveCustIdForHistory(activeCustIdForHistory === cust.uid ? null : cust.uid);
                          }}
                          className="px-2.5 py-1 bg-stone-900 hover:bg-stone-800 text-white rounded font-bold cursor-pointer"
                        >
                          Show History logs
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Interactive dropdown history list */}
              {activeCustIdForHistory && (
                <div className="bg-stone-900 text-stone-200 p-6 p-b-8 shadow-inner border-t border-stone-800 text-xs space-y-4">
                  <h4 className="font-serif text-sm font-bold text-amber-400">Ancestral Digitization History for selected User</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-stone-950 p-3 rounded-lg border border-stone-850 space-y-1">
                      <p className="font-bold text-white">Active Order:</p>
                      <p className="opacity-80">8mm Film Reel & Photo Album Heritage Restoration (Order #101)</p>
                      <p className="text-[10px] text-amber-500 font-semibold uppercase">Restoration: collected state</p>
                    </div>

                    <div className="bg-stone-950 p-3 rounded-lg border border-stone-850 space-y-1">
                      <p className="font-bold text-white">Curated Vault files available (original vs colorized tiff):</p>
                      <p className="opacity-80">Grandfather Royal Jaipur Wedding Portrait.png</p>
                      <p className="opacity-80">Brothers playing in Haveli Courtyard.png</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* OPERATIONS LAB MONITOR */}
        {activeTab === 'operations' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Pickup monitor queue */}
            <div className="bg-white border border-stone-200 p-5 rounded-2xl space-y-4 shadow-xs">
              <h4 className="font-serif font-black text-stone-900 text-sm border-b pb-2">Active Logistics Pickup Queue</h4>
              <div className="space-y-3">
                {orders.filter(o => o.deliveryStatus !== 'delivered').map(order => (
                  <div key={order.id} className="p-3 bg-stone-50 border rounded-lg text-xs space-y-1">
                    <p className="font-bold text-stone-950">Order ID: #{order.id}</p>
                    <p className="text-[11px] text-stone-500">Service: {order.serviceType}</p>
                    <p className="text-[10px] font-bold text-amber-800 uppercase">Status: {order.deliveryStatus}</p>
                    <p className="text-[10px] text-stone-400">Pickup OTP code: {order.pickupOtp || 'No OTP seed'}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Restoration Queue */}
            <div className="bg-white border border-stone-200 p-5 rounded-2xl space-y-4 shadow-xs">
              <h4 className="font-serif font-black text-stone-900 text-sm border-b pb-2">Archival Micro-Restoration Queue</h4>
              <div className="space-y-3">
                {orders.map(order => (
                  <div key={order.id} className="p-3 bg-stone-50 border rounded-lg text-xs space-y-1">
                    <p className="font-bold text-stone-950">Pipeline ID: #{order.id}</p>
                    <p className="text-[11px] text-stone-500">Lab stage: {order.restorationStage?.toUpperCase() || 'COLLECTED'}</p>
                    <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden mt-1">
                      <div 
                        className="h-full bg-orange-600 transition-all duration-300"
                        style={{ width: order.restorationStage === 'completed' ? '100%' : '35%' }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cloud Files Manager */}
            <div className="bg-white border border-stone-200 p-5 rounded-2xl space-y-4 shadow-xs">
              <h4 className="font-serif font-black text-stone-900 text-sm border-b pb-2">Dynamic Archival Cloud Files Directory</h4>
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                {files.map(f => (
                  <div key={f.id} className="p-3 bg-stone-50 border border-stone-100 rounded-lg text-xs flex justify-between items-center gap-4">
                    <div className="space-y-1">
                      <p className="font-bold text-stone-950 truncate max-w-[150px]">{f.name}</p>
                      <p className="text-[10px] text-stone-400 font-mono">Format: {f.type} • size: {f.fileSize || '3.5MB'}</p>
                    </div>

                    <button
                      id={`admin-delete-file-btn-${f.id}`}
                      onClick={() => {
                        if (confirm(`Do you wish to delete asset: ${f.name} permanently?`)) {
                          onDeleteFile(f.id);
                        }
                      }}
                      className="p-1 text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 rounded cursor-pointer"
                      title="Nuke file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* UPLOAD CENTER */}
        {activeTab === 'upload_center' && (
          <div className="max-w-xl mx-auto bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 shadow-xs">
            <h3 className="font-serif font-medium text-stone-950 text-lg mb-4">Post-Restoration AI Upload Center</h3>
            <p className="text-xs text-stone-500 mb-6 leading-relaxed">
              Drag-and-drop or select restored archives to push them to the customer's Family Vault, which is then made accessible in real-time under their "My Files" dashboard.
            </p>

            <form onSubmit={handleRealS3Upload} className="space-y-4 text-xs">
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-stone-600 mb-1 font-medium">Select Target Verified Family</label>
                    <select
                      id="admin-upload-user"
                      value={uploadState.targetUserId}
                      onChange={(e) => {
                        const targetId = e.target.value;
                        setUploadState(prev => ({
                          ...prev,
                          targetUserId: targetId,
                          s3Key: `users/${targetId}/${prev.name.replace(/\s+/g, '_') || 'restored_document.png'}`
                        }));
                      }}
                      className="w-full bg-stone-50 border border-stone-300 text-stone-950 p-2 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      {users.length === 0 ? (
                        <option value="user-01">Aarav Sharma (itzmebalustrade@gmail.com)</option>
                      ) : (
                        users.map(u => (
                          <option key={u.uid} value={u.uid}>{u.displayName} ({u.email || u.uid})</option>
                        ))
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-stone-600 mb-1 font-medium">User Unique UID</label>
                    <input
                      type="text"
                      disabled
                      value={uploadState.targetUserId}
                      className="w-full bg-stone-100 border border-stone-300 text-stone-500 p-2 rounded font-mono"
                    />
                  </div>
                </div>

                <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-2">
                  <h4 className="font-mono font-bold text-amber-900 text-[10px] uppercase">Secure S3 Archival Destination</h4>
                  <div className="grid grid-cols-2 gap-3 text-[10px]">
                    <div>
                      <span className="block text-amber-900 font-medium mb-1">S3 Bucket Name</span>
                      <input
                        type="text"
                        value={uploadState.s3Bucket || ''}
                        onChange={(e) => setUploadState({ ...uploadState, s3Bucket: e.target.value })}
                        className="w-full bg-white border border-stone-300 text-stone-900 p-1.5 rounded font-mono text-[10px] focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    </div>
                    <div>
                      <span className="block text-amber-900 font-medium mb-1">S3 Object Key prefix</span>
                      <input
                        type="text"
                        value={uploadState.s3Key || ''}
                        onChange={(e) => setUploadState({ ...uploadState, s3Key: e.target.value })}
                        className="w-full bg-white border border-stone-300 text-stone-900 p-1.5 rounded font-mono text-[10px] focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    </div>
                  </div>
                  <span className="block text-[9px] text-stone-500 font-mono">
                    URI: s3://{uploadState.s3Bucket}/{uploadState.s3Key}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-stone-600 mb-1 font-medium">Restored Asset Filename</label>
                  <input
                    id="admin-upload-name"
                    type="text"
                    required
                    value={uploadState.name}
                    onChange={(e) => {
                      const nextName = e.target.value;
                      setUploadState(prev => ({
                        ...prev,
                        name: nextName,
                        s3Key: `users/${prev.targetUserId}/${nextName.replace(/\s+/g, '_')}`
                      }));
                    }}
                    placeholder="Provide customized filename..."
                    className="w-full bg-stone-50 border border-stone-300 text-stone-950 p-2 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-stone-600 mb-1 font-medium">Preserve Category</label>
                  <select
                    id="admin-upload-cat"
                    value={uploadState.category}
                    onChange={(e) => setUploadState({ ...uploadState, category: e.target.value as any })}
                    className="w-full bg-stone-50 border border-stone-300 text-stone-950 p-2 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="heritage">Heritage Portrait Scan</option>
                    <option value="wedding">Joint Family Wedding</option>
                    <option value="childhood">Childhood Adventure</option>
                    <option value="general">Uncategorized Record</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-stone-600 mb-1 font-semibold">Laboratory Restoration Technical Notes</label>
                <textarea
                  id="admin-upload-notes"
                  rows={2}
                  value={uploadState.notes}
                  onChange={(e) => setUploadState({ ...uploadState, notes: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-300 text-stone-950 p-2 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 font-mono text-[10px]">
                <div>
                  <label className="block text-stone-400 mb-0.5">EST. RESOLUTION</label>
                  <input
                    id="admin-upload-resolution"
                    type="text"
                    value={uploadState.resolution}
                    onChange={(e) => setUploadState({ ...uploadState, resolution: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-300 text-stone-950 p-2 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-stone-400 mb-0.5">FILE SIZE</label>
                  <input
                    id="admin-upload-size"
                    type="text"
                    value={uploadState.fileSize}
                    onChange={(e) => setUploadState({ ...uploadState, fileSize: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-300 text-stone-950 p-2 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Upload Drag & Drop Slots */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* Slot 1: Restored Clear Photograph (Required) */}
                <div 
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                    isDragOverRestored 
                      ? 'border-amber-500 bg-amber-50/80 scale-[1.01]' 
                      : restoredFile 
                        ? 'border-emerald-300 bg-emerald-50/10' 
                        : 'border-stone-200 hover:border-amber-300 bg-stone-50'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragOverRestored(true); }}
                  onDragLeave={() => setIsDragOverRestored(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOverRestored(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleRestoredFileSelection(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => document.getElementById('admin-file-restored')?.click()}
                >
                  <input 
                    type="file" 
                    id="admin-file-restored" 
                    className="hidden" 
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleRestoredFileSelection(e.target.files[0]);
                      }
                    }}
                  />
                  {restoredPreview ? (
                    <div className="space-y-2">
                      <img 
                        src={restoredPreview} 
                        alt="Restored Preview" 
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 object-cover mx-auto rounded-lg shadow-sm"
                      />
                      <p className="text-[10px] text-stone-700 font-bold truncate max-w-[150px] mx-auto">{restoredFile?.name}</p>
                      <span className="text-[9px] text-emerald-700 font-mono font-bold bg-emerald-100 py-0.5 px-2 rounded-full inline-block">Restored Photo Chosen</span>
                    </div>
                  ) : (
                    <div className="space-y-2 py-2">
                      <FileUp className="w-5 h-5 text-stone-400 mx-auto" />
                      <div>
                        <p className="text-[10px] text-stone-700 font-bold">1. Restored Output (Req)</p>
                        <p className="text-[9px] text-stone-400 leading-tight">Click/Drop restored photo</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Slot 2: Raw / Damaged Original Photograph (Optional) */}
                <div 
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                    isDragOverOriginal 
                      ? 'border-amber-500 bg-amber-50/80 scale-[1.01]' 
                      : originalFile 
                        ? 'border-amber-300 bg-amber-50/10' 
                        : 'border-stone-200 hover:border-amber-300 bg-stone-50'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragOverOriginal(true); }}
                  onDragLeave={() => setIsDragOverOriginal(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOverOriginal(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleOriginalFileSelection(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => document.getElementById('admin-file-original')?.click()}
                >
                  <input 
                    type="file" 
                    id="admin-file-original" 
                    className="hidden" 
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleOriginalFileSelection(e.target.files[0]);
                      }
                    }}
                  />
                  {originalPreview ? (
                    <div className="space-y-2">
                      <img 
                        src={originalPreview} 
                        alt="Original Preview" 
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 object-cover mx-auto rounded-lg shadow-sm grayscale"
                      />
                      <p className="text-[10px] text-stone-700 font-bold truncate max-w-[150px] mx-auto">{originalFile?.name}</p>
                      <span className="text-[9px] text-amber-700 font-mono font-bold bg-amber-100 py-0.5 px-2 rounded-full inline-block">Original Foto Chosen</span>
                    </div>
                  ) : (
                    <div className="space-y-2 py-2">
                      <FileUp className="w-5 h-5 text-stone-400 mx-auto animate-pulse" />
                      <div>
                        <p className="text-[10px] text-stone-700 font-bold">2. Damaged Original (Opt)</p>
                        <p className="text-[9px] text-stone-400 leading-tight">Click/Drop raw damaged scan</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* S3 Process Trace Logs */}
              {uploadLogs.length > 0 && (
                <div className="bg-stone-900 text-stone-100 font-mono text-[10px] p-3 rounded-lg max-h-[140px] overflow-y-auto space-y-1 border border-stone-800">
                  <p className="text-amber-400 font-bold border-b border-stone-800 pb-1 flex items-center justify-between font-sans">
                    <span>AWS AWS-S3 LOG AGENT:</span>
                    <span>{uploadProgress}%</span>
                  </p>
                  {uploadLogs.map((log, index) => (
                    <div key={index} className="leading-snug">
                      <span className="text-stone-500 mr-2">[{index + 1}]</span>
                      {log}
                    </div>
                  ))}
                </div>
              )}

              {isUploading && (
                <div className="space-y-1.5 text-xs">
                  <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                  </div>
                </div>
              )}

              <button
                id="submit-admin-upload"
                type="submit"
                disabled={isUploading}
                className="w-full py-3 bg-stone-900 hover:bg-stone-850 text-white font-semibold rounded transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                {isUploading ? "Uploading Byte Stream to AWS..." : "Deploy Restored Output to AWS S3 & Client Vault"}
              </button>
            </form>
          </div>
        )}

        {/* FASTAPI DEVELOPER CONSOLE PLAYGROUND */}
        {activeTab === 'fastapi_console' && (
          <div className="space-y-8 animate-fade-in">
            {/* Top overview widget */}
            <div className="bg-stone-900 text-stone-100 rounded-3xl p-6 sm:p-8 shadow-xl border border-stone-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-500/10 text-emerald-400 p-1 px-2.5 rounded-full font-mono text-[10px] font-bold border border-emerald-500/20 uppercase tracking-widest">
                    ⚡ High Performance
                  </span>
                  <span className="text-stone-400 font-mono text-xs">v0.1.2</span>
                </div>
                <h3 className="font-serif font-black text-xl sm:text-2xl text-stone-100">
                  ReLive FastAPI Portal & Emulator
                </h3>
                <p className="text-stone-400 text-xs max-w-2xl leading-relaxed">
                  Interact with high fidelity, rate-limited memory preservation microservices. All endpoints feature dynamic microsecond telemetry metrics (<code className="bg-stone-800 text-stone-200 px-1 py-0.5 rounded text-[10px]">X-Process-Time</code> headers) with token verification enforcement.
                </p>
                
                <div className="flex flex-wrap gap-2 pt-2">
                  <a 
                    href="/api/fastapi/docs" 
                    target="_blank" 
                    rel="noreferrer" 
                    className="bg-emerald-600 hover:bg-emerald-500 text-stone-100 font-semibold px-4 py-1.5 rounded-lg text-xs transition duration-150 inline-flex items-center gap-1.5"
                  >
                    🚀 Open Swagger Interactive Docs ↗
                  </a>
                  <a 
                    href="/api/fastapi/redoc" 
                    target="_blank" 
                    rel="noreferrer" 
                    className="bg-stone-800 hover:bg-stone-750 text-stone-200 font-semibold px-4 py-1.5 rounded-lg text-xs transition duration-150 inline-flex items-center gap-1.5 border border-stone-700"
                  >
                    📖 Open ReDoc specifications ↗
                  </a>
                </div>
              </div>

              {/* Dynamic rate-limiting status meter */}
              <div className="bg-black/40 border border-stone-800 p-5 rounded-2xl md:w-80 shrink-0 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[10px] text-stone-400 uppercase tracking-widest font-bold">Rate Limits Guard</span>
                  <button onClick={loadRateLimitStatus} className="text-emerald-400 hover:text-emerald-300 font-mono text-[9px] uppercase tracking-wider underline">
                    refresh
                  </button>
                </div>
                
                <div className="flex items-baseline justify-between">
                  <span className="text-stone-500 text-[10px]">REMAINING QUOTA</span>
                  <span className="font-mono font-bold text-xl text-emerald-400">
                    {rateLimitState ? `${rateLimitState.remaining} / ${rateLimitState.limit}` : "Loading..."}
                  </span>
                </div>

                <div className="w-full bg-stone-800 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ 
                      width: rateLimitState 
                        ? `${(rateLimitState.remaining / rateLimitState.limit) * 100}%` 
                        : "100%" 
                    }}
                  />
                </div>

                <div className="flex justify-between items-center text-[10px] font-mono text-stone-500">
                  <span>IP: {rateLimitState?.client_ip || "Checking..."}</span>
                  <span>Resets in: {rateLimitState?.reset_seconds || "60"}s</span>
                </div>
              </div>
            </div>

            {/* Credential Token configuration selector */}
            <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs space-y-4">
              <div className="border-b border-stone-200 pb-2">
                <h4 className="font-serif font-semibold text-stone-900 text-sm">
                  🔑 HTTP Authorization Preset Vector
                </h4>
                <p className="text-xs text-stone-500">
                  Simulate API calls with varying security vector structures to inspect FastAPI authentication and authorization checks.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { id: 'guest', title: 'Anonymous (Guest)', desc: 'Preempts authorization header. Expected: 401 on restricted endpoints.', color: 'border-stone-300' },
                  { id: 'user', title: 'Verified User', desc: 'Bearer user-mock-vintage. Grants standard access to read/write metrics.', color: 'border-emerald-300' },
                  { id: 'admin', title: 'Administrator', desc: 'Bearer admin-supersecret-token. Grants access to delete collections.', color: 'border-indigo-300' },
                  { id: 'custom', title: 'Custom Secret', desc: 'Override customized tokens manually via input string parameters.', color: 'border-amber-300' }
                ].map((preset) => (
                  <button 
                    key={preset.id}
                    onClick={() => setFastApiTokenPreset(preset.id as any)}
                    className={`p-4 rounded-2xl text-left border-2 transition-all cursor-pointer space-y-1 ${
                      fastApiTokenPreset === preset.id 
                        ? 'bg-stone-50 border-stone-900 ring-2 ring-stone-900/10' 
                        : 'bg-white border-stone-150 hover:bg-stone-50'
                    }`}
                  >
                    <span className="block font-bold text-xs text-stone-850">{preset.title}</span>
                    <span className="block text-[10px] text-stone-500 leading-tight">{preset.desc}</span>
                  </button>
                ))}
              </div>

              {fastApiTokenPreset === 'custom' && (
                <div className="space-y-1 md:w-1/2">
                  <label className="block font-mono text-[10px] uppercase font-bold text-stone-500">Custom Bearer Token String</label>
                  <input 
                    type="text"
                    value={fastApiCustomToken}
                    onChange={(e) => setFastApiCustomToken(e.target.value)}
                    placeholder="e.g. key-abc-xyz-123"
                    className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2 font-mono text-xs text-stone-900 focus:outline-none focus:border-stone-950"
                  />
                </div>
              )}

              <div className="p-3.5 bg-stone-50 rounded-xl flex flex-wrap gap-4 text-xs font-mono text-stone-600 border border-stone-150">
                <div>
                  <span className="font-bold text-stone-400">Authorization Payload Status: </span>
                </div>
                <div>
                  Header Key: <code className="bg-stone-200 px-1 py-0.5 rounded text-stone-800">Authorization</code>
                </div>
                <div>
                  Header Value: <code className="bg-stone-200 px-1 py-0.5 rounded text-stone-800 font-bold">
                    {fastApiTokenPreset === 'guest' ? 'None (Sent as Guest)' : `Bearer ${getEffectiveToken()}`}
                  </code>
                </div>
              </div>
            </div>

            {/* Core endpoints console playgrounds tree */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Box 1: POST /api/fastapi/optimize */}
              <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-stone-150 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-indigo-100 text-indigo-700 font-mono font-bold px-2 py-0.5 rounded">POST</span>
                      <h4 className="font-serif font-black text-stone-900 text-sm">/api/fastapi/optimize</h4>
                    </div>
                    <span className="text-[10px] text-stone-400 font-mono uppercase font-bold">Role constraint: user, admin</span>
                  </div>

                  <p className="text-xs text-stone-500 leading-relaxed">
                    Triggers a high speed pixel analysis and noise-decorrosion sequence simulation on our heritage image bakes to compress bytes elegantly without loss.
                  </p>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="block text-stone-600 mb-1">Compression Target</label>
                      <select 
                        value={optTargetSize} 
                        onChange={(e) => setOptTargetSize(e.target.value)}
                        className="w-full bg-stone-50 border border-stone-300 rounded p-1.5 text-stone-900 font-mono text-xs"
                      >
                        <option value="original-quality">original-quality (Lossless)</option>
                        <option value="4k-uhd">4K Ultra Heritage (High Ratio)</option>
                        <option value="8k-super-dense">8K Super Dense (Precision focus)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-stone-600 mb-1">Color Precision</label>
                      <select 
                        value={optColorPrecision} 
                        onChange={(e) => setOptColorPrecision(e.target.value)}
                        className="w-full bg-stone-50 border border-stone-300 rounded p-1.5 text-stone-900 font-mono text-xs"
                      >
                        <option value="16-bit-heritage">16-bit-heritage (Classic)</option>
                        <option value="rec-2020-cinematic">Rec-2020 Cinematic HDR</option>
                      </select>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-stone-600 mb-0.5">Asset Filename Source</label>
                      <input 
                        type="text" 
                        value={optFilename} 
                        onChange={(e) => setOptFilename(e.target.value)}
                        className="w-full bg-stone-50 border border-stone-300 rounded p-1.5 text-stone-900 font-mono text-xs"
                      />
                    </div>

                    <div className="col-span-2 flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id="optimise-noise-checkbox"
                        checked={optNoiseFilter} 
                        onChange={(e) => setOptNoiseFilter(e.target.checked)}
                        className="rounded accent-stone-900 w-4 h-4 cursor-pointer"
                      />
                      <label htmlFor="optimise-noise-checkbox" className="text-stone-700 font-medium select-none cursor-pointer">
                        Filter atmospheric salt-and-pepper grain decay (High Pass Optimizer)
                      </label>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => runApiTest('POST', '/api/fastapi/optimize', {
                    targetSize: optTargetSize,
                    noiseFilter: optNoiseFilter,
                    colorPrecision: optColorPrecision,
                    inputFilename: optFilename
                  })}
                  disabled={isLoadingApi}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-stone-100 font-bold py-2.5 rounded-xl text-xs transition duration-150 shadow-md"
                >
                  ⚡ Send Optimize Request
                </button>
              </div>

              {/* Box 2: Secure Database sync mutation /api/sync-to-firebase /api/delete-from-firebase */}
              <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-xs flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-stone-150 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-violet-100 text-violet-700 font-mono font-bold px-2 py-0.5 rounded">POST</span>
                      <h4 className="font-serif font-black text-stone-900 text-sm">/api/sync-to-firebase</h4>
                    </div>
                  </div>

                  <p className="text-xs text-stone-500 leading-relaxed">
                    Directly replicates payload document data to user's live Firebase Firestore db securely. You can also test delete actions restricted only to administrators setup.
                  </p>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="block text-stone-600 mb-1">Collection</label>
                      <input 
                        type="text" 
                        value={customSyncCollection} 
                        onChange={(e) => setCustomSyncCollection(e.target.value)}
                        className="w-full bg-stone-50 border border-stone-300 rounded p-1.5 text-stone-900 font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-stone-600 mb-1">Doc ID</label>
                      <input 
                        type="text" 
                        value={customSyncDocId} 
                        onChange={(e) => setCustomSyncDocId(e.target.value)}
                        className="w-full bg-stone-50 border border-stone-300 rounded p-1.5 text-stone-900 font-mono text-xs"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-stone-600 mb-1">Document Payload Data (JSON format text)</label>
                      <textarea 
                        rows={3}
                        value={customSyncData} 
                        onChange={(e) => setCustomSyncData(e.target.value)}
                        className="w-full bg-stone-50 border border-stone-300 rounded p-2 text-stone-900 font-mono text-xs font-medium focus:outline-none focus:border-stone-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(customSyncData);
                        runApiTest('POST', '/api/sync-to-firebase', {
                          collectionName: customSyncCollection,
                          docId: customSyncDocId,
                          data: parsed
                        });
                      } catch (e: any) {
                        alert("Invalid JSON format payload written. Please fix syntax " + e.message);
                      }
                    }}
                    disabled={isLoadingApi}
                    className="bg-violet-600 hover:bg-violet-500 text-stone-100 font-bold py-2.5 rounded-xl text-xs transition duration-150 shadow-md"
                  >
                    💾 Replicate to DB
                  </button>
                  <button 
                    onClick={() => runApiTest('POST', '/api/delete-from-firebase', {
                      collectionName: customSyncCollection,
                      docId: customSyncDocId
                    })}
                    disabled={isLoadingApi}
                    className="bg-rose-600 hover:bg-rose-500 text-stone-100 font-bold py-2.5 rounded-xl text-xs transition duration-150 shadow-md"
                  >
                    🗑️ Test Deletion (Admin Only)
                  </button>
                </div>
              </div>

            </div>

            {/* Response console monitor displays */}
            {(fastApiHeaders || fastApiResult) && (
              <div className="bg-stone-950 border border-stone-800 rounded-3xl p-5 overflow-hidden shadow-xl space-y-3">
                <div className="flex items-center justify-between border-b border-stone-850 pb-2">
                  <span className="font-mono text-xs text-amber-400 font-bold">API Interactive Feedback Console</span>
                  <button 
                    onClick={() => { setFastApiResult(''); setFastApiHeaders(''); }} 
                    className="text-stone-500 hover:text-stone-300 font-mono text-[9px] uppercase tracking-wider"
                  >
                    Clear Screen
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-4 bg-black/40 p-4 rounded-xl border border-stone-900 font-mono text-xs text-stone-400 leading-relaxed overflow-x-auto">
                    <span className="block text-[9px] text-stone-500 uppercase tracking-widest font-bold mb-2">Response Diagnostic Headers</span>
                    <pre className="text-yellow-500 whitespace-pre font-bold">{fastApiHeaders}</pre>
                  </div>
                  
                  <div className="md:col-span-8 bg-black/40 p-4 rounded-xl border border-stone-900 font-mono text-xs text-emerald-400 overflow-x-auto">
                    <span className="block text-[9px] text-stone-500 uppercase tracking-widest font-bold mb-2">ResponseBody Data</span>
                    <pre className="whitespace-pre-wrap font-medium">{fastApiResult}</pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

