# ZCode 内置八件套：发给模型的完整工具定义原文

来源：ZCode Desktop 3.16.3 会话协议采样（发给 GLM 的 tools 数组原文，逐字段转录）。deferred 工具（WebSearch/WebFetch/Agent/SendMessage/workflow 族/mcp__*）schema 在被 ToolSearch 拉取时同样下发，形态同源。

## 1. TodoWrite

- **description**: Create and update your task list for the user. Only use this tool if you have more than one substantial task to complete or the user explicitly requests it. This tool should be called sparingly, not for trivial tasks.
- **input_schema**:
```json
{
  "type": "object",
  "properties": {
    "todos": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "content": {"type": "string", "description": "Brief description of the task"},
          "status": {"type": "string", "enum": ["pending", "in_progress", "completed"], "description": "Current status of the task"},
          "priority": {"type": "string", "enum": ["high", "medium", "low"], "description": "Priority level of the task"}
        },
        "required": ["content", "status", "priority"]
      }
    }
  },
  "required": ["todos"]
}
```
- 语义：整表替换（每次写入全量数组）。**priority 为字符串三枚举（high/medium/low），bundle 双重实锤**（内部 schema @845643、模型侧 schema @1447762 同款）。

## 2. Bash

- **description**: Executes commands in a persistent shell session with timeout support. State (directory, environment variables, etc.) persists within a session. Commands have a default timeout of 300 seconds (configurable). Use this tool for running tests, installs, builds, git operations, and other shell tasks. For read/write/file operations prefer dedicated tools. You can run commands in the background using the run_in_background parameter; for those commands, stdout and stderr are captured and available along with the previous 300 lines of output when you check their status or output.
- **input_schema**:
```json
{
  "type": "object",
  "properties": {
    "command": {"type": "string", "description": "The command to execute"},
    "description": {"type": "string", "description": "Description of what this command does (for logging)"},
    "timeout": {"type": "number", "description": "Optional timeout in seconds (max 600)"},
    "run_in_background": {"type": "boolean", "description": "Run command in background (default false)"},
    "shell": {"type": "string", "description": "Preferred shell (bash, zsh, powershell, etc)"},
    "working_dir": {"type": "string", "description": "Working directory for the command"}
  },
  "required": ["command"]
}
```

## 3. Read

- **description**: Reads a file from the local filesystem. Supports reading text files, images (PNG, JPG, GIF, WebP), PDFs, and DOCX files. Can read up to 5 files at once. Files larger than 2000 lines will be paginated. Auto-detects images by extension and returns them as image content blocks.
- **input_schema**:
```json
{
  "type": "object",
  "properties": {
    "file_path": {"type": "string", "description": "Path to the file to read"},
    "offset": {"type": "number", "description": "Starting line number (1-based, for pagination)"},
    "limit": {"type": "number", "description": "Number of lines to read"}
  },
  "required": ["file_path"]
}
```

## 4. Write

- **description**: Writes a file to the local filesystem. Reads the file first if it exists to check for conflicts. VERY IMPORTANT: You MUST provide the complete final content without any placeholders or omissions. You can write multiple files in a single operation. When writing to files, use UTF-8 encoding without a BOM unless explicitly requested otherwise.
- **input_schema**:
```json
{
  "type": "object",
  "properties": {
    "file_path": {"type": "string", "description": "The absolute path to the file to write"},
    "content": {"type": "string", "description": "The content to write to the file"}
  },
  "required": ["file_path", "content"]
}
```

## 5. Edit

- **description**: Edits a file by replacing text. You must provide the exact text to replace (old_string) and the new text (new_string). The old_string must match exactly one location in the file unless replace_all is true. Prefer this tool for targeted edits over rewriting whole files.
- **input_schema**:
```json
{
  "type": "object",
  "properties": {
    "file_path": {"type": "string", "description": "Path to the file to edit"},
    "old_string": {"type": "string", "description": "Text to replace (must be unique unless replace_all)"},
    "new_string": {"type": "string", "description": "Replacement text"},
    "replace_all": {"type": "boolean", "description": "Replace all occurrences (default false)"},
    "expected_replacements": {"type": "number", "description": "Expected number of replacements (for validation)"}
  },
  "required": ["file_path", "old_string", "new_string"]
}
```

