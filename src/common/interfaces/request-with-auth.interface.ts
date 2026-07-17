import { Request } from 'express';

export interface AuthContext {
  uid: string;
  email?: string;
  role?: string;
}

export interface RequestWithAuth extends Request {
  auth?: AuthContext;
  companyId?: string;
}
