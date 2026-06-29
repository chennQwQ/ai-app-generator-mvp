package com.aigenerator.apiflow;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class ApiFlowRuntimeServiceTest {
    @Test
    void executesDslThroughExternalApiFlowCore() throws Exception {
        ApiFlowRuntimeService service = new ApiFlowRuntimeService(Files.createTempDirectory("apiflow-runtime-"));

        ApiFlowDtos.StartRunRequest request = new ApiFlowDtos.StartRunRequest();
        request.workflowId = "wf-real";
        request.workflowName = "Real WF";
        request.dsl = """
            task_get_token = EVAL {
                "token-" + input.name
            }

            start {
                run task_get_token
            }
            """;
        request.input = Map.of("name", "luban");

        ApiFlowDtos.RunResponse started = service.startRun(request);
        assertNotNull(started.externalRunId);

        ApiFlowDtos.RunResponse finished = waitForTerminal(service, started.externalRunId);
        assertEquals("succeeded", finished.status);
        assertEquals("token-luban", finished.result);
    }

    private static ApiFlowDtos.RunResponse waitForTerminal(ApiFlowRuntimeService service, String runId) throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        ApiFlowDtos.RunResponse run = service.getRun(runId);
        while (!run.status.equals("succeeded") && !run.status.equals("failed") && System.currentTimeMillis() < deadline) {
            Thread.sleep(25);
            run = service.getRun(runId);
        }
        return run;
    }
}
