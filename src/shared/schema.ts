import { z } from 'zod'
import { draftFields, statusOptions } from './types'

const draftFieldSchema = z.enum(draftFields)
const isHttpUrl = (value: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}
const httpUrlSchema = z.string().url().max(2048).refine(isHttpUrl)

const draftFieldsSchema = z.object({
  title: z.string().max(500),
  company: z.string().max(500),
  location: z.string().max(500),
  workMode: z.string().max(200),
  salary: z.string().max(200),
  employmentType: z.string().max(200),
})

export const globalDraftSchema = z.object({
  status: z.enum(['provisional', 'locked', 'submitted']),
  fields: draftFieldsSchema,
  userEdited: z.object({
    title: z.literal(true).optional(),
    company: z.literal(true).optional(),
    jobUrl: z.literal(true).optional(),
    location: z.literal(true).optional(),
    workMode: z.literal(true).optional(),
    salary: z.literal(true).optional(),
    employmentType: z.literal(true).optional(),
  }),
  jobUrl: z.string().max(2048),
  currentPageUrl: z.string().max(2048),
  sourceHost: z.string().max(255),
  id: z.string().optional(),
  jobId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lockedAt: z.string().datetime().optional(),
  submittedAt: z.string().datetime().optional(),
  notified: z.boolean().optional(),
  expiresAt: z.number().finite(),
  flowTabIds: z.array(z.number().int().nonnegative()).optional(),
})

export const globalDraftStateSchema = z.object({
  draft: globalDraftSchema.optional(),
  suppressedJobUrl: z.string().max(2048).optional(),
})

export const popupDraftCacheEntrySchema = z.object({
  url: httpUrlSchema,
  draft: globalDraftSchema,
  cachedAt: z.number().finite(),
})

export const draftCaptureSchema = z.object({
  id: z.string().optional(),
  jobId: z.string().optional(),
  fields: draftFieldsSchema.extend({
    title: z.string().max(500),
    company: z.string().max(500),
  }),
  jobUrl: z.string().url(),
  sourceHost: z.string().min(1).max(255),
}).strict().superRefine((capture, context) => {
  if (!capture.fields.title.trim() && !capture.fields.company.trim()) {
    context.addIssue({
      code: 'custom',
      message: 'A capture must contain a title or company.',
      path: ['fields'],
    })
  }
})

const currentPageSchema = z.object({
  currentPageUrl: z.string().max(2048),
})

const pageStateSchema = currentPageSchema.extend({
  currentPageUrl: z.string().url(),
  capture: draftCaptureSchema.optional(),
  strongSignal: z.boolean(),
}).strict()

export const globalDraftMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('GET_GLOBAL_DRAFT') }).strict(),
  z.object({
    type: z.literal('GET_POPUP_DRAFT'),
    payload: currentPageSchema.extend({ currentPageUrl: httpUrlSchema }).strict(),
  }).strict(),
  z.object({ type: z.literal('GET_DRAFT_STATUS') }).strict(),
  z.object({
    type: z.literal('CACHE_POPUP_DRAFT'),
    payload: z.object({
      draft: globalDraftSchema,
      urls: z.array(httpUrlSchema).min(1).max(4),
    }).strict(),
  }).strict(),
  z.object({
    type: z.literal('CLEAR_POPUP_DRAFT_CACHE'),
    payload: z.object({ urls: z.array(httpUrlSchema).max(4) }).strict(),
  }).strict(),
  z.object({
    type: z.literal('RESTORE_GLOBAL_DRAFT'),
    payload: z.object({ draft: globalDraftSchema }).strict(),
  }).strict(),
  z.object({
    type: z.literal('PAGE_STATE'),
    payload: pageStateSchema,
  }).strict(),
  z.object({
    type: z.literal('LOCK_DRAFT'),
    payload: currentPageSchema.extend({ capture: draftCaptureSchema.optional() }).strict(),
  }).strict(),
  z.object({
    type: z.literal('EDIT_DRAFT'),
    payload: currentPageSchema.extend({
      field: draftFieldSchema,
      value: z.string().max(2048),
      sourceHost: z.string().max(255),
    }).strict(),
  }).strict(),
  z.object({
    type: z.literal('APPLICATION_SUBMITTED'),
    payload: currentPageSchema.extend({ text: z.string().min(1).max(249) }).strict(),
  }).strict(),
  z.object({
    type: z.literal('REFRESH_DRAFT'),
    payload: currentPageSchema.extend({
      capture: draftCaptureSchema.optional(),
    }).strict(),
  }).strict(),
  z.object({
    type: z.literal('SAVE_DRAFT'),
    payload: z.object({ jobUrl: z.string().url() }).strict(),
  }).strict(),
])

export const jobSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().optional(),
  title: z.string().min(1),
  company: z.string().min(1),
  url: z.string().url(),
  applicationUrl: z.string().url().optional(),
  status: z.enum(statusOptions),
  statusHistory: z.array(z.object({
    status: z.enum(statusOptions),
    changedAt: z.string().datetime(),
  })).optional(),
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
