package com.aigenerator.apiflow;

import org.apiFlow.core.FlowEngine;

import java.io.IOException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicLong;

public final class ApiFlowRuntimeService implements AutoCloseable {
    private final Path runtimeRoot;
    private final ExecutorService executor;
    private final Map<String, RunState> runs = new ConcurrentHashMap<>();

    public ApiFlowRuntimeService(Path runtimeRoot) {
        this.runtimeRoot = Objects.requireNonNull(runtimeRoot, "runtimeRoot");
        this.executor = Executors.newCachedThreadPool(new DaemonThreadFactory());
    }

    public ApiFlowDtos.RunResponse startRun(ApiFlowDtos.StartRunRequest request) {
        validateRequest(request);

        String runId = "apiflow-" + UUID.randomUUID();
        RunState state = new RunState(runId, normalizeFlowPath(request.flowPath));
        state.response.id = runId;
        state.response.externalRunId = runId;
        state.response.projectId = request.projectId;
        state.response.workflowId = request.workflowId;
        state.response.workflowName = request.workflowName;
        state.response.flowPath = state.flowPath;
        state.response.status = "queued";
        state.response.createdAt = now();
        runs.put(runId, state);
        appendEvent(state, "run.queued", null, "queued", null, Map.of("flowPath", state.flowPath));

        executor.submit(() -> executeRun(state, request));
        return snapshot(state);
    }

    public ApiFlowDtos.RunResponse getRun(String runId) {
        return snapshot(requireRun(runId));
    }

    public List<ApiFlowDtos.RunEvent> getEvents(String runId, long afterSequence) {
        RunState state = requireRun(runId);
        List<ApiFlowDtos.RunEvent> result = new ArrayList<>();
        for (ApiFlowDtos.RunEvent event : state.events) {
            if (event.sequence > afterSequence) {
                result.add(copyEvent(event));
            }
        }
        return result;
    }

    public ApiFlowDtos.RunResponse cancelRun(String runId) {
        RunState state = requireRun(runId);
        state.cancelled = true;
        synchronized (state) {
            if (!isTerminal(state.response.status)) {
                state.response.status = "cancelled";
                state.response.finishedAt = now();
                appendEvent(state, "run.cancelled", null, "cancelled", null, Collections.emptyMap());
            }
        }
        return snapshot(state);
    }

    @Override
    public void close() {
        executor.shutdownNow();
    }

    private void executeRun(RunState state, ApiFlowDtos.StartRunRequest request) {
        markRunning(state);
        if (state.cancelled) {
            cancelRun(state.runId);
            return;
        }

        try {
            Path flowRoot = writeWorkflowDsl(state, request.dsl);
            appendEvent(state, "workflow.loaded", null, "running", "DSL written to ApiFlow runtime directory", Map.of("flowPath", state.flowPath));

            FlowEngine engine = new FlowEngine(new URL[]{flowRoot.toUri().toURL()});
            engine.reLoad();
            Object result = engine.execute(state.flowPath, request.input == null ? Map.of() : request.input);

            synchronized (state) {
                if (state.cancelled) {
                    state.response.status = "cancelled";
                    state.response.finishedAt = now();
                    appendEvent(state, "run.cancelled", null, "cancelled", null, Collections.emptyMap());
                    return;
                }
                state.response.result = result;
                state.response.status = "succeeded";
                state.response.finishedAt = now();
            }
            appendEvent(state, "run.succeeded", null, "succeeded", null, Map.of("result", result == null ? "" : result));
        } catch (Throwable error) {
            synchronized (state) {
                if (state.cancelled) {
                    state.response.status = "cancelled";
                    state.response.finishedAt = now();
                    appendEvent(state, "run.cancelled", null, "cancelled", null, Collections.emptyMap());
                    return;
                }
                state.response.status = "failed";
                state.response.error = rootMessage(error);
                state.response.finishedAt = now();
            }
            appendEvent(state, "run.failed", null, "failed", rootMessage(error), Collections.emptyMap());
        }
    }

    private void markRunning(RunState state) {
        synchronized (state) {
            if (state.cancelled || isTerminal(state.response.status)) {
                return;
            }
            state.response.status = "running";
            state.response.startedAt = now();
        }
        appendEvent(state, "run.running", null, "running", null, Collections.emptyMap());
    }

