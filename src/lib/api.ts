import { hc } from "hono/client";
import type { AppType } from "../../server.ts";

// Create the Hono RPC client
export const api = hc<AppType>("http://localhost:3001/");

// Helper functions for API calls
export const authApi = {
  signup: (data: { email: string; password: string; passwordConfirm: string }) =>
    api.auth.signup.$post({ json: data }),

  signin: (data: { email: string; password: string }) => api.auth.signin.$post({ json: data }),

  me: (token: string) =>
    api.auth.me.$get({}, {
      headers: { Authorization: `Bearer ${token}` },
    }),
};

export const projectApi = {
  list: (token: string, params: { limit?: number; offset?: number } = {}) =>
    api.projects.$get(
      { query: { limit: String(params.limit), offset: String(params.offset) } },
      { headers: { Authorization: `Bearer ${token}` } },
    ),

  create: (token: string, data: { title: string; description?: string }) =>
    api.projects.$post(
      { json: data },
      { headers: { Authorization: `Bearer ${token}` } },
    ),

  find: (token: string, id: number) =>
    api.projects[":id"].$get(
      { param: { id: String(id) } },
      { headers: { Authorization: `Bearer ${token}` } },
    ),

  update: (token: string, id: number, data: { title: string; description: string }) =>
    api.projects[":id"].$put(
      { param: { id: String(id) }, json: data },
      { headers: { Authorization: `Bearer ${token}` } },
    ),
};
