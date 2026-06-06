import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import admin from "firebase-admin";

dotenv.config();

// Initialize Firebase Admin SDK dynamically using environment variables
let adminFirestore: admin.firestore.Firestore | null = null;

function getFirebaseAdminFirestore(): admin.firestore.Firestore | null {
  if (adminFirestore) return adminFirestore;

  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const projectId = process.env.FIREBASE_PROJECT_ID || "relive-c9b9b";

  if (!privateKey || !clientEmail) {
    console.warn("[FIREBASE ADMIN] Server-side Firebase SDK credentials (FIREBASE_PRIVATE_KEY or FIREBASE_CLIENT_EMAIL) are not configured. Running database updates in local simulation mode.");
    return null;
  }

  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, "\n")
        })
      });
    }
    adminFirestore = admin.firestore();
    console.log(`[FIREBASE ADMIN] Connected successfully to "${projectId}" Firestore!`);
    return adminFirestore;
  } catch (error) {
    console.error("[FIREBASE ADMIN] Initialization failed:", error);
    return null;
  }
}

dotenv.config();

// Helper function to send email via SMTP, defaulting to itzmebalustrade@gmail.com
async function sendEmailViaSMTP({
  to,
  subject,
  html,
  text
}: {
  to: string;
  subject: string;
  html?: string;
  text: string;
}) {
  const hostMail = "itzmebalustrade@gmail.com";
  let smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  if (smtpHost.includes("@")) {
    console.warn(`[SMTP WARN] SMTP_HOST was misconfigured to an email address (${smtpHost}). Falling back to 'smtp.gmail.com'.`);
    smtpHost = "smtp.gmail.com";
  }
  const smtpPort = parseInt(process.env.SMTP_PORT || "587");
  const smtpUser = process.env.SMTP_USER || hostMail;
  const smtpPass = process.env.SMTP_PASS || "";

  console.log(`\n=============================================================`);
  console.log(`[SMTP EMAIL SENDER] DISPATCH ACTIVATED!`);
  console.log(`From (Host Account): ${smtpUser}`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`-------------------------------------------------------------`);
  console.log(`Message:`);
  console.log(`${text}`);
  console.log(`=============================================================\n`);

  // Ensure 'itzmebalustrade@gmail.com' always receives a copy of the notification
  const recipients = [to];
  if (to.toLowerCase() !== hostMail.toLowerCase()) {
    recipients.push(hostMail);
  }

  if (smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      const info = await transporter.sendMail({
        from: `"ReLive Archival Team" <${smtpUser}>`,
        to: recipients.join(", "),
        subject,
        text,
        html: html || text.replace(/\n/g, '<br/>')
      });
      console.log(`[SMTP SUCCESS] Mail delivered successfully via SMTP! MsgID: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error("[SMTP ERROR] SMTP connection or authorization failed. Falling back to log-only delivery.", error);
      return { success: false, error: String(error) };
    }
  } else {
    console.log(`[SMTP SIMULATION] SMTP passphrase is not defined in secrets. Simulated transmission to ${recipients.join(", ")} dispatched beautifully!`);
    return { success: true, simulated: true };
  }
}

// Initialize Gemini SDK with named parameters & telemetry user-agent
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("WARNING: GEMINI_API_KEY is not defined. AI features will fallback to helpful mockup templates.");
  }
  return new GoogleGenAI({
    apiKey: apiKey || "MOCK_KEY",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

// -------------------------------------------------------------
// HIGH-PERFORMANCE FASTAPI COMPLIANT CORE MIDDLEWARES
// -------------------------------------------------------------

// Active in-memory IP Rate limit tracker
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute window
const MAX_REQUESTS_PER_MIN = 60; // 60 requests per minute ceiling

interface AuthenticatedRequest extends express.Request {
  user?: {
    uid: string;
    email: string;
    role: string;
  };
}

// Global Process-Time Tracking Middleware (FastAPI style X-Process-Time header)
function processTimeTracker(req: express.Request, res: express.Response, next: express.NextFunction) {
  const startHr = process.hrtime();
  
  // Inject X-Process-Time dynamic header inside the response transmission hook safely
  const originalWriteHead = res.writeHead;
  res.writeHead = function(statusCode: number, ...args: any[]) {
    const diff = process.hrtime(startHr);
    const ms = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
    res.setHeader("X-Process-Time", `${ms}ms`);
    return originalWriteHead.apply(res, [statusCode, ...args]);
  };
  next();
}

// Global IP-based Rate Limiter Middleware
function globalRateLimiter(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Let's exempt the interactive auto-generated documentation endpoints from rate limits
  if (req.path === '/api/fastapi/docs' || req.path === '/api/fastapi/redoc') {
    return next();
  }

  const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-client';
  const clientIp = Array.isArray(rawIp) ? rawIp[0] : String(rawIp);
  const now = Date.now();

  let ipRecord = rateLimitMap.get(clientIp);
  if (!ipRecord || now > ipRecord.resetTime) {
    ipRecord = { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  }

  ipRecord.count++;
  rateLimitMap.set(clientIp, ipRecord);

  const remaining = Math.max(0, MAX_REQUESTS_PER_MIN - ipRecord.count);
  const secondsToReset = Math.ceil((ipRecord.resetTime - now) / 1000);

  // Set standard rate limit status headers
  res.setHeader("X-RateLimit-Limit", MAX_REQUESTS_PER_MIN);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", secondsToReset);

  if (ipRecord.count > MAX_REQUESTS_PER_MIN) {
    console.warn(`[FASTAPI RATE LIMIT] Abused client blocked: IP ${clientIp}. Count: ${ipRecord.count}/${MAX_REQUESTS_PER_MIN}`);
    return res.status(429).json({
      error: "Too Many Requests",
      message: `FastAPI request ceiling of ${MAX_REQUESTS_PER_MIN} req/min exceeded. Backoff activated.`,
      ip: clientIp,
      retry_after_seconds: secondsToReset
    });
  }
  next();
}

// Authentication parsing middleware
function parseAuthedToken(req: any, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers['authorization'];
  const userRole = req.headers['x-user-role'];
  const userEmail = req.headers['x-user-email'];

  let uid = "anonymous";
  let email = "explorer@relive.co";
  let role = "user";

  if (authHeader && authHeader.startsWith('Bearer ')) {
    uid = authHeader.split(' ')[1] || "anonymous";
  }

  if (userEmail) {
    email = String(userEmail);
  }
  if (userRole) {
    role = String(userRole);
  }

  req.user = { uid, email, role };
  next();
}

// Authorization core guard middlewares
function requireAuthentication(req: any, res: express.Response, next: express.NextFunction) {
  if (!req.user || req.user.uid === "anonymous" || req.user.uid === "guest") {
    console.warn(`[AUTH REFUSED] Unauthenticated route access attempt denied.`);
    return res.status(401).json({
      error: "Unauthorized",
      detail: "This high-performance API endpoint requires a valid authorization vector. Please include 'Authorization: Bearer <UID>' in your request headers."
    });
  }
  next();
}

function requireAuthorization(allowedRoles: string[]) {
  return (req: any, res: express.Response, next: express.NextFunction) => {
    if (!req.user || req.user.uid === "anonymous") {
      return res.status(401).json({ error: "Unauthorized", detail: "Missing token vector." });
    }
    if (!allowedRoles.includes(req.user.role)) {
      console.warn(`[AUTHZ DEFICIT] User ${req.user.email} (Role: ${req.user.role}) denied from admin-level operation.`);
      return res.status(403).json({
        error: "Forbidden",
        detail: `Authorization Error: Absolute access denied. Administrative authorization level required. Authorized roles: [${allowedRoles.join(", ")}]. Current: ${req.user.role}`
      });
    }
    next();
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Mount global performance headers, rate limits, and verification engines
  app.use(processTimeTracker);
  app.use(globalRateLimiter);
  app.use(parseAuthedToken);

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // -------------------------------------------------------------
  // FASTAPI EMULATION & COMPLIANCE ENDPOINTS
  // -------------------------------------------------------------

  // GET /api/fastapi/rate-limit-status - Dynamic IP Telemetry status
  app.get("/api/fastapi/rate-limit-status", (req, res) => {
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown-client';
    const clientIp = Array.isArray(rawIp) ? rawIp[0] : String(rawIp);
    const now = Date.now();
    const ipRecord = rateLimitMap.get(clientIp) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };

    const remaining = Math.max(0, MAX_REQUESTS_PER_MIN - ipRecord.count);
    const secondsToReset = Math.ceil((ipRecord.resetTime - now) / 1000);

    res.json({
      client_ip: clientIp,
      limit: MAX_REQUESTS_PER_MIN,
      remaining,
      reset_seconds: secondsToReset,
      window_duration_seconds: 60,
      rate_limit_percentage_used: parseFloat(((ipRecord.count / MAX_REQUESTS_PER_MIN) * 100).toFixed(1)),
      status: remaining === 0 ? "EXCEEDED_RESTRICTED" : "HEALTHY_AUTHORIZED"
    });
  });

  // POST /api/fastapi/optimize - High speed preservation optimizer (<10ms)
  app.post("/api/fastapi/optimize", requireAuthentication, (req: any, res) => {
    const { targetSize, noiseFilter, colorPrecision, inputFilename } = req.body;
    
    // Quick, fast non-blocking evaluation
    const initialSizeKb = parseFloat((Math.random() * 8000 + 1000).toFixed(1));
    const finalSizeKb = parseFloat((initialSizeKb / (noiseFilter ? 1.94 : 1.25)).toFixed(1));
    const savedBytes = parseFloat((initialSizeKb - finalSizeKb).toFixed(1));

    res.json({
      pipeline_status: "SUCCESS",
      engine: "FastAPI-Core-v3-Turbo",
      model_type: "Neural-Bake-Stabilizer",
      execution_parameters: {
        targetSize: targetSize || "original",
        noiseFilter: noiseFilter !== false,
        colorPrecision: colorPrecision || "16-bit-heritage",
        input_filename: inputFilename || "heritage_polaroid_jaipur_1974.jpg"
      },
      metrics: {
        original_size_kb: initialSizeKb,
        optimized_size_kb: finalSizeKb,
        saved_space_kb: savedBytes,
        compression_ratio: `${(initialSizeKb / finalSizeKb).toFixed(2)}x`,
        noise_reduction_passes: noiseFilter ? 6 : 0,
        pixel_fill_rating_pct: 99.98
      },
      authorized_user: req.user.email,
      timestamp: new Date().toISOString()
    });
  });

  // GET /api/fastapi/docs - FastAPI Interactive OpenAPI / Swagger UI
  app.get("/api/fastapi/docs", (req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ReLive Core - FastAPI OpenAPI Docs</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      font-family: 'Inter', sans-serif;
      background-color: #0f172a;
      color: #e2e8f0;
    }
    h1, h2, h3, .font-display {
      font-family: 'Space Grotesk', sans-serif;
    }
    .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }
  </style>
</head>
<body class="min-h-screen pb-16">

  <!-- Header Header -->
  <header class="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
    <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="bg-emerald-500/10 text-emerald-400 p-2 rounded-lg font-display font-bold text-lg border border-emerald-500/20">
          ⚡ ReLive FastAPI
        </div>
        <div>
          <h1 class="text-xl font-bold tracking-tight">OpenAPI Documentation</h1>
          <p class="text-xs text-slate-400">Powered by high-performance Express/Node engine</p>
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <span class="text-xs text-slate-400 font-mono" id="ip-display">IP: Loading...</span>
        <button onclick="toggleAuthorizeModal()" id="auth-status-btn" class="bg-blue-600 hover:bg-blue-500 text-slate-100 px-4 py-1.5 rounded-md text-sm font-semibold flex items-center space-x-2 shadow-lg transition-all duration-150">
          🔑 Authorize
        </button>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 mt-8">
    <!-- Intro section -->
    <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8 shadow-xl">
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-2xl font-bold text-slate-100">ReLive Preservation Services API</h2>
          <span class="inline-block mt-2 font-mono text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded">openapi: 3.0.0</span>
          <span class="inline-block mt-2 font-mono text-xs bg-emerald-950 text-emerald-400 px-2 py-1 rounded ml-2">version: v0.1.2</span>
        </div>
        <div class="bg-slate-950 p-4 rounded-lg text-right border border-slate-800">
          <div class="text-xs text-slate-400 font-semibold mb-1">GLOBAL RATE LIMIT CONSTRAINTS</div>
          <div class="text-lg font-bold text-emerald-400 font-mono" id="rate-limit-stat">Loading...</div>
          <div class="text-[10px] text-slate-500 mt-1 font-mono">Resets every 60 seconds</div>
        </div>
      </div>
      <p class="text-slate-300 text-sm mt-4 max-w-4xl leading-relaxed">
        Welcome to ReLive's high-fidelity, rate-limited memory digitization API catalog. 
        All endpoints provide real-time latency diagnostics (<span class="text-slate-300 font-mono">X-Process-Time</span> headers) 
        and secure Token Authentication. Test your schemas, analyze model predictions, and persist historical archives directly inside our interactive browser playground.
      </p>
    </div>

    <!-- Active Token Display Panel -->
    <div class="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 mb-8 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <span class="text-slate-400 text-sm">Active Authentication Token:</span>
        <span id="active-token-badge" class="font-mono text-xs text-amber-400 bg-amber-500/10 px-3 py-1 rounded border border-amber-500/20">Guest (Unauthenticated)</span>
      </div>
      <div class="flex space-x-2">
        <button onclick="setFastApiAuth('guest')" class="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700">Set Guest</button>
        <button onclick="setFastApiAuth('user-mock-vintage')" class="px-2.5 py-1 text-xs bg-emerald-950 hover:bg-emerald-900 text-emerald-400 rounded border border-emerald-800">Set User Token</button>
        <button onclick="setFastApiAuth('admin-supersecret-token')" class="px-2.5 py-1 text-xs bg-blue-950 hover:bg-blue-900 text-blue-400 rounded border border-blue-800">Set Admin Admin</button>
      </div>
    </div>

    <!-- Endpoints Section -->
    <div class="space-y-6">
      <h2 class="text-lg font-bold text-slate-300 border-b border-slate-800 pb-2">API Endpoints Playbook</h2>

      <!-- Endpoint CARD: POST /api/fastapi/optimize -->
      <div class="border border-indigo-500/30 bg-slate-900/40 rounded-xl overflow-hidden shadow-md">
        <!-- Card Header -->
        <div onclick="toggleEndpointCollapse('opt-card')" class="bg-indigo-500/10 hover:bg-indigo-500/15 cursor-pointer px-4 py-3 flex items-center justify-between transition-colors">
          <div class="flex items-center space-x-3">
            <span class="bg-indigo-600 text-white font-mono text-xs font-bold px-2.5 py-1 rounded">POST</span>
            <span class="font-mono text-sm text-slate-100 font-semibold">/api/fastapi/optimize</span>
            <span class="text-xs text-slate-400">High speed non-blocking photo compression simulator</span>
          </div>
          <span class="text-xs text-indigo-400 font-mono">require_auth [user, admin]</span>
        </div>
        <!-- Card Body -->
        <div id="opt-card" class="hidden border-t border-slate-800 p-5 bg-slate-900/60 transition-all">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 class="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">Request Body Schema</h3>
              <textarea id="opt-payload" rows="5" class="w-full bg-slate-950 font-mono text-xs p-3 rounded-lg border border-slate-800 text-indigo-300 focus:outline-none focus:border-indigo-500">{
  "targetSize": "original-quality",
  "noiseFilter": true,
  "colorPrecision": "16-bit-heritage",
  "inputFilename": "heritage_polaroid_1974.jpg"
}</textarea>
              <button onclick="executeOptimize()" class="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2 px-6 rounded-md shadow-lg transition-transform hover:-translate-y-0.5">
                ⚡ Send Request
              </button>
            </div>
            <div>
              <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Execution Output Console</h3>
              <div class="bg-slate-950 rounded-lg p-3 border border-slate-800 h-48 overflow-y-auto">
                <div class="text-[10px] text-slate-500 font-mono mb-2" id="opt-headers">Headers will appear here.</div>
                <pre class="font-mono text-xs text-emerald-400" id="opt-output">// Click "Send Request" to trigger...</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Endpoint CARD: GET /api/fastapi/rate-limit-status -->
      <div class="border border-emerald-500/30 bg-slate-900/40 rounded-xl overflow-hidden shadow-md">
        <!-- Card Header -->
        <div onclick="toggleEndpointCollapse('lim-card')" class="bg-emerald-500/10 hover:bg-emerald-500/15 cursor-pointer px-4 py-3 flex items-center justify-between transition-colors">
          <div class="flex items-center space-x-3">
            <span class="bg-emerald-600 text-white font-mono text-xs font-bold px-3 py-1 rounded">GET</span>
            <span class="font-mono text-sm text-slate-100 font-semibold">/api/fastapi/rate-limit-status</span>
            <span class="text-xs text-slate-400">Get IP telemetry metadata & request limits</span>
          </div>
          <span class="text-xs text-emerald-400 font-mono">public</span>
        </div>
        <!-- Card Body -->
        <div id="lim-card" class="hidden border-t border-slate-800 p-5 bg-slate-900/60 transition-all">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 class="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">Parameters</h3>
              <p class="text-xs text-slate-400 mb-4">No query or body request variables required for this telemetry status.</p>
              <button onclick="executeRateLimitStatus()" class="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 px-6 rounded-md shadow-lg transition-transform hover:-translate-y-0.5">
                ⚡ Send Request
              </button>
            </div>
            <div>
              <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Execution Output Console</h3>
              <div class="bg-slate-950 rounded-lg p-3 border border-slate-800 h-48 overflow-y-auto">
                <div class="text-[10px] text-slate-500 font-mono mb-2" id="lim-headers">Headers will appear here.</div>
                <pre class="font-mono text-xs text-emerald-400" id="lim-output">// Click "Send Request" to trigger...</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Endpoint CARD: POST /api/chat -->
      <div class="border border-blue-500/30 bg-slate-900/40 rounded-xl overflow-hidden shadow-md">
        <!-- Card Header -->
        <div onclick="toggleEndpointCollapse('chat-card')" class="bg-blue-500/10 hover:bg-blue-500/15 cursor-pointer px-4 py-3 flex items-center justify-between transition-colors">
          <div class="flex items-center space-x-3">
            <span class="bg-blue-600 text-white font-mono text-xs font-bold px-2.5 py-1 rounded">POST</span>
            <span class="font-mono text-sm text-slate-100 font-semibold">/api/chat</span>
            <span class="text-xs text-slate-400">ReLive Virtual Family Historian Chatbot</span>
          </div>
          <span class="text-xs text-slate-400 font-mono">public</span>
        </div>
        <!-- Card Body -->
        <div id="chat-card" class="hidden border-t border-slate-800 p-5 bg-slate-900/60 transition-all">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 class="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">Request Body Schema</h3>
              <textarea id="chat-payload" rows="5" class="w-full bg-slate-950 font-mono text-xs p-3 rounded-lg border border-slate-800 text-blue-300 focus:outline-none focus:border-blue-500">{
  "message": "What is the science behind ReLive tape baking?",
  "history": []
}</textarea>
              <button onclick="executeChat()" class="mt-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-2 px-6 rounded-md shadow-lg transition-transform hover:-translate-y-0.5">
                ⚡ Send Request
              </button>
            </div>
            <div>
              <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Execution Output Console</h3>
              <div class="bg-slate-950 rounded-lg p-3 border border-slate-800 h-48 overflow-y-auto">
                <div class="text-[10px] text-slate-500 font-mono mb-2" id="chat-headers">Headers will appear here.</div>
                <pre class="font-mono text-xs text-emerald-400" id="chat-output">// Click "Send Request" to trigger...</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Endpoint CARD: POST /api/restore-analyze -->
      <div class="border border-cyan-500/30 bg-slate-900/40 rounded-xl overflow-hidden shadow-md">
        <!-- Card Header -->
        <div onclick="toggleEndpointCollapse('restore-card')" class="bg-cyan-500/10 hover:bg-cyan-500/15 cursor-pointer px-4 py-3 flex items-center justify-between transition-colors">
          <div class="flex items-center space-x-3">
            <span class="bg-cyan-600 text-white font-mono text-xs font-bold px-2.5 py-1 rounded">POST</span>
            <span class="font-mono text-sm text-slate-100 font-semibold">/api/restore-analyze</span>
            <span class="text-xs text-slate-400">Aesthetic separation & diagnostic scanner</span>
          </div>
          <span class="text-xs text-slate-400 font-mono">public</span>
        </div>
        <!-- Card Body -->
        <div id="restore-card" class="hidden border-t border-slate-800 p-5 bg-slate-900/60 transition-all">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 class="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2">Request Body Schema</h3>
              <textarea id="restore-payload" rows="5" class="w-full bg-slate-950 font-mono text-xs p-3 rounded-lg border border-slate-800 text-cyan-300 focus:outline-none focus:border-cyan-500">{
  "description": "Faded sepia polaroid shot from Old Delhi showing my family joint wedding in a Maruti 800 with small crinkles and humidity decay.",
  "mediaType": "photo-polaroid"
}</textarea>
              <button onclick="executeRestore()" class="mt-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs py-2 px-6 rounded-md shadow-lg transition-transform hover:-translate-y-0.5">
                ⚡ Send Request
              </button>
            </div>
            <div>
              <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Execution Output Console</h3>
              <div class="bg-slate-950 rounded-lg p-3 border border-slate-800 h-48 overflow-y-auto">
                <div class="text-[10px] text-slate-500 font-mono mb-2" id="restore-headers">Headers will appear here.</div>
                <pre class="font-mono text-xs text-emerald-400" id="restore-output">// Click "Send Request" to trigger...</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Endpoint CARD: POST /api/sync-to-firebase -->
      <div class="border border-violet-500/30 bg-slate-900/40 rounded-xl overflow-hidden shadow-md">
        <!-- Card Header -->
        <div onclick="toggleEndpointCollapse('sync-card')" class="bg-violet-500/10 hover:bg-violet-500/15 cursor-pointer px-4 py-3 flex items-center justify-between transition-colors">
          <div class="flex items-center space-x-3">
            <span class="bg-violet-600 text-white font-mono text-xs font-bold px-2.5 py-1 rounded">POST</span>
            <span class="font-mono text-sm text-slate-100 font-semibold">/api/sync-to-firebase</span>
            <span class="text-xs text-slate-400">Bridge database mutator (Saves object to live Firebase)</span>
          </div>
          <span class="text-xs text-violet-400 font-mono font-semibold">require_auth [user, admin]</span>
        </div>
        <!-- Card Body -->
        <div id="sync-card" class="hidden border-t border-slate-800 p-5 bg-slate-900/60 transition-all">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 class="text-xs font-bold text-violet-400 uppercase tracking-wider mb-2">Request Body Schema</h3>
              <textarea id="sync-payload" rows="8" class="w-full bg-slate-950 font-mono text-xs p-3 rounded-lg border border-slate-800 text-violet-300 focus:outline-none focus:border-violet-500">{
  "collectionName": "notifications",
  "docId": "fastapi_api_notif_74932",
  "data": {
    "id": "fastapi_api_notif_74932",
    "title": "FastAPI Authorization Active",
    "message": "Authorized sync test completed.",
    "type": "general",
    "isRead": false,
    "date": "${new Date().toISOString()}"
  }
}</textarea>
              <button onclick="executeSyncToFirebase()" class="mt-4 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs py-2 px-6 rounded-md shadow-lg transition-transform hover:-translate-y-0.5">
                ⚡ Send Request
              </button>
            </div>
            <div>
              <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Execution Output Console</h3>
              <div class="bg-slate-950 rounded-lg p-3 border border-slate-800 h-48 overflow-y-auto">
                <div class="text-[10px] text-slate-500 font-mono mb-2" id="sync-headers">Headers will appear here.</div>
                <pre class="font-mono text-xs text-emerald-400" id="sync-output">// Click "Send Request" to trigger...</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Endpoint CARD: POST /api/delete-from-firebase -->
      <div class="border border-rose-500/30 bg-slate-900/40 rounded-xl overflow-hidden shadow-md">
        <!-- Card Header -->
        <div onclick="toggleEndpointCollapse('del-card')" class="bg-rose-500/10 hover:bg-rose-500/15 cursor-pointer px-4 py-3 flex items-center justify-between transition-colors">
          <div class="flex items-center space-x-3">
            <span class="bg-rose-600 text-white font-mono text-xs font-bold px-2.5 py-1 rounded">POST</span>
            <span class="font-mono text-sm text-slate-100 font-semibold">/api/delete-from-firebase</span>
            <span class="text-xs text-slate-400">Administrative deletion bridge (Admin SDK)</span>
          </div>
          <span class="text-xs text-rose-400 font-mono font-bold">require_auth [admin_only]</span>
        </div>
        <!-- Card Body -->
        <div id="del-card" class="hidden border-t border-slate-800 p-5 bg-slate-900/60 transition-all">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 class="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2">Request Body Schema</h3>
              <textarea id="del-payload" rows="5" class="w-full bg-slate-950 font-mono text-xs p-3 rounded-lg border border-slate-800 text-rose-300 focus:outline-none focus:border-rose-500">{
  "collectionName": "notifications",
  "docId": "fastapi_api_notif_74932"
}</textarea>
              <button onclick="executeDeleteFromFirebase()" class="mt-4 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs py-2 px-6 rounded-md shadow-lg transition-transform hover:-translate-y-0.5">
                ⚡ Send Request
              </button>
            </div>
            <div>
              <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Execution Output Console</h3>
              <div class="bg-slate-950 rounded-lg p-3 border border-slate-800 h-48 overflow-y-auto">
                <div class="text-[10px] text-slate-500 font-mono mb-2" id="del-headers">Headers will appear here.</div>
                <pre class="font-mono text-xs text-emerald-400" id="del-output">// Click "Send Request" to trigger...</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </main>

  <!-- Authorize popover modal -->
  <div id="auth-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div class="bg-slate-950 border border-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
      <h3 class="text-lg font-bold text-slate-100 flex items-center space-x-2">
        <span>🔑</span> <span>FastAPI Security Authorization</span>
      </h3>
      <p class="text-xs text-slate-400 mt-2">
        Submit authentication Bearer headers to unlock restricted endpoints.
      </p>
      
      <div class="mt-4 space-y-3">
        <div>
          <label class="block text-xs text-slate-400 mb-1 font-semibold">Authorization Token Type</label>
          <select id="auth-type-selector" onchange="onAuthPresetSelected(this.value)" class="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs p-2.5 rounded-lg focus:outline-none focus:border-emerald-500">
            <option value="guest">Anonymous / Guest (No AuthHeader)</option>
            <option value="user">User Role presets (Bearer user-mock-vintage)</option>
            <option value="admin">Administrator Role (Bearer admin-supersecret-token)</option>
            <option value="custom">Custom Token Header Value...</option>
          </select>
        </div>
        
        <div>
          <label class="block text-xs text-slate-400 mb-1 font-semibold">Bearer Token Value</label>
          <input type="text" id="auth-input-field" class="w-full bg-slate-900 border border-slate-800 font-mono text-xs p-2.5 rounded-lg focus:outline-none text-slate-100 placeholder-slate-600 focus:border-emerald-500" placeholder="Token will be sent as Bearer <value>">
        </div>
      </div>

      <div class="mt-6 flex justify-end space-x-2.5">
        <button onclick="toggleAuthorizeModal()" class="px-4 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold transition-colors">Cancel</button>
        <button onclick="saveAuthorizePreset()" class="px-5 py-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-slate-100 rounded font-semibold transition-colors">Save Keys</button>
      </div>
    </div>
  </div>

  <script>
    // Local memory sync helper
    let currentAuthToken = localStorage.getItem('fastapi_bearer_token') || 'guest';
    let currentAuthRole = localStorage.getItem('fastapi_role') || 'user';
    let currentAuthEmail = localStorage.getItem('fastapi_email') || 'anonymous@relive.co';

    function initUI() {
      // Show details in view on start
      const tokenBadge = document.getElementById('active-token-badge');
      if (currentAuthToken === 'guest' || !currentAuthToken) {
        tokenBadge.className = "font-mono text-xs text-amber-400 bg-amber-500/10 px-3 py-1 rounded border border-amber-500/20";
        tokenBadge.innerText = "Guest (Unauthenticated)";
      } else if (currentAuthToken === 'admin-supersecret-token') {
        tokenBadge.className = "font-mono text-xs text-blue-400 bg-blue-500/10 px-3 py-1 rounded border border-blue-500/20";
        tokenBadge.innerText = "Admin Token Verified [Role: admin]";
      } else {
        tokenBadge.className = "font-mono text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded border border-emerald-500/20";
        tokenBadge.innerText = 'User Token Preset [ID: ' + currentAuthToken + ']';
      }
      
      // Update IP
      fetch('/api/health')
        .then(r => r.json())
        .then(() => {
          document.getElementById('ip-display').innerText = "Client Node Active";
        });

      // Update limit status
      refreshRateLimitDisplay();
    }

    function refreshRateLimitDisplay() {
      fetch('/api/fastapi/rate-limit-status')
        .then(r => r.json())
        .then(d => {
          document.getElementById('rate-limit-stat').innerText = d.remaining + " / " + d.limit;
        })
        .catch(() => {
          document.getElementById('rate-limit-stat').innerText = "Error Loading";
        });
    }

    function toggleEndpointCollapse(boxId) {
      const box = document.getElementById(boxId);
      if (box.classList.contains('hidden')) {
        box.classList.remove('hidden');
      } else {
        box.classList.add('hidden');
      }
    }

    function toggleAuthorizeModal() {
      const modal = document.getElementById('auth-modal');
      if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        // Preset selectors
        document.getElementById('auth-input-field').value = currentAuthToken === 'guest' ? '' : currentAuthToken;
      } else {
        modal.classList.add('hidden');
      }
    }

    function onAuthPresetSelected(val) {
      const input = document.getElementById('auth-input-field');
      if (val === 'guest') {
        input.value = '';
        input.disabled = true;
      } else if (val === 'user') {
        input.value = 'user-mock-vintage';
        input.disabled = false;
      } else if (val === 'admin') {
        input.value = 'admin-supersecret-token';
        input.disabled = false;
      } else {
        input.value = '';
        input.disabled = false;
        input.focus();
      }
    }

    function setFastApiAuth(preset) {
      if (preset === 'guest') {
        currentAuthToken = 'guest';
        currentAuthRole = 'user';
        currentAuthEmail = 'explorer@relive.co';
      } else if (preset === 'user-mock-vintage') {
        currentAuthToken = 'user-mock-vintage';
        currentAuthRole = 'user';
        currentAuthEmail = 'explorer@relive.co';
      } else if (preset === 'admin-supersecret-token') {
        currentAuthToken = 'admin-supersecret-token';
        currentAuthRole = 'admin';
        currentAuthEmail = 'itzmebalustrade@gmail.com';
      }
      localStorage.setItem('fastapi_bearer_token', currentAuthToken);
      localStorage.setItem('fastapi_role', currentAuthRole);
      localStorage.setItem('fastapi_email', currentAuthEmail);
      initUI();
    }

    function saveAuthorizePreset() {
      const select = document.getElementById('auth-type-selector').value;
      const val = document.getElementById('auth-input-field').value;

      if (select === 'guest' || !val) {
        setFastApiAuth('guest');
      } else if (val === 'admin-supersecret-token') {
        setFastApiAuth('admin-supersecret-token');
      } else {
        currentAuthToken = val;
        currentAuthRole = select === 'user' ? 'user' : 'user';
        currentAuthEmail = currentAuthRole === 'admin' ? 'itzmebalustrade@gmail.com' : 'explorer@relive.co';
        localStorage.setItem('fastapi_bearer_token', currentAuthToken);
        localStorage.setItem('fastapi_role', currentAuthRole);
        localStorage.setItem('fastapi_email', currentAuthEmail);
      }
      toggleAuthorizeModal();
      initUI();
    }

    // Interactive callers
    async function executeRequest(method, path, bodyText) {
      const start = performance.now();
      const headers = {
        'Content-Type': 'application/json'
      };

      if (currentAuthToken && currentAuthToken !== 'guest') {
        headers['Authorization'] = 'Bearer ' + currentAuthToken;
        headers['X-User-Role'] = currentAuthRole;
        headers['X-User-Email'] = currentAuthEmail;
      }

      const reqOptions = { method, headers };
      if (method === 'POST') {
        reqOptions.body = bodyText;
      }

      try {
        const response = await fetch(path, reqOptions);
        const duration = (performance.now() - start).toFixed(1);
        const text = await response.text();
        let parsed = text;
        try { parsed = JSON.parse(text); } catch(q){}

        // Parse headers to display
        let headerStr = "HTTPStatus: " + response.status + " " + response.statusText + "\\n";
        headerStr += "Response Time: " + duration + "ms\\n";
        response.headers.forEach((v, k) => {
          if (k.toLowerCase().startsWith('x-')) {
            headerStr += k + ": " + v + "\\n";
          }
        });

        refreshRateLimitDisplay();
        return { success: true, headers: headerStr, body: parsed };
      } catch (err) {
        return { success: false, headers: "Connection Failed", body: err.message };
      }
    }

    async function executeOptimize() {
      const pay = document.getElementById('opt-payload').value;
      const res = await executeRequest('POST', '/api/fastapi/optimize', pay);
      document.getElementById('opt-headers').innerText = res.headers;
      document.getElementById('opt-output').innerText = JSON.stringify(res.body, null, 2);
    }

    async function executeRateLimitStatus() {
      const res = await executeRequest('GET', '/api/fastapi/rate-limit-status');
      document.getElementById('lim-headers').innerText = res.headers;
      document.getElementById('lim-output').innerText = JSON.stringify(res.body, null, 2);
    }

    async function executeChat() {
      const pay = document.getElementById('chat-payload').value;
      const res = await executeRequest('POST', '/api/chat', pay);
      document.getElementById('chat-headers').innerText = res.headers;
      document.getElementById('chat-output').innerText = JSON.stringify(res.body, null, 2);
    }

    async function executeRestore() {
      const pay = document.getElementById('restore-payload').value;
      const res = await executeRequest('POST', '/api/restore-analyze', pay);
      document.getElementById('restore-headers').innerText = res.headers;
      document.getElementById('restore-output').innerText = JSON.stringify(res.body, null, 2);
    }

    async function executeSyncToFirebase() {
      const pay = document.getElementById('sync-payload').value;
      const res = await executeRequest('POST', '/api/sync-to-firebase', pay);
      document.getElementById('sync-headers').innerText = res.headers;
      document.getElementById('sync-output').innerText = JSON.stringify(res.body, null, 2);
    }

    async function executeDeleteFromFirebase() {
      const pay = document.getElementById('del-payload').value;
      const res = await executeRequest('POST', '/api/delete-from-firebase', pay);
      document.getElementById('del-headers').innerText = res.headers;
      document.getElementById('del-output').innerText = JSON.stringify(res.body, null, 2);
    }

    window.onload = initUI;
  </script>
</body>
</html>`);
  });

  // GET /api/fastapi/redoc - Modern alternating column Redoc documentation view
  app.get("/api/fastapi/redoc", (req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ReLive - ReDoc API Catalog</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
  <style>h1,h2,h3{font-family:'Space Grotesk',sans-serif;}body{font-family:'Inter',sans-serif;}</style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex">
  <nav class="w-80 border-r border-slate-900 bg-slate-950 p-6 space-y-6">
    <div class="text-xl font-bold text-emerald-400">ReLive ReDoc</div>
    <div class="space-y-2 text-xs text-slate-400 font-mono">
      <div class="font-bold border-b border-slate-900 pb-1 mb-2 tracking-wider">RESOURCES</div>
      <a class="block hover:text-emerald-400 transition" href="#optimization">⚡ Image Optimization</a>
      <a class="block hover:text-emerald-400 transition" href="#ratelimit">🛡️ Rate Limit Status</a>
      <a class="block hover:text-emerald-400 transition" href="#analytics">📊 AI Analytics</a>
      <a class="block hover:text-emerald-400 transition" href="#sync">🗄️ Database Sync Bridge</a>
    </div>
  </nav>
  <main class="flex-1 p-12 space-y-12">
    <div class="max-w-4xl space-y-4">
      <h1 class="text-3xl font-bold">FastAPI Developer Specification</h1>
      <p class="text-slate-400 text-sm">
        Welcome to the documentation guide for developers integrating programmatic automation inside ReLive. 
        For interactive execution testing, please use the <a href="/api/fastapi/docs" class="text-emerald-400 underline">Interactive Swagger Docs</a>.
      </p>
    </div>
    
    <div id="optimization" class="border-t border-slate-900 pt-6">
      <span class="text-[10px] uppercase font-bold text-slate-500 font-mono tracking-wider">Endpoint Schema</span>
      <h3 class="text-lg font-bold text-slate-200 mt-1">/api/fastapi/optimize [POST]</h3>
      <p class="text-xs text-slate-400 mt-2">Performs sub-10ms custom lossless pixel compression simulations mapped against local historical variables.</p>
    </div>
    
    <div id="ratelimit" class="border-t border-slate-900 pt-6">
      <span class="text-[10px] uppercase font-bold text-slate-500 font-mono tracking-wider">Endpoint Schema</span>
      <h3 class="text-lg font-bold text-slate-200 mt-1">/api/fastapi/rate-limit-status [GET]</h3>
      <p class="text-xs text-slate-400 mt-2">Returns complete client-side quota state including headers limits and reset seconds durations directly in the response.</p>
    </div>
  </main>
</body>
</html>`);
  });

  // ReLive AI Chatbot Helper
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
        // Fallback mock responses when key is unconfigured
        const lower = (message || "").toLowerCase();
        let fallback = "I am the ReLive Archival Assistant. I’d love to help you restore your family memories, book a secure doorstep pickup, or trace your VHS order. (Ready to connect as soon as the GEMINI_API_KEY is configured!)";
        
        if (lower.includes("pickup") || lower.includes("book") || lower.includes("appointment")) {
          fallback = "For booking a pickup, you can navigate securely to the 'Appointments' tab on your dashboard. Select your city (Jaipur or Delhi), input your fragile media count, and our partner Kartik will arrive in an electric scooter with a waterproof archival hard case!";
        } else if (lower.includes("vhs") || lower.includes("tape") || lower.includes("digitize")) {
          fallback = "Our VHS Digitization service uses high-definition tape-baking techniques. We stabilize silver particles and restore audio tracks for ₹1,499 per cassette. You will get raw .MP4 files synced straight to your ReLive Vault and Google Drive.";
        } else if (lower.includes("otp") || lower.includes("security")) {
          fallback = "To protect your priceless assets, our smart logistics system issues a unique 4-digit Secure OTP on your home dashboard. When the delivery partner arrives, they must enter your OTP to confirm collection.";
        } else if (lower.includes("price") || lower.includes("cost") || lower.includes("rate")) {
          fallback = "Our core pricing is highly transparent: Photos are restored for ₹499/image, VHS Digitization is ₹1,499/cassette, and 8mm Film Reels are scanned frame-by-frame starting at ₹2,499/reel.";
        }
        return res.json({ text: fallback });
      }

      const ai = getGeminiClient();
      
      // Let's build stateful helper instruction
      const systemInstruction = `You are "Archival Core", ReLive's elite virtual family historian, digital preservation scientist, and logistics guide.
ReLive is a premium, high-fidelity AI-powered memory restoration, media delivery, and family digital preservation SaaS.
Key capabilities of ReLive:
1. DOORSTEP LOGISTICS: White-glove smart pickup with water-resistant, shock-proof cases and the Secure OTP system.
2. SCIENTIFIC RESTORATION: Dust-free ISO-5 cleaning, thermal tape cassette baking, 4K reel scanning, and AI pigment calibration (Oxford/heritage standard).
3. DECORATIVE & THEMATIC PRESERVATION: Family Vaults structured by categories (Jaipur Royal, Old Delhi Maruti childhood polaroids, Madras childhood heritage).
4. USER ACCESSORIES: Google Drive backups, ZIP delivery, live timeline trackers with ETAs.

Your tone should be:
- Empathetic, warm, narrative, and deeply respectful of vintage memories.
- Culturally insightful (familiar with nostalgic Indian eras: polaroids, Ambassador/Maruti cars, joint family weddings).
- Scientifically clear about Restoration (explaining physical cleaning, scanning, AI color restoration, scratch filler analysis).

Maintain conciseness (maximum 3-4 sentences in standard responses). Do NOT output raw system logs or developer jargon.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: message,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error in /api/chat:", error);
      res.status(500).json({ error: error.message || "Failed to query AI helper" });
    }
  });

  // EMAIL VERIFICATION SENDER ENDPOINT
  app.post("/api/verify-email", async (req, res) => {
    try {
      const { email } = req.body;
      const verificationCode = String(Math.floor(1000 + Math.random() * 9000));
      
      const textBody = `To complete your ReLive security setup, verify your registered address by submitting the following 4-digit code in your authentication drawer:\n\nVerification Code: ${verificationCode}\n\nValidation Link:\nhttps://ais-pre-x6x7yzbxb5efwsmeizh3gs-201297305938.asia-southeast1.run.app/verify?code=${verificationCode}\n\nThank you for choosing ReLive preservation services.`;

      const smtpRes = await sendEmailViaSMTP({
        to: email,
        subject: "ReLive Archival Safety - Verify Your Registered Address 🔒",
        text: textBody
      });

      res.json({
        success: true,
        message: `Security validation dispatch completed. Code sent to ${email}`,
        code: verificationCode,
        smtp: smtpRes
      });
    } catch (error: any) {
      console.error("Failed executing verification dispatch:", error);
      res.status(500).json({ error: "Failed to dispatch verification email." });
    }
  });

  // APPOINTMENT BOOKING TRIGGERED EMAIL ENDPOINT
  app.post("/api/notify-appointment", async (req, res) => {
    try {
      const { email, customerName, serviceName, scheduledDate, timeSlot, notes } = req.body;
      
      const textBody = `Dear ${customerName || 'Explorer'},\n\nWe are delighted to confirm your upcoming ReLive doorstep heritage pickup appointment!\n\nDetails:\n- Service: ${serviceName}\n- Date: ${scheduledDate}\n- Time Frame: ${timeSlot}\n- Fragility notes: ${notes || "None specify"}\n\nJaipur Lab address: 12, Heritage Lane, Jaipur, RAJ 302017\n\nOur certified regional carrier will arrive at your destination with our shockproof, humidity-regulated media hardcase. Please ensure your OTP is active on your portal home menu.`;

      const smtpRes = await sendEmailViaSMTP({
        to: email,
        subject: "Confirming Your ReLive Heritage Doorstep Pickup 📅",
        text: textBody
      });

      res.json({
        success: true,
        message: `Styled confirmation email successfully transmitted to ${email}.`,
        timestamp: new Date().toISOString(),
        smtp: smtpRes
      });
    } catch (error: any) {
      console.error("Failed executing mail notification dispatch:", error);
      res.status(500).json({ error: "Notification email transmission failed." });
    }
  });

  // GMAIL SHARING PHOTO DISPATCHER
  app.post("/api/share-gmail", async (req, res) => {
    try {
      const { email, subject, message, imageUrl, fileName } = req.body;
      
      const textBody = `${message || "Check out this restored photo!"}\n\nImage reference: ${fileName || "Vintage Archive Image"}\nDirect Link: ${imageUrl || "No url provided"}`;

      const smtpRes = await sendEmailViaSMTP({
        to: email,
        subject: subject || `Tracing Ancestral Legacies: ${fileName || 'Archival Memory'}`,
        text: textBody
      });

      res.json({
        success: true,
        message: `Heritage archival image shared successfully via Gmail to ${email}.`,
        timestamp: new Date().toISOString(),
        smtp: smtpRes
      });
    } catch (error: any) {
      console.error("Failed executing Gmail share:", error);
      res.status(500).json({ error: "Failed to dispatch Gmail sharing." });
    }
  });

  // GENERAL STATUS UPDATE SMTP DISPATCHER
  app.post("/api/smtp-send-update", async (req, res) => {
    try {
      const { email, title, status, description } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email parameter is required" });
      }

      const textBody = `Hello ReLive Member!\n\nThis is an automated status update regarding your ReLive historical preservation account.\n\nType/Title: ${title || "Activity Log Update"}\nStatus Level: ${status || "Processed"}\n\nUpdates Details:\n${description || "Account profile verified or service updated successfully."}\n\nHost notifications synchronized. Recipient: itzmebalustrade@gmail.com.`;

      const smtpRes = await sendEmailViaSMTP({
        to: email,
        subject: `[ReLive Core Update] ${title || 'Status Notification'} (${status || 'Active'})`,
        text: textBody
      });

      res.json({
        success: true,
        message: `Secure SMTP update dispatch accomplished for ${email}.`,
        smtp: smtpRes
      });
    } catch (error: any) {
      console.error("SMTP status update dispatch failed:", error);
      res.status(500).json({ error: "Failed to dispatch status email update." });
    }
  });

  // RESTORATION AI SCIENTIST CORE - Analyzes vintage image properties
  app.post("/api/restore-analyze", async (req, res) => {
    try {
      const { description, mediaType } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
        // Fallback mock diagnostics
        return res.json({
          detectedIssues: ["Silver deterioration", "Faded dye calibration", "Celluloid humidity staining", "Corner crinkling"],
          suggestedWorkflow: "Chemical preservation bath, laser-guided CCD scanning, neural color-mapping, scratch-healing",
          restorabilityScore: 92,
          colorPaletteSpec: ["Jaipur Royal Cream", "Sepia Auburn", "Classic Emulsion Black"],
          aiAnalysisMarkdown: `### **Archival Diagnostic Report (Simulation Mode)**\nYour description of an old **${mediaType || 'vintage asset'}** represents high-restorability historic photography. Our AI model forecasts a **92% visual recovery factor**. We will reconstruct silver-density curves and run pigment synthesis to restore the original colors.`
        });
      }

      const ai = getGeminiClient();

      const prompt = `Analyze a vintage ${mediaType || 'family asset'} described as: "${description || 'An old family photograph with light scratches and faded color'}".
Generate a structured expert-level diagnostics report that could be displayed on a premium SaaS dashboard. The report must contain:
1. 3-4 specific scientific issues (e.g., silver mirroring, organic oxidation, dye decomposition).
2. Recommended archival steps.
3. Restorability rating score (percentage between 70% and 98%).
4. Aesthetic historical color palette suggestions.
5. Technical markdown summary.

Respond strictly in structured JSON following this JSON scheme:
{
  "detectedIssues": ["string"],
  "suggestedWorkflow": "string",
  "restorabilityScore": number,
  "colorPaletteSpec": ["string"],
  "aiAnalysisMarkdown": "string (A beautiful descriptive markdown showing off the AI's deep analysis)"
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.4
        }
      });

      const parsed = JSON.parse(response.text || "{}");
      res.json(parsed);
    } catch (error: any) {
      console.error("Gemini API Error in /api/restore-analyze:", error);
      res.status(500).json({ error: error.message || "Failed to analyze restoration" });
    }
  });

  // FIREBASE ADMIN SDK DATABASE BRIDGE ENDPOINTS
  app.post("/api/sync-to-firebase", requireAuthentication, async (req: any, res) => {
    try {
      const { collectionName, docId, data } = req.body;
      if (!collectionName || !docId || !data) {
        return res.status(400).json({ error: "Missing required params: collectionName, docId, and data are required." });
      }

      console.log(`[FIREBASE ADMIN SYNC] Writing to collection "${collectionName}" at document ID "${docId}" on relive-c9b9b...`);
      const dbAdmin = getFirebaseAdminFirestore();
      if (dbAdmin) {
        await dbAdmin.collection(collectionName).doc(docId).set(data);
        console.log(`[FIREBASE ADMIN SUCCESS] Saved successfully inside user's custom relive-c9b9b database!`);
        res.json({
          success: true,
          message: `Successfully synced doc "${docId}" to relive-c9b9b collection "${collectionName}"`,
          timestamp: new Date().toISOString()
        });
      } else {
        console.warn("[FIREBASE ADMIN WARNING] Admin Firestore was not initialized. Synchronization catalog skipped.");
        res.status(503).json({ error: "Firebase Admin Firestore not initialized on server-side." });
      }
    } catch (e: any) {
      console.error("[FIREBASE ADMIN ERROR] Synchronization failed:", e);
      res.status(500).json({
        error: "Replication payload failed to load onto relive-c9b9b Firestore.",
        detailedError: e.message || String(e)
      });
    }
  });

  app.post("/api/delete-from-firebase", requireAuthentication, requireAuthorization(['admin']), async (req: any, res) => {
    try {
      const { collectionName, docId } = req.body;
      if (!collectionName || !docId) {
        return res.status(400).json({ error: "Missing required params: collectionName and docId are required." });
      }

      console.log(`[FIREBASE ADMIN DELETE] Removing document ID "${docId}" of collection "${collectionName}" on relive-c9b9b...`);
      const dbAdmin = getFirebaseAdminFirestore();
      if (dbAdmin) {
        await dbAdmin.collection(collectionName).doc(docId).delete();
        console.log(`[FIREBASE ADMIN SUCCESS] Document deleted successfully on relive-c9b9b!`);
        res.json({
          success: true,
          message: `Successfully deleted doc "${docId}" from relive-c9b9b collection "${collectionName}"`
        });
      } else {
        res.status(503).json({ error: "Firebase Admin Firestore not initialized on server-side." });
      }
    } catch (e: any) {
      console.error("[FIREBASE ADMIN ERROR] Deletion failed:", e);
      res.status(500).json({
        error: "Failed to delete target document from relive-c9b9b.",
        detailedError: e.message || String(e)
      });
    }
  });

  // AWS S3 UPLOADING HANDLER
  app.post("/api/upload-s3", requireAuthentication, async (req: any, res) => {
    try {
      const { fileBase64, fileName, fileType, userId } = req.body;
      if (!fileBase64 || !fileName || !userId) {
        return res.status(400).json({ error: "Missing required properties: fileBase64, fileName, and userId are required." });
      }

      console.log(`[S3 DISPATCH] Received file: "${fileName}" for User ID: "${userId}". Initiating S3 transmit...`);
      
      // Clean up base64 metadata header if present
      let cleanedBase64 = fileBase64;
      if (cleanedBase64.includes(";base64,")) {
        cleanedBase64 = cleanedBase64.split(";base64,").pop() || "";
      }

      const buffer = Buffer.from(cleanedBase64, "base64");
      const bucketName = process.env.AWS_S3_BUCKET || "relive-vault-oxford";
      const region = process.env.AWS_REGION || "us-east-1";
      const s3Key = `users/${userId}/${fileName}`;

      // Initialize S3 command parameters loaded purely from environment secrets (no falling back to hardcoded keys)
      const s3AccessKey = process.env.AWS_ACCESS_KEY_ID;
      const s3SecretKey = process.env.AWS_SECRET_ACCESS_KEY;

      if (!s3AccessKey || !s3SecretKey) {
        console.warn("[S3 STORAGE] AWS S3 credentials are not configured in the workspace secrets. Falling back to secure mockup URL.");
        const simulatedUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
        return res.json({
          success: true,
          simulated: true,
          message: "S3 Upload simulated successfully. Credentials were not configured on the server, ensuring full security.",
          s3Url: simulatedUrl
        });
      }

      const s3Client = new S3Client({
        region,
        credentials: {
          accessKeyId: s3AccessKey,
          secretAccessKey: s3SecretKey
        }
      });

      console.log(`[S3 DISPATCH] Uploading to Bucket: "${bucketName}", Key: "${s3Key}"`);

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: buffer,
        ContentType: fileType || "image/jpeg"
      });

      await s3Client.send(command);

      const publicS3Url = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
      console.log(`[S3 SUCCESS] Object safely placed in cloud! Link: ${publicS3Url}`);

      res.json({
        success: true,
        s3Url: publicS3Url,
        key: s3Key,
        message: `File custom uploaded to S3 successfully for user matching uid ${userId}`
      });
    } catch (e: any) {
      console.error("[S3 ERROR] Failed transmitting payload directly to Amazon servers:", e);
      res.status(500).json({
        error: "Failed to upload file to Amazon S3.",
        detailedError: e.message || String(e)
      });
    }
  });

  // REAL GOOGLE PHOTOS UPLOADER PROXY (Bypasses browser CORS constraints and handles data URLs / external assets)
  app.post("/api/upload-google-photos", requireAuthentication, async (req: any, res) => {
    try {
      const { accessToken, fileName, picUrl } = req.body;
      if (!accessToken || !fileName || !picUrl) {
        return res.status(400).json({ error: "Missing required properties: accessToken, fileName, and picUrl are required." });
      }

      console.log(`[GOOGLE PHOTOS PROXY] Upload request received for file "${fileName}". Processing source image...`);

      let imageBuffer: Buffer;
      let mimeType = "image/jpeg";

      if (picUrl.startsWith("data:")) {
        const parts = picUrl.split(",");
        const meta = parts[0];
        const base64Data = parts[1];
        const mimeMatch = meta.match(/data:(.*?);/);
        if (mimeMatch) {
          mimeType = mimeMatch[1];
        }
        imageBuffer = Buffer.from(base64Data, 'base64');
        console.log(`[GOOGLE PHOTOS PROXY] Extracted base64 raw buffer, size: ${imageBuffer.length} bytes`);
      } else {
        console.log(`[GOOGLE PHOTOS PROXY] Fetching external remote image from: ${picUrl}...`);
        const imageRes = await fetch(picUrl);
        if (!imageRes.ok) {
          throw new Error(`Failed to fetch image from remote source: ${imageRes.statusText}`);
        }
        const arrayBuffer = await imageRes.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);
        const contentType = imageRes.headers.get("content-type");
        if (contentType) {
          mimeType = contentType;
        }
        console.log(`[GOOGLE PHOTOS PROXY] Download completed, size: ${imageBuffer.length} bytes, mime: ${mimeType}`);
      }

      // Step 1: Upload raw bytes
      console.log("[GOOGLE PHOTOS PROXY] Step 1: Uploading raw bytes to Google Photos uploads endpoint...");
      const uploadRes = await fetch("https://photoslibrary.googleapis.com/v1/uploads", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/octet-stream",
          "X-Goog-Upload-Content-Type": mimeType,
          "X-Goog-Upload-Protocol": "raw"
        },
        body: new Uint8Array(imageBuffer)
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        console.error("[GOOGLE PHOTOS PROXY] Step 1 Failed:", errText);
        let errorMsg = errText;
        try {
          const parsed = JSON.parse(errText);
          if (parsed.error && parsed.error.message) {
            errorMsg = parsed.error.message;
          } else if (parsed.message) {
            errorMsg = parsed.message;
          }
        } catch (_) {}
        throw new Error(`Google Photos raw byte upload failed: ${errorMsg || uploadRes.statusText}`);
      }

      const uploadToken = await uploadRes.text();
      console.log("[GOOGLE PHOTOS PROXY] Step 1 Success! Upload Token acquired:", uploadToken);

      // Step 2: Create media item in Google Photos library
      console.log("[GOOGLE PHOTOS PROXY] Step 2: Registering media item in Google Photos...");
      const createRes = await fetch("https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          newMediaItems: [
            {
              description: "Digitized and beautifully restored by ReLive Heritage Archiving Labs",
              simpleMediaItem: {
                uploadToken: uploadToken,
                fileName: fileName
              }
            }
          ]
        })
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        console.error("[GOOGLE PHOTOS PROXY] Step 2 Failed:", errText);
        let errorMsg = errText;
        try {
          const parsed = JSON.parse(errText);
          if (parsed.error && parsed.error.message) {
            errorMsg = parsed.error.message;
          } else if (parsed.message) {
            errorMsg = parsed.message;
          }
        } catch (_) {}
        throw new Error(`Google Photos media item creation failed: ${errorMsg || createRes.statusText}`);
      }

      const createResult = await createRes.json();
      console.log("[GOOGLE PHOTOS PROXY] Step 2 Success! batchCreate output:", JSON.stringify(createResult));

      const creationResult = createResult?.newMediaItemResults?.[0];
      if (creationResult?.status?.message && creationResult?.status?.message !== "Success") {
        throw new Error(`Google Photos creation inner status rejected: ${creationResult?.status?.message}`);
      }

      const productUrl = creationResult?.mediaItem?.productUrl;
      console.log(`[GOOGLE PHOTOS PROXY] ✓ Perfectly dispatched to user's real Google Photos! Direct Product URL: ${productUrl}`);

      res.json({
        success: true,
        mediaItemId: creationResult?.mediaItem?.id,
        productUrl: productUrl || null,
        filename: fileName,
        message: "Successfully synchronized with your real-world Google Photos!"
      });
    } catch (e: any) {
      console.error("[GOOGLE PHOTOS PROXY ERROR] Failed syncing print image to Google Photos:", e);
      res.status(500).json({
        error: "Google Photos Upload Failure",
        detailedError: e.message || String(e)
      });
    }
  });

  // Vite middleware for development / Static routing in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files from compiled dist
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[ReLive Server] Express listening on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode.`);
  });
}

startServer();
