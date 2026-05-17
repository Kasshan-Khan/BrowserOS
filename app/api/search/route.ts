import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { searchNodes } from '@/lib/vfs';
import { z } from 'zod';
import { ok, unauthorized, badRequest, handleApiError } from '@/lib/api';

const querySchema = z.object({
  q: z.string().min(1).max(255),
  type: z.enum(['all', 'files', 'apps']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// GET /api/search?q=query&type=all
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const { searchParams } = new URL(request.url);
    const input = querySchema.parse({
      q: searchParams.get('q'),
      type: searchParams.get('type') ?? 'all',
      limit: searchParams.get('limit') ?? 20,
    });

    const results: {
      type: string;
      id: string;
      label: string;
      description?: string;
      icon: string;
    }[] = [];

    if (input.type === 'all' || input.type === 'files') {
      const nodes = await searchNodes(session.userId, input.q, input.limit);
      for (const node of nodes) {
        results.push({
          type: 'file',
          id: node.id,
          label: node.name,
          description: node.path,
          icon: node.type === 'DIRECTORY' ? '📁' : '📄',
        });
      }
    }

    return ok({ results });
  } catch (error) {
    return handleApiError(error);
  }
}
