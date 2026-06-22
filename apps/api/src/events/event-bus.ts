import type { ProjectEvent } from "@ai-app-generator/shared";

export type ProjectEventListener = (event: ProjectEvent) => void;
export type Unsubscribe = () => void;

export class EventBus {
  private readonly listeners = new Map<string, Set<ProjectEventListener>>();

  subscribe(projectId: string, listener: ProjectEventListener): Unsubscribe {
    let projectListeners = this.listeners.get(projectId);
    if (!projectListeners) {
      projectListeners = new Set();
      this.listeners.set(projectId, projectListeners);
    }

    projectListeners.add(listener);

    return () => {
      projectListeners?.delete(listener);
      if (projectListeners?.size === 0) this.listeners.delete(projectId);
    };
  }

  publish(event: ProjectEvent): void {
    const projectListeners = this.listeners.get(event.projectId);
    if (!projectListeners) return;

    for (const listener of [...projectListeners]) {
      try {
        listener(event);
      } catch {
        // Listener failures must not block other subscribers.
      }
    }
  }
}
