import { PrismaService } from '../prisma/prisma.service';
export declare class HealthService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    check(): Promise<{
        ok: boolean;
        service: string;
        db: string;
        timestamp: string;
    }>;
}
