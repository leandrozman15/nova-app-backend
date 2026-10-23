import { Request } from 'express';

export interface AuthContext {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  mfa?: boolean;
  role?: string;
  companyId?: string;
  clubId?: string;
  leagueId?: string;
  roles?: string[];
}

export interface RequestWithAuth extends Request {
  auth?: AuthContext;
  companyId?: string;
}
