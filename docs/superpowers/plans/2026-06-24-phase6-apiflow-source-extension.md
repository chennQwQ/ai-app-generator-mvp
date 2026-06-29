# Phase 6 ApiFlow Source Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the external `20250725_apiFlow` source so the main project sidecar can observe task events, support cancellation, and map execution status back to the visual workflow.

**Architecture:** All engine changes happen in the external ApiFlow repository at `$COURSE_ROOT\20250725_apiFlow`, not in `ai-app-generator-mvp`. Keep existing `FlowEngine.execute(String, Object)` behavior source-compatible by adding overloads and listeners instead of breaking current callers. Publish or expose the changed engine to the sidecar through `APIFLOW_SOURCE_DIR` while developing, then `publishToMavenLocal` when stable.

**Tech Stack:** Java 8 compatible ApiFlow core, Groovy, Gradle, JUnit/Groovy tests, `FlowEngine`, `AbstractScript`, `AbstractTask`.

---

## Source Ownership Rule

Edit only the external repository for this plan:

```text
$COURSE_ROOT\20250725_apiFlow
```

Do not copy changed ApiFlow files into:

```text
$COURSE_ROOT\ai-app-generator-mvp
```

Before running commands that reference `$COURSE_ROOT`, set it from the main worktree:

```powershell
$COURSE_ROOT = (Resolve-Path "..\..\..").Path
```

The main project records this plan and consumes the output as an external dependency.

---

## Task 1: Add Execution Context Model

**Files in external repo:**
- Create: `apiFlow-core/src/main/java/org/apiFlow/core/ExecutionContext.java`
- Test: `apiFlow-core/src/test/groovy/org/apiFlow/core/ExecutionContextTest.groovy`

- [ ] **Step 1: Create `ExecutionContext`**

Create:

```java
package org.apiFlow.core;

import java.util.Collections;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

public final class ExecutionContext {
    private final String runId;
    private final String flowPath;
    private final Object input;
    private final Map<String, Object> attachInput;
    private final AtomicBoolean cancelled = new AtomicBoolean(false);

    public ExecutionContext(String runId, String flowPath, Object input, Map<String, Object> attachInput) {
        this.runId = runId == null || runId.trim().isEmpty() ? "apiflow-" + UUID.randomUUID() : runId;
        this.flowPath = flowPath;
        this.input = input;
        this.attachInput = attachInput == null ? Collections.emptyMap() : attachInput;
    }

    public String getRunId() {
        return runId;
    }

    public String getFlowPath() {
        return flowPath;
    }

    public Object getInput() {
        return input;
    }

    public Map<String, Object> getAttachInput() {
        return attachInput;
    }

    public boolean isCancelled() {
        return cancelled.get();
    }

    public void cancel() {
        cancelled.set(true);
    }
}
```

- [ ] **Step 2: Add context test**

Create:

```groovy
package org.apiFlow.core

import org.junit.jupiter.api.Test

import static org.junit.jupiter.api.Assertions.*

class ExecutionContextTest {
    @Test
    void createsRunIdWhenMissing() {
        def context = new ExecutionContext(null, "main.groovy", [name: "luban"], [:])
        assertTrue(context.runId.startsWith("apiflow-"))
        assertEquals("main.groovy", context.flowPath)
        assertFalse(context.cancelled)
    }

    @Test
    void supportsCancellation() {
        def context = new ExecutionContext("run-1", "main.groovy", [:], [:])
        context.cancel()
        assertTrue(context.cancelled)
    }
}
```

- [ ] **Step 3: Verify**

Run in external repo:

```powershell
cd "$COURSE_ROOT\20250725_apiFlow"
.\gradlew.bat :apiFlow-core:test --tests org.apiFlow.core.ExecutionContextTest
```

Expected: test passes.

---

## Task 2: Add Public Execution Listener API

**Files in external repo:**
- Create: `apiFlow-core/src/main/java/org/apiFlow/core/FlowExecutionListener.java`
- Create: `apiFlow-core/src/main/java/org/apiFlow/core/TaskExecutionListener.java`
- Modify: `apiFlow-core/src/main/java/org/apiFlow/core/FlowEngine.java`
- Test: `apiFlow-core/src/test/groovy/org/apiFlow/core/FlowExecutionListenerTest.groovy`

- [ ] **Step 1: Create listener interfaces**

