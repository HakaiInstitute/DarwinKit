import { me, signin, signup } from "./auth";
import { createProject, findProject, listProjects, updateProject } from "./project";
import { sse } from "./sse";

export const router = {
  auth: {
    signup,
    signin,
    me,
  },

  project: {
    list: listProjects,
    create: createProject,
    find: findProject,
    update: updateProject,
  },

  sse,
};
