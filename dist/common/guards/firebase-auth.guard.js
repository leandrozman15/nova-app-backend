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
exports.FirebaseAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const firebase_admin_service_1 = require("../../firebase/firebase-admin.service");
const public_decorator_1 = require("../decorators/public.decorator");
let FirebaseAuthGuard = class FirebaseAuthGuard {
    reflector;
    firebaseAdminService;
    constructor(reflector, firebaseAdminService) {
        this.reflector = reflector;
        this.firebaseAdminService = firebaseAdminService;
    }
    async canActivate(context) {
        const isPublic = this.reflector.getAllAndOverride(public_decorator_1.IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic)
            return true;
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new common_1.UnauthorizedException('Missing Bearer token');
        }
        const idToken = authHeader.slice(7);
        try {
            const decoded = await this.firebaseAdminService.auth.verifyIdToken(idToken);
            request.auth = {
                uid: decoded.uid,
                email: decoded.email,
            };
            return true;
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid Firebase token');
        }
    }
};
exports.FirebaseAuthGuard = FirebaseAuthGuard;
exports.FirebaseAuthGuard = FirebaseAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        firebase_admin_service_1.FirebaseAdminService])
], FirebaseAuthGuard);
//# sourceMappingURL=firebase-auth.guard.js.map