Create `FlowExecutionListener.java`:

```java
package org.apiFlow.core;

public interface FlowExecutionListener {
    default void flowStarted(ExecutionContext context) {}
    default void flowSucceeded(ExecutionContext context, Object result) {}
    default void flowFailed(ExecutionContext context, Throwable error) {}
    default void flowCancelled(ExecutionContext context) {}
}
```

Create `TaskExecutionListener.java`:

```java
package org.apiFlow.core;

import org.apiFlow.core.task.AbstractTask;

public interface TaskExecutionListener {
    default void taskStarted(ExecutionContext context, AbstractTask task) {}
    default void taskSucceeded(ExecutionContext context, AbstractTask task) {}
    default void taskFailed(ExecutionContext context, AbstractTask task, Throwable error) {}
    default void taskSkipped(ExecutionContext context, AbstractTask task, String reason) {}
}
```

- [ ] **Step 2: Register listeners in `FlowEngine`**

Add fields and methods:

```java
private final Set<FlowExecutionListener> flowExecutionListeners = ConcurrentHashMap.newKeySet();
private final Set<TaskExecutionListener> taskExecutionListeners = ConcurrentHashMap.newKeySet();

public void addFlowExecutionListener(FlowExecutionListener listener) {
    flowExecutionListeners.add(listener);
}

public void removeFlowExecutionListener(FlowExecutionListener listener) {
    flowExecutionListeners.remove(listener);
}

public void addTaskExecutionListener(TaskExecutionListener listener) {
    taskExecutionListeners.add(listener);
}

public void removeTaskExecutionListener(TaskExecutionListener listener) {
    taskExecutionListeners.remove(listener);
}
```

Add package-visible notification methods:

```java
void notifyTaskStarted(ExecutionContext context, AbstractTask task) {
    taskExecutionListeners.forEach(listener -> listener.taskStarted(context, task));
}

void notifyTaskSucceeded(ExecutionContext context, AbstractTask task) {
    taskExecutionListeners.forEach(listener -> listener.taskSucceeded(context, task));
}

void notifyTaskFailed(ExecutionContext context, AbstractTask task, Throwable error) {
    taskExecutionListeners.forEach(listener -> listener.taskFailed(context, task, error));
}
```

- [ ] **Step 3: Verify listener registration**

Create a test that registers a listener and asserts it receives `flowStarted` and `flowSucceeded` once after Task 3 adds context-aware execute.

Do not commit this test until Task 3 makes it pass.

---

## Task 3: Add Context-Aware Flow Execution

**Files in external repo:**
- Modify: `apiFlow-core/src/main/java/org/apiFlow/core/FlowEngine.java`
- Test: `apiFlow-core/src/test/groovy/org/apiFlow/core/FlowExecutionListenerTest.groovy`

- [ ] **Step 1: Add overload without breaking existing callers**

Keep existing methods:

```java
public Object execute(String flowPath, Object input, Map<String, Object> attachInput) throws ApiFlowException
public Object execute(String flowPath, Object input) throws ApiFlowException
```

Add:

```java
public Object execute(ExecutionContext executionContext) throws ApiFlowException
```

- [ ] **Step 2: Implement new overload**

The new overload should:

```java
if (executionContext.isCancelled()) {
    flowExecutionListeners.forEach(listener -> listener.flowCancelled(executionContext));
    throw new ApiFlowException("Flow run cancelled before start");
}
flowExecutionListeners.forEach(listener -> listener.flowStarted(executionContext));
Binding context = new Binding();
context.setVariable("config", configs);
context.setVariable("input", executionContext.getInput());
context.setVariable("executionContext", executionContext);
executionContext.getAttachInput().forEach(context::setVariable);
String scriptName = dslHome + "/" + executionContext.getFlowPath();
Class<?> dslClass = dslClassCache.get(scriptName);
AbstractScript script = (AbstractScript) InvokerHelper.createScript(dslClass, context);
script.initScriptInstance(this, false);
Object result = script.run();
flowExecutionListeners.forEach(listener -> listener.flowSucceeded(executionContext, result));
return result;
```

Wrap errors:

```java
catch (ApiFlowException error) {
    flowExecutionListeners.forEach(listener -> listener.flowFailed(executionContext, error));
    throw error;
} catch (RuntimeException error) {
    flowExecutionListeners.forEach(listener -> listener.flowFailed(executionContext, error));
    throw error;
}
```

