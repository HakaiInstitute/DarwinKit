import globals from "globals";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  // Ignore patterns - exclude build and output directories
  {
    ignores: [
      ".vinxi/**",
      ".output/**",
      ".zed/**",
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      ".next/**",
      "*.config.js",
      "*.config.ts",
      "*.config.mjs",
      "drizzle.config.ts",
      "vite.config.ts",
      "vitest.config.ts",
    ],
  },

  // Base JavaScript configuration
  js.configs.recommended,

  // TypeScript configuration with project awareness
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // React configuration - properly configured with plugin
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: {
      react: pluginReact,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...pluginReact.configs.flat.recommended.rules,
      ...pluginReact.configs.flat["jsx-runtime"].rules,
      "react/prop-types": "off",
      "react/no-children-prop": ["error", { allowFunctions: true }],
      "react/react-in-jsx-scope": "off",
    },
  },

  // React Hooks configuration
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: reactHooks.configs.recommended.rules,
  },

  // TypeScript parser options for all TypeScript files
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // JavaScript/JSX files configuration
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
  },

  // Global configuration and custom rules
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      // TypeScript specific rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            attributes: false,
          },
        },
      ],

      // Relax some strict rules that might be too aggressive
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/restrict-template-expressions": "warn",

      // General rules
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },

  // Prettier integration - must be last
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      ...prettierConfig.rules,
      "prettier/prettier": "warn",
    },
  }
);
