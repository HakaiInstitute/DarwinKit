import { useState } from "react";

const defaultUser = {
  id: 1,
  name: "Steve",
  avatar: "default-avatar.png",
  email: "default@example.com",
};

export const useAuth = (defaultAuthenticated = true) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => defaultAuthenticated
  );

  console.log("useAuth initialized with isAuthenticated:", isAuthenticated);

  const login = async (email: string, password: string) => {
    console.log(`Logging in with email: ${email} and password: hunter2`, {
      password,
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log("Login successful");

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