    private Path writeWorkflowDsl(RunState state, String dsl) throws IOException {
        Path flowRoot = runtimeRoot.resolve("runs").resolve(state.runId).normalize();
        Path apiRoot = flowRoot.resolve("api").normalize();
        Path flowFile = apiRoot.resolve(state.flowPath).normalize();
        if (!flowFile.startsWith(apiRoot)) {
            throw new IllegalArgumentException("flowPath must stay under the ApiFlow api directory");
        }
        Files.createDirectories(flowFile.getParent());
        Files.writeString(flowFile, dsl, StandardCharsets.UTF_8);
        return flowRoot;
    }

    private static void validateRequest(ApiFlowDtos.StartRunRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("request is required");
        }
        if (request.dsl == null || request.dsl.isBlank()) {
            throw new IllegalArgumentException("dsl is required");
        }
    }

    private RunState requireRun(String runId) {
        RunState state = runs.get(runId);
        if (state == null) {
            throw new IllegalArgumentException("run not found: " + runId);
        }
        return state;
    }

    private static String normalizeFlowPath(String flowPath) {
        String normalized = flowPath == null || flowPath.isBlank() ? "main.groovy" : flowPath.replace('\\', '/');
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        if (normalized.contains("..")) {
            throw new IllegalArgumentException("flowPath cannot contain ..");
        }
        if (!normalized.endsWith(".groovy")) {
            normalized = normalized + ".groovy";
        }
        return normalized;
    }

    private static boolean isTerminal(String status) {
        return "succeeded".equals(status) || "failed".equals(status) || "cancelled".equals(status);
    }

    private static void appendEvent(RunState state, String type, String nodeId, String status, String message, Map<String, Object> payload) {
        ApiFlowDtos.RunEvent event = new ApiFlowDtos.RunEvent();
        event.sequence = state.sequence.incrementAndGet();
        event.runId = state.runId;
        event.workflowId = state.response.workflowId;
        event.type = type;
        event.nodeId = nodeId;
        event.status = status;
        event.message = message;
        event.at = now();
        event.payload = payload == null ? new LinkedHashMap<>() : new LinkedHashMap<>(payload);
        state.events.add(event);
    }

    private static ApiFlowDtos.RunResponse snapshot(RunState state) {
        synchronized (state) {
            ApiFlowDtos.RunResponse copy = new ApiFlowDtos.RunResponse();
            copy.id = state.response.id;
            copy.externalRunId = state.response.externalRunId;
            copy.projectId = state.response.projectId;
            copy.workflowId = state.response.workflowId;
            copy.workflowName = state.response.workflowName;
            copy.flowPath = state.response.flowPath;
            copy.status = state.response.status;
            copy.result = state.response.result;
            copy.error = state.response.error;
            copy.createdAt = state.response.createdAt;
            copy.startedAt = state.response.startedAt;
            copy.finishedAt = state.response.finishedAt;
            return copy;
        }
    }

    private static ApiFlowDtos.RunEvent copyEvent(ApiFlowDtos.RunEvent event) {
        ApiFlowDtos.RunEvent copy = new ApiFlowDtos.RunEvent();
        copy.sequence = event.sequence;
        copy.runId = event.runId;
        copy.workflowId = event.workflowId;
        copy.type = event.type;
        copy.nodeId = event.nodeId;
        copy.status = event.status;
        copy.message = event.message;
        copy.at = event.at;
        copy.payload = new LinkedHashMap<>(event.payload);
        return copy;
    }

    private static String rootMessage(Throwable error) {
        Throwable current = error;
        while (current.getCause() != null) {
            current = current.getCause();
        }
        return current.getMessage() == null ? current.getClass().getName() : current.getMessage();
    }

    private static String now() {
        return DateTimeFormatter.ISO_INSTANT.format(Instant.now());
    }

    private static final class RunState {
        private final String runId;
        private final String flowPath;
        private final ApiFlowDtos.RunResponse response = new ApiFlowDtos.RunResponse();
        private final List<ApiFlowDtos.RunEvent> events = new CopyOnWriteArrayList<>();
        private final AtomicLong sequence = new AtomicLong();
        private volatile boolean cancelled;

        private RunState(String runId, String flowPath) {
            this.runId = runId;
            this.flowPath = flowPath;
        }
    }

    private static final class DaemonThreadFactory implements ThreadFactory {
        private final AtomicLong sequence = new AtomicLong();

        @Override
        public Thread newThread(Runnable runnable) {
            Thread thread = new Thread(runnable, "apiflow-sidecar-" + sequence.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        }
    }
}