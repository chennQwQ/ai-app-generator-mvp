import MonacoEditor from "@monaco-editor/react";

interface EditorProps {
  value: string;
  path: string;
}

function inferLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    tsx: "typescript",
    ts: "typescript",
    jsx: "javascript",
    js: "javascript",
    css: "css",
    json: "json",
    html: "html",
    md: "markdown",
    yml: "yaml",
    yaml: "yaml"
  };
  return map[ext ?? ""] ?? "plaintext";
}

export function Editor({ value, path }: EditorProps) {
  return (
    <div className="monaco-container">
      <MonacoEditor
        height="100%"
        language={inferLanguage(path)}
        value={value}
        theme="vs-dark"
        options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
        loading={<div className="monaco-loading">Loading editor…</div>}
      />
    </div>
  );
}
