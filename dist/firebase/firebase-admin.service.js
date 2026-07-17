"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirebaseAdminService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const node_fs_1 = require("node:fs");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
let FirebaseAdminService = class FirebaseAdminService {
    configService;
    constructor(configService) {
        this.configService = configService;
    }
    onModuleInit() {
        if ((0, app_1.getApps)().length > 0)
            return;
        const projectId = this.configService.get('FIREBASE_PROJECT_ID');
        const serviceAccountPath = this.configService.get('FIREBASE_ADMIN_CREDENTIALS_PATH', '/etc/secrets/firebase-admin.json');
        if (!serviceAccountPath) {
            throw new Error('Missing FIREBASE_ADMIN_CREDENTIALS_PATH');
        }
        const serviceAccount = JSON.parse((0, node_fs_1.readFileSync)(serviceAccountPath, 'utf-8'));
        (0, app_1.initializeApp)({
            credential: (0, app_1.cert)(serviceAccount),
            projectId,
        });
    }
    get auth() {
        return (0, auth_1.getAuth)();
    }
};
exports.FirebaseAdminService = FirebaseAdminService;
exports.FirebaseAdminService = FirebaseAdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], FirebaseAdminService);
//# sourceMappingURL=firebase-admin.service.js.map