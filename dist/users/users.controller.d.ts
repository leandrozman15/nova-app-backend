import { UsersService } from './users.service';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    list(req: unknown): Promise<{
        email: string;
        id: string;
        firebaseUid: string;
        name: string | null;
        role: string;
        companyId: string;
        createdAt: Date;
    }[]>;
}