- [ ] **Step 3: Delegate old overload to new overload**

Change old method body to:

```java
return execute(new ExecutionContext(null, flowPath, input, attachInput));
```

- [ ] **Step 4: Add listener test**

Create:

```groovy
package org.apiFlow.core

import org.apache.groovy.util.Maps
import org.junit.jupiter.api.Test

import java.nio.file.Files

import static org.junit.jupiter.api.Assertions.*

class FlowExecutionListenerTest {
    @Test
    void emitsFlowLifecycleEvents() {
        def tempDir = Files.createTempDirectory("apiFlowListenerTest.dsl")
        Files.createDirectory(tempDir.resolve("api"))
        tempDir.resolve("api/listenerTest.groovy").toFile().write("""
            t1={ "hello " + input.name }
            start { run t1 }
        """)
        def dslUrl = tempDir.toUri().toURL()
        def engine = new FlowEngine(new URL[]{dslUrl})
        engine.reLoad()
        def events = []
        engine.addFlowExecutionListener(new FlowExecutionListener() {
            void flowStarted(ExecutionContext context) { events << "started:${context.runId}" }
            void flowSucceeded(ExecutionContext context, Object result) { events << "succeeded:${context.runId}" }
            void flowFailed(ExecutionContext context, Throwable error) { events << "failed:${context.runId}" }
        })

        def context = new ExecutionContext("run-1", "listenerTest.groovy", Maps.of("name", "luban"), [:])
        engine.execute(context)

        assertEquals(["started:run-1", "succeeded:run-1"], events)
    }
}
```

- [ ] **Step 5: Verify**

Run:

```powershell
.\gradlew.bat :apiFlow-core:test --tests org.apiFlow.core.FlowExecutionListenerTest
```

---

## Task 4: Emit Task Lifecycle Events

**Files in external repo:**
- Modify: `apiFlow-core/src/main/java/org/apiFlow/core/AbstractScript.java`
- Modify: `apiFlow-core/src/main/java/org/apiFlow/core/task/AbstractTask.java` only if getters are missing
- Test: `apiFlow-core/src/test/groovy/org/apiFlow/core/TaskExecutionListenerTest.groovy`

- [ ] **Step 1: Expose current execution context to scripts**

In `AbstractScript`, add:

```java
private ExecutionContext executionContext;
```

Inside `initScriptInstance`, set:

```java
Object boundContext = binding.getVariables().get("executionContext");
if (boundContext instanceof ExecutionContext) {
    this.executionContext = (ExecutionContext) boundContext;
}
```

- [ ] **Step 2: Emit task events in `run(Closure, Object[])`**

After `task.setState(AbstractTask.State.RUNNING)`:

```java
if (executionContext != null) {
    if (executionContext.isCancelled()) {
        engine.notifyTaskFailed(executionContext, task, new ApiFlowException("Flow run cancelled"));
        throw new ApiFlowException("Flow run cancelled");
    }
    engine.notifyTaskStarted(executionContext, task);
}
```

After success:

```java
if (executionContext != null) {
    engine.notifyTaskSucceeded(executionContext, task);
}
```

Inside failure catch:

```java
if (executionContext != null) {
    engine.notifyTaskFailed(executionContext, task, e);
}
```

- [ ] **Step 3: Emit task events in `when(...)`**

Apply the same started/succeeded/failed notification pattern around the `BooleTask` and `SwitchTask` execution path.

- [ ] **Step 4: Add task listener test**

Create:

```groovy
package org.apiFlow.core

import org.apiFlow.core.task.AbstractTask
import org.junit.jupiter.api.Test

import java.nio.file.Files

import static org.junit.jupiter.api.Assertions.*

class TaskExecutionListenerTest {
    @Test
    void emitsTaskLifecycleEvents() {
        def tempDir = Files.createTempDirectory("apiFlowTaskListenerTest.dsl")
        Files.createDirectory(tempDir.resolve("api"))
        tempDir.resolve("api/taskListenerTest.groovy").toFile().write("""
            t1={ "hello " + input.name }
            start { run t1 }
        """)
        def dslUrl = tempDir.toUri().toURL()
        def engine = new FlowEngine(new URL[]{dslUrl})
        engine.reLoad()
        def events = []
        engine.addTaskExecutionListener(new TaskExecutionListener() {
            void taskStarted(ExecutionContext context, AbstractTask task) { events << "started:${task.name}" }
            void taskSucceeded(ExecutionContext context, AbstractTask task) { events << "succeeded:${task.name}" }
            void taskFailed(ExecutionContext context, AbstractTask task, Throwable error) { events << "failed:${task.name}" }
        })

        engine.execute(new ExecutionContext("run-task-1", "taskListenerTest.groovy", [name: "luban"], [:]))

        assertTrue(events.any { it.startsWith("started:") })
        assertTrue(events.any { it.startsWith("succeeded:") })
        assertFalse(events.any { it.startsWith("failed:") })
    }
}
```

