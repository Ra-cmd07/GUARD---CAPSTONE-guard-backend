import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload, UserRole } from '../lib/auth';

// Extend Express Request to carry the decoded user
export interface AuthRequest extends Request {
  user?: TokenPayload;
  /** @deprecated use req.user */
  teacher?: TokenPayload;
}

/** Verify JWT and attach req.user */
export function protect(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers['authorization'];

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized — no token provided' });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = verifyToken(token);
    req.user    = payload;
    req.teacher = payload; // backwards-compat
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized — invalid or expired token' });
  }
}

/** Allow only specific roles */
export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
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
