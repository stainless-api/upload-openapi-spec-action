module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended",
  ],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.json"],
  },
  ignorePatterns: [
    ".eslintrc.js", // https://stackoverflow.com/q/63118405
    "jest.config.js",
    "dist/**",
  ],

  rules: {
    curly: ["error", "multi-line"],
    "no-console": 2,
    "@typescript-eslint/no-non-null-assertion": 0,
    "@typescript-eslint/no-empty-interface": 0,
    "@typescript-eslint/ban-types": 1,
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
  },
};
