"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = require("http");
const https_1 = require("https");
const net_1 = __importDefault(require("net"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
// Resolve the machine's primary non-loopback IPv4 address at runtime
function getLocalIP() {
    const ifaces = os_1.default.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
        // Skip VirtualBox and loopback adapters
        if (/virtualbox|vboxnet|vmware|loopback/i.test(name))
            continue;
        for (const iface of ifaces[name] ?? []) {
            if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('192.168.56.')) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}
const socketHandler_1 = require("./src/websocket/socketHandler");
dotenv_1.default.config();
// ─── Route imports ────────────────────────────────────────────────────
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
const attendanceRoutes_1 = __importDefault(require("./routes/attendanceRoutes"));
const studentRoutes_1 = __importDefault(require("./routes/studentRoutes"));
const guardianRoutes_1 = __importDefault(require("./routes/guardianRoutes"));
const scanPhotoRoutes_1 = __importDefault(require("./routes/scanPhotoRoutes"));
const bleRoutes_1 = __importDefault(require("./routes/bleRoutes"));
const bleScanRoutes_1 = __importDefault(require("./routes/bleScanRoutes"));
const rfidRoutes_1 = __importDefault(require("./routes/rfidRoutes"));
const kioskRoutes_1 = __importDefault(require("./routes/kioskRoutes"));
const locationRoutes_1 = __importDefault(require("./routes/locationRoutes"));
const bleApprovalRoutes_1 = __importDefault(require("./routes/bleApprovalRoutes"));
const rfidApprovalRoutes_1 = __importDefault(require("./routes/rfidApprovalRoutes"));
const reportsRoutes_1 = __importDefault(require("./routes/reportsRoutes"));
const kiosksRoutes_1 = __importDefault(require("./routes/kiosksRoutes"));
const gsmRoutes_1 = __importDefault(require("./routes/gsmRoutes"));
const teacherRoutes_1 = __importDefault(require("./routes/teacherRoutes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const excuseRoutes_1 = __importDefault(require("./routes/excuseRoutes"));
const messageRoutes_1 = __importDefault(require("./routes/messageRoutes"));
const alertRoutes_1 = __importDefault(require("./routes/alertRoutes"));
const announcementRoutes_1 = __importDefault(require("./routes/announcementRoutes"));
const sf1Routes_1 = __importDefault(require("./routes/sf1Routes"));
const fingerprintRoutes_1 = __importDefault(require("./routes/fingerprintRoutes"));
const assignmentRoutes_1 = __importDefault(require("./routes/assignmentRoutes"));
const recentAttendanceRoutes_1 = __importDefault(require("./routes/recentAttendanceRoutes"));
const sf2Routes_1 = __importDefault(require("./routes/sf2Routes"));
const settingsRoutes_1 = __importDefault(require("./routes/settingsRoutes"));
const buildingRoutes_1 = __importDefault(require("./routes/buildingRoutes"));
const anchorRoutes_1 = __importDefault(require("./routes/anchorRoutes"));
const attendanceAlertController_1 = require("./controllers/attendanceAlertController");
const errorMiddleware_1 = require("./middleware/errorMiddleware");
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '5000');
// ─── Core Middleware ──────────────────────────────────────────────────
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false, // Disable CSP to allow images from same origin
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false, // IMPORTANT: Disable this to allow image loading!
}));
app.use((0, cors_1.default)({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json({ limit: '10mb' }));
// Catch malformed JSON bodies and return a friendlier error
app.use((err, _req, res, next) => {
    if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
        console.error('Malformed JSON body:', err.message || err);
        return res.status(400).json({ error: 'Malformed JSON in request body' });
    }
    return next(err);
});
app.use(express_1.default.urlencoded({ extended: true }));
// ─── Static Files ─────────────────────────────────────────────────────
// Handle both dev (ts-node from root) and prod (node from dist/) modes
const uploadsPath = __dirname.endsWith('dist')
    ? path_1.default.join(__dirname, '..', 'uploads') // Production: dist/server.js -> ../uploads
    : path_1.default.join(__dirname, 'uploads'); // Development: server.ts -> ./uploads
console.log('📁 Serving static uploads from:', path_1.default.resolve(uploadsPath));
// Serve uploads with proper CORS headers - FIX: Use * to allow all origins
app.use('/uploads', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    }
    else {
        next();
    }
}, express_1.default.static(uploadsPath));
// ─── API Routes ────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes_1.default);
app.use('/api/admin', adminRoutes_1.default);
app.use('/api/admin/assignments', assignmentRoutes_1.default);
app.use('/api/attendance', attendanceRoutes_1.default);
app.use('/api/attendance', recentAttendanceRoutes_1.default); // Recent attendance with teacher/parent details
app.use('/api/students', studentRoutes_1.default);
app.use('/api/guardians', guardianRoutes_1.default);
app.use('/api/scan-photos', scanPhotoRoutes_1.default);
app.use('/api/ble', bleRoutes_1.default);
app.use('/api/attendance', bleScanRoutes_1.default); // BLE scan for web kiosk
app.use('/api/ble', bleApprovalRoutes_1.default); // BLE pending approval routes
app.use('/api/rfid', rfidApprovalRoutes_1.default); // RFID approval routes FIRST (/detect, /pending, /approve, /reject)
app.use('/api/rfid', rfidRoutes_1.default); // Old RFID routes second (/logs, /dashboard)
app.use('/api/kiosk', kioskRoutes_1.default);
app.use('/api/location', locationRoutes_1.default);
app.use('/api/reports', reportsRoutes_1.default);
app.use('/api/kiosks', kiosksRoutes_1.default);
app.use('/api/gsm', gsmRoutes_1.default);
app.use('/api/teacher', teacherRoutes_1.default);
app.use('/api/notifications', notificationRoutes_1.default);
app.use('/api/excuse', excuseRoutes_1.default);
app.use('/api/messages', messageRoutes_1.default);
app.use('/api/alerts', alertRoutes_1.default);
app.use('/api/announcements', announcementRoutes_1.default);
app.use('/api/sf1', sf1Routes_1.default);
app.use('/api/fingerprint', fingerprintRoutes_1.default);
app.use('/api/sf2', sf2Routes_1.default);
app.use('/api/settings', settingsRoutes_1.default);
app.use('/api', buildingRoutes_1.default);
app.use('/api/anchors', anchorRoutes_1.default); // ESP32 Plug-and-Play configuration
// ─── Health Check ─────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// ─── 404 Handler ──────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found' });
});
// ─── Global Error Handler ─────────────────────────────────────────────
app.use(errorMiddleware_1.errorHandler);
// ─── Start Server ─────────────────────────────────────────────────────
// Check if HTTPS certificates exist
const certPath = path_1.default.resolve(__dirname, 'certs/localhost.pem');
const keyPath = path_1.default.resolve(__dirname, 'certs/localhost-key.pem');
const httpsEnabled = fs_1.default.existsSync(certPath) && fs_1.default.existsSync(keyPath);
let server;
if (httpsEnabled) {
    // HTTPS mode - enables camera on phone
    const httpsOptions = {
        key: fs_1.default.readFileSync(keyPath),
        cert: fs_1.default.readFileSync(certPath),
    };
    server = (0, https_1.createServer)(httpsOptions, app);
    console.log('🔒 HTTPS mode enabled');
}
else {
    // HTTP fallback
    server = (0, http_1.createServer)(app);
    console.log('⚠️  HTTP mode (no certificates found)');
}
// Initialize WebSocket
const io = (0, socketHandler_1.initializeWebSocket)(server);
exports.io = io;
// Handle server errors (e.g. port in use) and exit so nodemon restarts cleanly
server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Another process may be running.`);
        process.exit(1);
    }
    console.error('Server error:', err);
    process.exit(1);
});
// Probe for an available port starting from desired PORT and try up to +5
async function findAvailablePort(startPort, attempts = 6) {
    function isAvailable(port) {
        return new Promise((resolve) => {
            const socket = new net_1.default.Socket();
            socket.setTimeout(500);
            socket.once('connect', () => {
                socket.destroy();
                resolve(false); // in use
            });
            socket.once('timeout', () => {
                socket.destroy();
                resolve(true);
            });
            socket.once('error', (err) => {
                // ECONNREFUSED means nothing is listening -> available
                if (err && (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND'))
                    resolve(true);
                else
                    resolve(false);
            });
            socket.connect(port, '127.0.0.1');
        });
    }
    for (let i = 0; i < attempts; i++) {
        const p = startPort + i;
        // eslint-disable-next-line no-await-in-loop
        const ok = await isAvailable(p);
        if (ok)
            return p;
    }
    return startPort; // fallback
}
(async () => {
    const chosenPort = await findAvailablePort(PORT, 6);
    server.listen(chosenPort, '0.0.0.0', () => {
        const proto = httpsEnabled ? 'https' : 'http';
        console.log(`🚀 AttendBox API running at ${proto}://0.0.0.0:${chosenPort}`);
        console.log(`   Local:   ${proto}://localhost:${chosenPort}`);
        console.log(`   Network: ${proto}://${getLocalIP()}:${chosenPort}`);
        console.log(`🔌 WebSocket server ready for real-time updates`);
        console.log(`📤 Background upload queue initialized`);
        // ── HTTP companion server for mobile app (avoids self-signed cert issues) ──
        // React Native rejects self-signed HTTPS certs, so we expose a plain HTTP
        // listener on port 5001 for the Attendbox Mobile app only.
        if (httpsEnabled && process.env.DISABLE_HTTP_MOBILE !== 'true') {
            const HTTP_MOBILE_PORT = Number(process.env.HTTP_MOBILE_PORT) || 5001;
            const httpMobileServer = (0, http_1.createServer)(app);
            httpMobileServer.listen(HTTP_MOBILE_PORT, '0.0.0.0', () => {
                const localIP = getLocalIP();
                console.log(`📱 HTTP mobile port: http://${localIP}:${HTTP_MOBILE_PORT}/api  (for Attendbox Mobile app)`);
            });
        }
        // ── Daily attendance threshold check ─────────────────────────────
        const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
        const runWithDelay = () => {
            setTimeout(async () => {
                await (0, attendanceAlertController_1.checkAttendanceThresholds)();
                setInterval(attendanceAlertController_1.checkAttendanceThresholds, RUN_INTERVAL_MS);
            }, 60000);
        };
        runWithDelay();
        console.log(`⏰ Attendance threshold checker scheduled (runs daily)`);
    });
})();
exports.default = app;
