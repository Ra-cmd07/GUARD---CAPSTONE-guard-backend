import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'fallback_secret_change_this';

export type UserRole = 'admin' | 'teacher' | 'parent' | 'student';

export interface TokenPayload {
  id:       number;
  username: string;
  role:     UserRole;
  profileId?: number; // teacher.id / parent.id / student.id
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: '8h' });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, SECRET) as TokenPayload;
}
