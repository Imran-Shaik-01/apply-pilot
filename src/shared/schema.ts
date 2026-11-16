import { z } from 'zod'

export const jobSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().optional(),
  title: z.string().min(1),
  company: z.string().min(1),
  url: z.string().url(),
  applicationUrl: z.string().url().optional(),
  status: z.enum(['Applied', 'Interviewing', 'Offer', 'Rejected', 'Withdrawn', 'Ghosted']),
  source: z.string().min(1),
  appliedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  location: z.string().optional(),
  workMode: z.string().optional(),
  salary: z.string().optional(),
  employmentType: z.string().optional(),
  notes: z.string().optional(),
  recruiter: z.string().optional(),
  platform: z.string().optional(),
})

export const settingsSchema = z.object({
  enabled: z.boolean().default(true),
  weekStartDay: z.number().int().min(0).max(6).default(1),
})

export const popupDraftSchema = z.object({
  title: z.string().max(500),
  company: z.string().max(500),
  location: z.string().max(500),
  workMode: z.string().max(200),
  salary: z.string().max(200),
  employmentType: z.string().max(200),
  pageUrl: z.string().max(4096),
  autoCaptured: z.boolean().optional(),
})
