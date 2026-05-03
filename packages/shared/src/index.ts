import { z } from 'zod';

export const SubmissionTypeSchema = z.enum(['photo', 'video']);
export type SubmissionTypeT = z.infer<typeof SubmissionTypeSchema>;

export const SubmissionInputSchema = z.object({
  eventId: z.string().min(1),
  stageId: z.string().optional(),
  type: SubmissionTypeSchema,
  contributorName: z.string().max(80).optional(),
  contributorEmail: z.string().email().optional(),
  anonymous: z.boolean().default(true),
  consent: z.literal(true),
  turnstileToken: z.string().min(1),
});
export type SubmissionInput = z.infer<typeof SubmissionInputSchema>;

export const EventSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  active: z.boolean(),
  stages: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      order: z.number(),
      scheduledAt: z.string().nullable(),
    }),
  ),
});
export type EventSummary = z.infer<typeof EventSummarySchema>;

export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
