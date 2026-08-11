-- CreateIndex
CREATE INDEX "AdminAudit_createdAt_idx" ON "AdminAudit"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Inquiry_createdAt_idx" ON "Inquiry"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt" DESC);

