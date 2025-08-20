import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, projectApi } from "~/lib/api.ts";
import { useAuth } from "./useAuth.ts";

// Auth hooks
export function useSignup() {
  return useMutation({
    mutationFn: authApi.signup,
    onSuccess: (response) => {
      console.log("Signup successful", response);
    },
    onError: (error) => {
      console.error("Signup failed", error);
    },
  });
}

export function useSignin() {
  return useMutation({
    mutationFn: authApi.signin,
    onSuccess: (response) => {
      console.log("Signin successful", response);
    },
    onError: (error) => {
      console.error("Signin failed", error);
    },
  });
}

export function useMe() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => authApi.me("token"),
    enabled: isAuthenticated,
  });
}

// Project hooks
export function useProjects(params?: { limit?: number; offset?: number }) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ["projects", "list", params],
    queryFn: async () => {
      const response = await projectApi.list("token", params);
      if (!response.ok) {
        throw new Error("Failed to fetch projects");
      }
      return await response.json();
    },
    enabled: isAuthenticated,
  });
}

export function useProject(id: number) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ["projects", "detail", id],
    queryFn: async () => {
      const response = await projectApi.find("token", id);
      if (!response.ok) {
        throw new Error("Failed to fetch project");
      }
      return await response.json();
    },
    enabled: isAuthenticated && !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  return useMutation({
    mutationFn: async (data: { title: string; description?: string }) => {
      if (!isAuthenticated) {
        throw new Error("Not authenticated");
      }
      const response = await projectApi.create("token", data);
      if (!response.ok) {
        throw new Error("Failed to create project");
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
    },
    onError: (error) => {
      console.error("Failed to create project", error);
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; title: string; description: string }) => {
      if (!isAuthenticated) {
        throw new Error("Not authenticated");
      }
      const response = await projectApi.update("token", id, data);
      if (!response.ok) {
        throw new Error("Failed to update project");
      }
      return await response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
      queryClient.invalidateQueries({ queryKey: ["projects", "detail", variables.id] });
    },
    onError: (error) => {
      console.error("Failed to update project", error);
    },
  });
}
