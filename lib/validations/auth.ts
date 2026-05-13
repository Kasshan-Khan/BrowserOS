import { z } from 'zod';

export const signupSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email too long')
    .toLowerCase(),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'Username can only contain letters, numbers, underscores, and hyphens'
    ),
  displayName: z
    .string()
    .min(1, 'Display name is required')
    .max(60, 'Display name too long')
    .trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
});

export const passwordResetSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
