import { HealthService } from './health.service';
export declare class HealthController {
    private readonly healthService;
    constructor(healthService: HealthService);
    getHealth(): Promise<{
        ok: boolean;
        service: string;
        db: string;
        timestamp: string;
    }>;
}
