package com.aigenerator.apiflow;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

public final class SidecarMain {
    private static final ObjectMapper JSON = new ObjectMapper();

    private SidecarMain() {
    }

    public static void main(String[] args) throws IOException, InterruptedException {
        int port = Integer.parseInt(System.getenv().getOrDefault("APIFLOW_SIDECAR_PORT", "4317"));
        Path runtimeRoot = Path.of(System.getenv().getOrDefault("APIFLOW_RUNTIME_DIR", "build/apiflow-runtime"));
        ApiFlowRuntimeService runtime = new ApiFlowRuntimeService(runtimeRoot);
        CountDownLatch shutdown = new CountDownLatch(1);

        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/health", exchange -> handleHealth(exchange));
        server.createContext("/api/apiflow", exchange -> handleApi(runtime, exchange));
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            runtime.close();
            server.stop(0);
            shutdown.countDown();
        }));
        System.out.println("apiflow-sidecar listening on http://127.0.0.1:" + port);
        shutdown.await();
    }

    public static String healthJson() {
        return "{\"ok\":true,\"service\":\"apiflow-sidecar\"}";
    }

    private static void handleHealth(HttpExchange exchange) throws IOException {
        addCors(exchange);
        if (handleOptions(exchange)) {
            return;
        }
        if (!"GET".equals(exchange.getRequestMethod())) {
            writeJson(exchange, 405, new ApiFlowDtos.ErrorResponse("method not allowed"));
            return;
        }
        byte[] body = healthJson().getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    private static void handleApi(ApiFlowRuntimeService runtime, HttpExchange exchange) throws IOException {
        addCors(exchange);
        if (handleOptions(exchange)) {
            return;
        }

        try {
            String[] parts = exchange.getRequestURI().getPath().split("/");
            String method = exchange.getRequestMethod();
            if (parts.length == 6 && "api".equals(parts[1]) && "apiflow".equals(parts[2])
                    && "workflows".equals(parts[3]) && "runs".equals(parts[5]) && "POST".equals(method)) {
                ApiFlowDtos.StartRunRequest request = JSON.readValue(exchange.getRequestBody(), ApiFlowDtos.StartRunRequest.class);
                request.workflowId = isBlank(request.workflowId) ? decode(parts[4]) : request.workflowId;
                writeJson(exchange, 202, runtime.startRun(request));
                return;
            }

            if (parts.length == 5 && "api".equals(parts[1]) && "apiflow".equals(parts[2])
                    && "runs".equals(parts[3]) && "GET".equals(method)) {
                writeJson(exchange, 200, runtime.getRun(decode(parts[4])));
                return;
            }

            if (parts.length == 6 && "api".equals(parts[1]) && "apiflow".equals(parts[2])
                    && "runs".equals(parts[3]) && "events".equals(parts[5]) && "GET".equals(method)) {
                long after = readAfterSequence(exchange.getRequestURI());
                List<ApiFlowDtos.RunEvent> events = runtime.getEvents(decode(parts[4]), after);
                writeJson(exchange, 200, events);
                return;
            }

            if (parts.length == 6 && "api".equals(parts[1]) && "apiflow".equals(parts[2])
                    && "runs".equals(parts[3]) && "cancel".equals(parts[5]) && "POST".equals(method)) {
                writeJson(exchange, 200, runtime.cancelRun(decode(parts[4])));
                return;
            }

            writeJson(exchange, 404, new ApiFlowDtos.ErrorResponse("not found"));
        } catch (IllegalArgumentException error) {
            writeJson(exchange, 400, new ApiFlowDtos.ErrorResponse(error.getMessage()));
        } catch (Exception error) {
            writeJson(exchange, 500, new ApiFlowDtos.ErrorResponse(error.getMessage()));
        }
    }

    private static long readAfterSequence(URI uri) {
        String query = uri.getRawQuery();
        if (query == null || query.isBlank()) {
            return 0;
        }
        for (String item : query.split("&")) {
            String[] pair = item.split("=", 2);
            if (pair.length == 2 && "after".equals(pair[0])) {
                return Long.parseLong(pair[1]);
            }
        }
        return 0;
    }

    private static void writeJson(HttpExchange exchange, int status, Object value) throws IOException {
        byte[] body = JSON.writeValueAsBytes(value);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    private static void addCors(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "content-type");
    }

    private static boolean handleOptions(HttpExchange exchange) throws IOException {
        if (!"OPTIONS".equals(exchange.getRequestMethod())) {
            return false;
        }
        exchange.sendResponseHeaders(204, -1);
        exchange.close();
        return true;
    }

    private static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
