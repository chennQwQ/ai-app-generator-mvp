# ApiFlow Sidecar

This sidecar is the main project boundary for executing real ApiFlow workflows without copying ApiFlow source into this repository.

## Local source integration

Set `APIFLOW_SOURCE_DIR` to the external ApiFlow checkout before running tests or the service:

```powershell
$env:APIFLOW_SOURCE_DIR='D:\doc\code\apiFlow项目课程\20250725_apiFlow'
npm run test:apiflow
```

When `APIFLOW_SOURCE_DIR` points to a valid checkout, Gradle compiles `apiFlow-core/src/main/java` as an external source directory. The source remains outside this repository and is not committed. If the variable is not set, the sidecar falls back to `cn.coderead:apiFlow-core:1.0-SNAPSHOT` from `mavenLocal()`.

## Build output location

Gradle build output is redirected to `C:/tmp/ai-app-generator-apiflow-sidecar-build` by default. This avoids Java argfile classpath failures on Windows when the project path contains non-ASCII characters. Override it with `APIFLOW_SIDECAR_BUILD_DIR` if needed.

## Runtime endpoints

The sidecar starts on `127.0.0.1:4317` by default:

- `GET /health`
- `POST /api/apiflow/workflows/{workflowId}/runs`
- `GET /api/apiflow/runs/{runId}`
- `GET /api/apiflow/runs/{runId}/events?after={sequence}`
- `POST /api/apiflow/runs/{runId}/cancel`

The first smoke test writes a temporary DSL file, creates `org.apiFlow.core.FlowEngine`, calls `reLoad()`, and verifies `FlowEngine.execute()` returns the expected result.