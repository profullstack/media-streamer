/**
 * GET / PUT / PATCH /api/v1/me/profile: the caller's contact profile (the
 * shared @profullstack/profile fields). Auth is the session cookie, or a
 * Bearer API token for connected clients.
 */
import { createProfileHandlers } from '@profullstack/profile';
import { getCurrentUser } from '@/lib/auth';
import { getApiUser } from '@/lib/api-tokens';
import { contactProfileStore } from '@/lib/contact-profile';

export const dynamic = 'force-dynamic';

const handlers = () =>
  createProfileHandlers({
    store: contactProfileStore(),
    getUser: async (request: Request) => {
      const user = request.headers.get('authorization') ? await getApiUser(request) : await getCurrentUser();
      return user ? { id: user.id, email: user.email ?? null } : null;
    },
  });

export const GET = (request: Request): Promise<Response> => handlers().GET(request);
export const PUT = (request: Request): Promise<Response> => handlers().PUT(request);
export const PATCH = (request: Request): Promise<Response> => handlers().PATCH(request);
