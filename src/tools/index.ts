// Central export file for all tools used by agents

import { fsTools, ensureWorkspaceStructure } from "./fs.js";
import { testTools } from "./test.js";
import { lintTools } from "./lint.js";
import { openApiTools } from "./openapi.js";

// Re-export individual tool collections
export {
  fsTools,
  ensureWorkspaceStructure,
  testTools,
  lintTools,
  openApiTools,
};

// Combined tool collection for easy import by agents
export const allTools = {
  // File system operations
  ...fsTools,

  // Testing tools
  ...testTools,

  // Linting and code quality
  ...lintTools,

  // OpenAPI tools
  ...openApiTools,
};

// Tool categories for selective imports
export const coreTools = {
  readFile: fsTools.readFile,
  writeFile: fsTools.writeFile,
  listDir: fsTools.listDir,
  fileExists: fsTools.fileExists,
  createDir: fsTools.createDir,
};

export const qualityTools = {
  runTests: testTools.runTests,
  lint: lintTools.lint,
  typeCheck: lintTools.typeCheck,
  securityLint: lintTools.securityLint,
  runAllLints: lintTools.runAllLints,
};

export const buildTools = {
  validateOpenAPI: openApiTools.validateOpenAPI,
  generateOpenAPI: openApiTools.generateOpenAPI,
  format: lintTools.format,
};
