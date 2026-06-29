package com.aigenerator.apiflow;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SidecarMainTest {
    @Test
    void healthJsonIsStable() {
        assertEquals("{\"ok\":true,\"service\":\"apiflow-sidecar\"}", SidecarMain.healthJson());
    }
}
