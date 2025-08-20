/// <reference types="vite/client" />

// Ensure TanStack Router types are processed by referencing the route tree
/// <reference path="./routeTree.gen.ts" />

// Declare CSS module types with ?url suffix
declare module "*.css?url" {
  const content: string;
  export default content;
}
