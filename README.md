# IdeaForge

**AI-Powered CLI Tool for Converting PRDs into Executable Specifications**

IdeaForge transforms human-readable Product Requirements Documents (PRDs) into structured, AI-ready specifications and task DAGs using specialized AI agents.

## 🚀 What IdeaForge Does

- **Parses PRDs** (.md, .pdf, .docx) using natural language processing
- **Extracts structured data** via 5 specialized AI agents:
  - 📋 **Summary Agent** - Project overview and stakeholders
  - 🏗️ **Entity/API Agent** - Data models and API endpoints
  - ⚖️ **Constraints Agent** - Performance, security, compliance rules
  - 🎯 **Scenarios Agent** - Given/When/Then acceptance criteria
  - 💡 **Hints Agent** - Implementation guidance and tech recommendations
- **Generates `spec.ai.json`** - Single source of truth for the project
- **Creates task DAGs** - Executable implementation roadmap
- **Stores in SQLite** - Persistent project state and versioning

## 📦 Installation

```bash
npm install
```

## 🛠️ Usage

### Compile a PRD into spec.ai.json

```bash
# Basic compilation
npm run dev compile your-prd.md

# With custom project name and workspace
npm run dev compile your-prd.md --project my-app --workspace ./custom-dir

# Verbose output with dry-run (no files written)
npm run dev compile your-prd.md --dry-run --verbose

# Save to specific output file
npm run dev compile your-prd.md --output ./my-spec.json
```

### Available Commands

```bash
npm run dev compile <prd-file>    # Convert PRD to spec.ai.json
npm run dev run <project>         # Execute tasks from spec
npm run dev review <project>      # Review generated code
npm run dev aggregate <project>   # Combine task outputs
npm run dev all <prd-file>        # Run full pipeline
npm run dev bundle <project>      # Create deployment package
```

## 📁 Output Structure

```
projects/
├── your-project/
│   ├── spec.ai.json              # 🎯 Main output - structured specification
│   ├── compilation-metadata.json # Compilation details and timing
│   ├── tasks/                    # Individual task files (future)
│   ├── build/                    # Generated code (future)
│   └── reports/                  # Review reports (future)
```

## 🔧 Development

```bash
# Run in development mode
npm run dev

# Build CLI executable
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

## 📋 Example Output

From a simple todo app PRD, IdeaForge generates:

```json
{
  "project": "Simple Todo App",
  "entities": [
    {
      "name": "Task",
      "attributes": ["id", "title", "completed", "createdAt"],
      "relations": []
    }
  ],
  "apis": [
    {
      "method": "GET",
      "route": "/tasks",
      "summary": "List all tasks"
    },
    {
      "method": "POST",
      "route": "/tasks",
      "summary": "Create a new task"
    }
  ],
  "scenarios": [
    {
      "id": "AC-001",
      "given": "User wants to add a task",
      "when": "User submits task form",
      "then": "Task is created and displayed"
    }
  ],
  "tasks": [
    {
      "id": "T-001",
      "title": "Implement Task CRUD API",
      "estimatedComplexity": "medium"
    }
  ]
}
```

## 🏗️ Architecture

- **CLI Framework**: Commander.js
- **AI Integration**: Vercel AI SDK + OpenAI
- **Database**: SQLite with Drizzle ORM
- **Validation**: Zod schemas
- **Language**: TypeScript
- **Runtime**: Node.js

## 🔑 Setup

1. Set your OpenAI API key:

```bash
export OPENAI_API_KEY=your-api-key-here
```

2. Run your first compilation:

```bash
npm run dev compile test-prd.md --verbose
```

## 📚 Sample PRDs

- `test-prd.md` - Simple todo app
- `sample-ecommerce-prd.md` - E-commerce checkout system

## 🎯 Status

**Core compilation system**: ✅ Complete and tested

- All 5 AI agents working
- Database integration functional
- CLI commands implemented
- Schema validation working

**Next phases**: Task execution, code generation, review loops

---

**Built with ❤️ using AI agents to automate software specification and development**