- [ ] **Step 5: Verify**

Run:

```powershell
.\gradlew.bat :apiFlow-core:test --tests org.apiFlow.core.TaskExecutionListenerTest
```

---

## Task 5: Add Cooperative Cancellation

**Files in external repo:**
- Modify: `apiFlow-core/src/main/java/org/apiFlow/core/AbstractScript.java`
- Test: `apiFlow-core/src/test/groovy/org/apiFlow/core/ExecutionCancellationTest.groovy`

- [ ] **Step 1: Check cancellation before every task**

Add helper:

```java
private void assertNotCancelled(AbstractTask task) {
    if (executionContext != null && executionContext.isCancelled()) {
        ApiFlowException error = new ApiFlowException("Flow run cancelled");
        if (task != null) {
            task.setState(AbstractTask.State.FAILED);
            engine.notifyTaskFailed(executionContext, task, error);
        }
        throw error;
    }
}
```

Call it before each task starts:

```java
assertNotCancelled(task);
```

- [ ] **Step 2: Add cancellation test**

Create:

```groovy
package org.apiFlow.core

import org.junit.jupiter.api.Test

import java.nio.file.Files

import static org.junit.jupiter.api.Assertions.*

class ExecutionCancellationTest {
    @Test
    void cancelledContextDoesNotStartFlow() {
        def tempDir = Files.createTempDirectory("apiFlowCancellationTest.dsl")
        Files.createDirectory(tempDir.resolve("api"))
        tempDir.resolve("api/cancellationTest.groovy").toFile().write("""
            t1={ "hello" }
            start { run t1 }
        """)
        def dslUrl = tempDir.toUri().toURL()
        def engine = new FlowEngine(new URL[]{dslUrl})
        engine.reLoad()
        def context = new ExecutionContext("run-cancel-1", "cancellationTest.groovy", [:], [:])
        context.cancel()

        def error = assertThrows(ApiFlowException, { engine.execute(context) })
        assertTrue(error.message.contains("cancelled"))
    }
}
```

- [ ] **Step 3: Verify**

Run:

```powershell
.\gradlew.bat :apiFlow-core:test --tests org.apiFlow.core.ExecutionCancellationTest
```

---

## Task 6: Publish External ApiFlow For Sidecar Consumption

**Files in external repo:**
- No file changes for the normal path. The existing root `build.gradle` already applies `maven-publish` to subprojects and publishes to `mavenLocal()`.

- [ ] **Step 1: Run full ApiFlow core tests**

Run:

```powershell
cd "$COURSE_ROOT\20250725_apiFlow"
.\gradlew.bat :apiFlow-core:test
```

Expected: all core tests pass.

- [ ] **Step 2: Publish locally**

Run:

```powershell
.\gradlew.bat :apiFlow-core:publishToMavenLocal
```

Expected artifact:

```text
~/.m2/repository/cn/coderead/apiFlow-core/1.0-SNAPSHOT/
```

- [ ] **Step 3: Record external commit separately**

Commit only inside external repo:

```powershell
cd "$COURSE_ROOT\20250725_apiFlow"
git status --short
git add apiFlow-core/src/main/java/org/apiFlow/core apiFlow-core/src/test/groovy/org/apiFlow/core
git commit -m "feat: expose apiflow execution events"
```

Do not stage or commit these files from `ai-app-generator-mvp`.

---

## Self-Review

- This plan changes only external ApiFlow source.
- Existing `FlowEngine.execute(String, Object)` callers remain supported.
- Events are emitted from the engine, not inferred by the sidecar.
- Cancellation is cooperative and checked at task boundaries.
- The output can be consumed by the main sidecar via `APIFLOW_SOURCE_DIR` or `mavenLocal`.
