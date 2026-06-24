package com.aigenerator.apiflow;

import java.util.LinkedHashMap;
import java.util.Map;

public final class ApiFlowDtos {
    private ApiFlowDtos() {
    }

    public static final class StartRunRequest {
        public String projectId;
        public String workflowId;
        public String workflowName;
        public String flowPath = "main.groovy";
        public String dsl;
        public Map<String, Object> input = new LinkedHashMap<>();
    }

    public static final class RunResponse {
        public String id;
        public String externalRunId;
        public String projectId;
        public String workflowId;
        public String workflowName;
        public String flowPath;
        public String status;
        public Object result;
        public String error;
        public String createdAt;
        public String startedAt;
        public String finishedAt;
    }

    public static final class RunEvent {
        public long sequence;
        public String runId;
        public String workflowId;
        public String type;
        public String nodeId;
        public String status;
        public String message;
        public String at;
        public Map<String, Object> payload = new LinkedHashMap<>();
    }

    public static final class ErrorResponse {
        public String error;

        public ErrorResponse(String error) {
            this.error = error;
        }
    }
}