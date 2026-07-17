import { PrismaService } from '../prisma/prisma.service';
export declare class UsersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listByCompany(companyId: string): import("@prisma/client").Prisma.PrismaPromise<{
        email: string;
        id: string;
        firebaseUid: string;
        name: string | null;
        role: string;
        companyId: string;
        createdAt: Date;
    }[]>;
}
