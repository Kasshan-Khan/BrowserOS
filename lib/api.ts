import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { PermissionError } from '@/lib/rbac';

// ─── Standard API response shapes ────────────────────────────────────────────

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function created<T>(data: T) {
  return ok(data, 201);
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json(
    { ok: false, error: message, details },
    { status: 400 }
  );
}

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}

export function forbidden(message = 'Forbidden') {
  return NextResponse.json({ ok: false, error: message }, { status: 403 });
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ ok: false, error: message }, { status: 404 });
}

export function tooManyRequests(message = 'Too many requests') {
  return NextResponse.json({ ok: false, error: message }, { status: 429 });
}

export function serverError(message = 'Internal server error') {
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

// ─── Centralized error handler ────────────────────────────────────────────────

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return badRequest('Validation error', error.flatten().fieldErrors);
  }

  if (error instanceof PermissionError) {
    return forbidden(error.message);
  }

  if (error instanceof Error) {
    // Expose safe error messages in dev, hide in prod
    const message =
      process.env.NODE_ENV === 'development'
        ? error.message
        : 'An unexpected error occurred';
    console.error('[API Error]', error);
    return serverError(message);
  }

  console.error('[API Unknown Error]', error);
  return serverError();
}

// ─── Get IP from request ──────────────────────────────────────────────────────

export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}
