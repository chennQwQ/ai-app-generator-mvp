# Design QA - AI App Builder Shell

Date: 2026-06-23

Reference: `assets/spec.png`

## Scope

- Match the visible desktop AI App Builder layout from the reference image.
- Omit the unimplemented top-right document/settings/avatar controls.
- Preserve the existing project, prompt, workspace, preview, run history, and log interactions.

## Verified

- Header uses a compact left brand strip with menu control and no unimplemented right-side controls.
- Main surface uses the reference three-column structure: Projects, conversation, Workspace.
- Project creation controls, search, sort, template selector, project cards, prompt box, Send button, tabs, file viewer, run history, and logs match the reference density and panel treatment.
- File tree uses compact type markers (`<>`, `#`, `{}`) instead of generic dash bullets.
- Start Preview and Send buttons include lightweight icon shapes without adding new dependencies.
- Preview status and preview URL remain accessible to tests and assistive technology without changing the reference visual layout.

## Manual Run

- Opened the app at `http://127.0.0.1:5182` with API at `http://127.0.0.1:4330`.
- Created project `OpenCode E2E`.
- Sent prompt: `Update the app to show a Hello World heading and one green button.`
- Backend stored the message, created an agent run, and audit logged `opencode run --agent build ...`.
- OpenCode process reached the CLI but did not complete within the manual wait window; the run was cancelled from the UI to avoid leaving a background process running.

## Notes

- The log panel currently displays raw OpenCode JSON events. This is acceptable for the current implementation but should be formatted in a later UI polish pass.
- The in-app browser screenshot command timed out after the final file-tree icon update; DOM verification confirmed the final icon labels were rendered.