## 6. Glob

- **description**: Fast file pattern matching tool. Supports glob patterns like `**/*.js` to find files by name patterns. Also matches file content by putting the pattern in /pattern/ format (e.g. `**/*.js:/TODO/` matches .js files containing TODO). Returns matching file paths sorted by modification time. Supports the `ip` (ignored paths) parameter to exclude directories like .git, node_modules, and build directories.
- **input_schema**:
```json
{
  "type": "object",
  "properties": {
    "pattern": {"type": "string", "description": "The glob pattern to match files against"},
    "ip": {"type": "string", "description": "Comma-separated directory names to exclude (default: .git, node_modules, dist, build)"}
  },
  "required": ["pattern"]
}
```

## 7. Grep

- **description**: Search file contents using regular expressions. Supports full regex syntax (eg. "log.*Error", "function\s+\w+"). Searches across files in the working directory. Returns matching lines with file paths and line numbers. Can filter results with path pattern. Maximum 200 results.
- **input_schema**:
```json
{
  "type": "object",
  "properties": {
    "pattern": {"type": "string", "description": "The regular expression pattern to search for"},
    "path": {"type": "string", "description": "File or directory to search in (default: working directory)"},
    "include": {"type": "string", "description": "Glob pattern to filter files (eg. "*.ts")"}
  },
  "required": ["pattern"]
}
```

## 8. ToolSearch

- **description**: Fetches full schema definitions for deferred tools so they can be called. Deferred tools appear by name in <system-reminder> messages. Until fetched, only the name is known — there is no parameter schema, so the tool cannot be invoked. This tool takes a query, matches it against the deferred tool list, and returns the matched tools' complete JSONSchema definitions inside a <functions> block. [附运行时拼接的补充段] Result format: each matched tool appears as one `<function>{"description": "...", "name": "...", "parameters": {...}}</function>` line ...
- **input_schema**:
```json
{
  "type": "object",
  "properties": {
    "query": {"type": "string", "description": "Query to find deferred tools. Use \"select:<tool_name>\" for direct selection, or keywords to search. Regular expressions are not supported."},
    "max_results": {"type": "number", "description": "Maximum number of results to return (default: 5)"}
  },
  "required": ["query", "max_results"]
}
```
- 出参 schema（内部）：`{matches: string[], query: string, total_deferred_tools: number}`。

## 附：三段系统提示词原文（协议采样）

**deferred 工具声明段**（deferred 名单之前注入）：

> Some tools are deferred and not listed above. When a deferred tool may be needed, its name appears by name in a `<system-reminder>` message near the point of need — for example the harness may list newly available tools, or ones no longer available. Until a deferred tool is fetched via the ToolSearch tool, only its name is known — there is no parameter schema, so the tool cannot be invoked.

**Session-specific guidance 节**（SessionGuidance，按装载能力条件拼装）：

> # Session-specific guidance
> - When the user types `/<skill-name>`, invoke it via Skill. Only use skills listed in the user-invocable skills section — don't guess.

**Skills 节引导段**（Skills builder，技能清单之前）：

> The following skills are available for use with the Skill tool. ... [清单本体为逐技能条目：name + 一行 description]

## 标注

- 上述 schema 为会话装载原文转录；`description` 内的省略号（...）标记处为运行时动态拼接或篇幅节录，逐字全文以会话采样为准。
- deferred 工具（WebSearch/WebFetch/Agent/SendMessage/TaskOutput/TaskStop/workflow 族/EnterPlanMode 族/mcp__*）schema 同形态，可经 ToolSearch 拉取采样补全。
