# Real ApiFlow Integration Implementation Plan

> **Superseded:** Do not execute this plan. It assumed vendoring/copying ApiFlow core into this repository, which conflicts with the source-isolation requirement.

Use `docs/superpowers/plans/2026-06-24-real-apiflow-isolated-integration.md` as the active Phase 6 ApiFlow integration plan.

Reason for replacement:

- ApiFlow source has copyright constraints and must remain outside `ai-app-generator-mvp`.
- The main repository must not track `20250725_apiFlow`, `apiFlow-core`, `apiFlow-control`, or `apiFlow-spring` source files.
- The valid integration approach is a tracked sidecar wrapper plus external ApiFlow dependency via `APIFLOW_SOURCE_DIR`, Gradle composite build, or `mavenLocal`.
