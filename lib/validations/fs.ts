import { z } from 'zod';

const VALID_NAME = z
  .string()
  .min(1, 'Name is required')
  .max(255, 'Name too long')
  .refine((n) => !n.includes('/'), 'Name cannot contain slashes')
  .refine((n) => n !== '.' && n !== '..', 'Invalid name');

export const createNodeSchema = z.object({
  name: VALID_NAME,
  type: z.enum(['FILE', 'DIRECTORY']),
  parentId: z.string().cuid().optional(),
  content: z.string().max(10 * 1024 * 1024, 'File too large').optional(), // 10MB text limit
  mimeType: z.string().max(100).optional(),
});

export const updateNodeSchema = z.object({
  content: z.string().max(10 * 1024 * 1024).optional(),
  name: VALID_NAME.optional(),
});

export const moveNodeSchema = z.object({
  newParentId: z.string().cuid().nullable(),
});

export const copyNodeSchema = z.object({
  newParentId: z.string().cuid().nullable(),
  newName: VALID_NAME.optional(),
});

export const grantPermissionSchema = z.object({
  userId: z.string().cuid(),
  level: z.enum(['VIEWER', 'EDITOR', 'OWNER']),
});

export const searchSchema = z.object({
  q: z.string().min(1).max(255),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateNodeInput = z.infer<typeof createNodeSchema>;
export type UpdateNodeInput = z.infer<typeof updateNodeSchema>;
export type MoveNodeInput = z.infer<typeof moveNodeSchema>;
export type CopyNodeInput = z.infer<typeof copyNodeSchema>;
export type GrantPermissionInput = z.infer<typeof grantPermissionSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
