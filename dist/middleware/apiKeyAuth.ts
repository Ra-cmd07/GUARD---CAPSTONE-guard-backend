import { Request, Response, NextFunction } from 'express';

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
            status: 'error',
            error: 'Missing or invalid Authorization header',
            hint: 'Use: Authorization: Bearer YOUR_API_KEY'
        });
        return;
    }

    const token = authHeader.slice(7);

    if (token !== process.env.API_KEY) {
        console.warn(`❌ Invalid API key attempt from ${req.ip}`);
        res.status(403).json({
            status: 'error',
            error: 'Invalid API key'
        });
        return;
    }

    next();
}