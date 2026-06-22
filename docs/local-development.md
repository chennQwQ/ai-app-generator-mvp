# Local Development

## Running Phase 1 with the Fake Agent

Install dependencies:

```powershell
npm install
```

Start the API with the fake agent provider:

```powershell
$env:AGENT_PROVIDER = "fake"
npm run dev:api
```

In another terminal, start the web app:

```powershell
npm run dev:web
```

Open the web studio:

```text
http://127.0.0.1:5173
```

## Running Phase 2 with OpenCode

OpenCode owns model provider configuration. Configure DeepSeek or another provider in OpenCode before using this app.

Start the API with the OpenCode provider:

```powershell
$env:AGENT_PROVIDER = "opencode"
$env:OPENCODE_COMMAND = "opencode"
$env:OPENCODE_AGENT = "build"
npm run dev:api
```

In another terminal, start the web app:

```powershell
npm run dev:web
```

Do not store DeepSeek or other provider credentials in this repository. Do not pass `--model` to OpenCode in this MVP; OpenCode configuration owns provider and model selection.

## Manual Acceptance Checklist for the Fake Runner

- Create a project named `Todo App`.
- Send prompt: `Build a todo app with add, complete, delete, and filter controls.`
- Confirm logs appear.
- Confirm `src/App.tsx` appears in the file tree.
- Confirm file content opens.
- Start preview.
- Confirm a preview URL is returned.

## Repository Boundary

The parent course directory contains videos, PDFs, archives, extracted frames, and reference materials. Those parent course files, videos, and docs are outside this Git repository and must not be committed.
