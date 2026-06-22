import path from "node:path";
import type { TemplateMeta } from "@ai-app-generator/shared";

export interface TemplateEntry {
  id: string;
  name: string;
  description: string;
  dir: string;
}

export class TemplateService {
  private readonly templates: TemplateEntry[];

  constructor(private readonly templatesDir: string) {
    this.templates = [
      {
        id: "react-vite",
        name: "React (Vite + TypeScript)",
        description: "React 19 app with Vite, TypeScript, and strict mode",
        dir: path.resolve(templatesDir, "react-vite")
      },
      {
        id: "vue-vite",
        name: "Vue (Vite + TypeScript)",
        description: "Vue 3 app with Vite, TypeScript, and Composition API",
        dir: path.resolve(templatesDir, "vue-vite")
      }
    ];
  }

  list(): TemplateMeta[] {
    return this.templates.map(({ id, name, description }) => ({ id, name, description }));
  }

  getTemplate(id: string): TemplateEntry {
    const template = this.templates.find((t) => t.id === id);
    if (!template) throw new Error(`Unknown template: ${id}`);
    return template;
  }

  resolveDir(id: string): string {
    return this.getTemplate(id).dir;
  }
}
