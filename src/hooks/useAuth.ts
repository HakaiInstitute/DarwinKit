import { useState } from "react";

const defaultUser = {
  id: 1,
  name: "Steve",
  avatar: "default-avatar.png",
  email: "default@example.com",
};

export const useAuth = (defaultAuthenticated = true) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => defaultAuthenticated,
  );
  const login = async (_email: string, _password: string) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setIsAuthenticated(true);
  };

  const logout = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsAuthenticated(false);
  };

  return {
    isAuthenticated,
    login,
    logout,
    user: isAuthenticated ? defaultUser : null,
  };
};
