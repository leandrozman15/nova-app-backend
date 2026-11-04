-- CreateTable
CREATE TABLE "MunicipalProgram" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "municipalityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discipline" TEXT,
    "audience" TEXT,
    "location" TEXT,
    "scheduleText" TEXT,
    "capacity" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'open',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MunicipalProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramEnrollment" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dni" TEXT,
    "dniHash" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "birthDate" TIMESTAMP(3),
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramAttendance" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MunicipalProgram_companyId_municipalityId_idx" ON "MunicipalProgram"("companyId", "municipalityId");

-- CreateIndex
CREATE INDEX "ProgramEnrollment_programId_idx" ON "ProgramEnrollment"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramEnrollment_programId_dniHash_key" ON "ProgramEnrollment"("programId", "dniHash");

-- CreateIndex
CREATE INDEX "ProgramAttendance_programId_date_idx" ON "ProgramAttendance"("programId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramAttendance_enrollmentId_date_key" ON "ProgramAttendance"("enrollmentId", "date");

-- AddForeignKey
ALTER TABLE "MunicipalProgram" ADD CONSTRAINT "MunicipalProgram_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MunicipalProgram" ADD CONSTRAINT "MunicipalProgram_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramEnrollment" ADD CONSTRAINT "ProgramEnrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "MunicipalProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAttendance" ADD CONSTRAINT "ProgramAttendance_programId_fkey" FOREIGN KEY ("programId") REFERENCES "MunicipalProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAttendance" ADD CONSTRAINT "ProgramAttendance_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ProgramEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
