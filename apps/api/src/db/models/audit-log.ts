import { Schema, model, type Types } from "mongoose";

export interface AuditLogFields {
  userId?: Types.ObjectId;
  actor: string;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

const auditLogSchema = new Schema<AuditLogFields>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    actor: { type: String, required: true },
    action: { type: String, required: true },
    targetType: { type: String },
    targetId: { type: String },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
    requestId: { type: String },
  },
  {
    timestamps: true,
  },
);

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

export const AuditLogModel = model<AuditLogFields>("AuditLog", auditLogSchema);
