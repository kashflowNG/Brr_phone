import { z } from "zod";

export const apkFileSchema = z.object({
  id: z.string(),
  filename: z.string(),
  originalName: z.string(),
  size: z.number(),
  uploadedAt: z.date(),
  path: z.string(),
});

export const insertApkFileSchema = apkFileSchema.partial({ id: true, uploadedAt: true });

export type ApkFile = z.infer<typeof apkFileSchema>;
export type InsertApkFile = z.infer<typeof insertApkFileSchema>;