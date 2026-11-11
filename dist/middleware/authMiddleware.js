"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.protect = protect;
exports.requireRole = requireRole;
const auth_1 = require("../lib/auth");
/** Verify JWT and attach req.user */
function protect(req, res, next) {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized — no token provided' });
        return;
    }
    const token = header.slice(7);
    try {
        const payload = (0, auth_1.verifyToken)(token);
        req.user = payload;
        req.teacher = payload; // backwards-compat
        next();
    }
    catch {
        res.status(401).json({ error: 'Unauthorized — invalid or expired token' });
    }
}
/** Allow only specific roles */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        if (!roles.includes(req.user.role)) {
            res.status(403).json({ error: `Forbidden — requires role: ${roles.join(' or ')}` });
            return;
        }
        next();
    };
}
