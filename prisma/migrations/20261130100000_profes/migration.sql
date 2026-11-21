-- Profes: perfil, vínculos con clubes, tipos de clase, agenda, alumnos, packs y pagos.

CREATE TABLE "CoachProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "photoUrl" TEXT,
    "bio" TEXT,
    "sports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "levels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "zones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "whatsapp" TEXT,
    "instagram" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoachProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CoachProfile_userId_key" ON "CoachProfile"("userId");
CREATE UNIQUE INDEX "CoachProfile_slug_key" ON "CoachProfile"("slug");
CREATE INDEX "CoachProfile_isPublic_status_idx" ON "CoachProfile"("isPublic", "status");
ALTER TABLE "CoachProfile" ADD CONSTRAINT "CoachProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CoachClubLink" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoachClubLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CoachClubLink_coachId_clubId_key" ON "CoachClubLink"("coachId", "clubId");
CREATE INDEX "CoachClubLink_clubId_status_idx" ON "CoachClubLink"("clubId", "status");
ALTER TABLE "CoachClubLink" ADD CONSTRAINT "CoachClubLink_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachClubLink" ADD CONSTRAINT "CoachClubLink_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CoachClassType" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "price" DECIMAL(12,2) NOT NULL,
    "sport" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoachClassType_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CoachClassType_format_check" CHECK ("format" IN ('INDIVIDUAL', 'DUO', 'GROUP')),
    CONSTRAINT "CoachClassType_values_check" CHECK ("capacity" > 0 AND "durationMinutes" > 0 AND "price" >= 0)
);
CREATE INDEX "CoachClassType_coachId_active_idx" ON "CoachClassType"("coachId", "active");
ALTER TABLE "CoachClassType" ADD CONSTRAINT "CoachClassType_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CoachAvailability" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "clubId" TEXT,
    "facilityId" TEXT,
    "locationText" TEXT,
    CONSTRAINT "CoachAvailability_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CoachAvailability_time_check" CHECK ("weekday" BETWEEN 0 AND 6 AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute")
);
CREATE INDEX "CoachAvailability_coachId_weekday_idx" ON "CoachAvailability"("coachId", "weekday");
ALTER TABLE "CoachAvailability" ADD CONSTRAINT "CoachAvailability_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CoachBlock" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    CONSTRAINT "CoachBlock_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CoachBlock_time_check" CHECK ("endsAt" > "startsAt")
);
CREATE INDEX "CoachBlock_coachId_startsAt_idx" ON "CoachBlock"("coachId", "startsAt");
ALTER TABLE "CoachBlock" ADD CONSTRAINT "CoachBlock_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CoachStudent" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "level" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoachStudent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CoachStudent_coachId_userId_key" ON "CoachStudent"("coachId", "userId");
CREATE INDEX "CoachStudent_coachId_active_idx" ON "CoachStudent"("coachId", "active");
ALTER TABLE "CoachStudent" ADD CONSTRAINT "CoachStudent_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachStudent" ADD CONSTRAINT "CoachStudent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CoachLesson" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "classTypeId" TEXT,
    "date" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "format" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(12,2) NOT NULL,
    "clubId" TEXT,
    "facilityId" TEXT,
    "locationText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "openToJoin" BOOLEAN NOT NULL DEFAULT false,
    "bookingId" TEXT,
    "notes" TEXT,
    "cancelReason" TEXT,
    "createdByUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoachLesson_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CoachLesson_status_check" CHECK ("status" IN ('REQUESTED', 'CONFIRMED', 'DONE', 'CANCELLED', 'REJECTED')),
    CONSTRAINT "CoachLesson_time_check" CHECK ("durationMinutes" > 0 AND "endsAt" > "startsAt")
);
CREATE UNIQUE INDEX "CoachLesson_bookingId_key" ON "CoachLesson"("bookingId");
CREATE INDEX "CoachLesson_coachId_date_idx" ON "CoachLesson"("coachId", "date");
CREATE INDEX "CoachLesson_coachId_status_idx" ON "CoachLesson"("coachId", "status");
ALTER TABLE "CoachLesson" ADD CONSTRAINT "CoachLesson_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachLesson" ADD CONSTRAINT "CoachLesson_classTypeId_fkey" FOREIGN KEY ("classTypeId") REFERENCES "CoachClassType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- El profe no puede tener dos clases activas superpuestas.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "CoachLesson" ADD CONSTRAINT "CoachLesson_no_overlap"
  EXCLUDE USING gist ("coachId" WITH =, tsrange("startsAt", "endsAt") WITH &&)
  WHERE ("status" IN ('REQUESTED', 'CONFIRMED'));

CREATE TABLE "CoachPack" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalClasses" INTEGER NOT NULL,
    "usedClasses" INTEGER NOT NULL DEFAULT 0,
    "price" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expiresAt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoachPack_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CoachPack_values_check" CHECK ("totalClasses" > 0 AND "usedClasses" >= 0 AND "usedClasses" <= "totalClasses" AND "price" >= 0)
);
CREATE INDEX "CoachPack_studentId_idx" ON "CoachPack"("studentId");
ALTER TABLE "CoachPack" ADD CONSTRAINT "CoachPack_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "CoachStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CoachLessonParticipant" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "attendance" TEXT,
    "charge" TEXT,
    "packId" TEXT,
    "partnerName" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoachLessonParticipant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CoachLessonParticipant_lessonId_studentId_key" ON "CoachLessonParticipant"("lessonId", "studentId");
CREATE INDEX "CoachLessonParticipant_studentId_idx" ON "CoachLessonParticipant"("studentId");
ALTER TABLE "CoachLessonParticipant" ADD CONSTRAINT "CoachLessonParticipant_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "CoachLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachLessonParticipant" ADD CONSTRAINT "CoachLessonParticipant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "CoachStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachLessonParticipant" ADD CONSTRAINT "CoachLessonParticipant_packId_fkey" FOREIGN KEY ("packId") REFERENCES "CoachPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CoachStudentNote" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lessonId" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoachStudentNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CoachStudentNote_studentId_createdAt_idx" ON "CoachStudentNote"("studentId", "createdAt");
ALTER TABLE "CoachStudentNote" ADD CONSTRAINT "CoachStudentNote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "CoachStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CoachPayment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT NOT NULL,
    "packId" TEXT,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoachPayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CoachPayment_amount_check" CHECK ("amount" > 0)
);
CREATE INDEX "CoachPayment_studentId_paidAt_idx" ON "CoachPayment"("studentId", "paidAt");
ALTER TABLE "CoachPayment" ADD CONSTRAINT "CoachPayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "CoachStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachPayment" ADD CONSTRAINT "CoachPayment_packId_fkey" FOREIGN KEY ("packId") REFERENCES "CoachPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
