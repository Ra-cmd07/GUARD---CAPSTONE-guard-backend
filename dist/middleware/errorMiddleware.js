"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, req, res, next) {
    // Log contextual information to help debugging without overwhelming logs
    try {
        const ctx = {
            method: req.method,
            path: req.originalUrl || req.url,
            bodyPreview: typeof req.body === 'string' ? req.body.slice(0, 200) : JSON.stringify(req.body || {}).slice(0, 200),
        };
        console.error('❌ Unhandled error:', err, ctx);
    }
    catch (e) {
        console.error('❌ Unhandled error (logging failed):', err);
    }
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    res.status(status).json({ error: message });
}
