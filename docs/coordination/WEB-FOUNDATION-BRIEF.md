# Web foundation specialist brief

**State:** Active implementation; layout accepted, palette revision requested by Edward.  
**Owner:** Edward Adjei. **Coordinator:** This Ordo chat.  
**Area:** `apps/web` and `packages/client` only.

## Context

Edward said “Yes build” after the responsive-web-first / shared React Native and Expo mobile recommendation. iOS has priority within mobile; macOS follows. Use coordinated-development exclusively. No Superpowers development process applies.

## Build

Establish Next.js App Router web client with same-origin proxy to Fastify. Use the shared domain contracts. Implement account signup/login/logout, scoped workspace/project navigation, quick task capture, task details/subtasks, notes, daily views, and command search without AI. Explicitly label unimplemented Record/Upload/AI controls. Fictional example data is loaded only on explicit user request.

Preserve text on save failure. Queue task creates durably with owner identity and idempotency key; retry cannot duplicate. Keep local data isolated between accounts, and make pending writes visible. Do not advertise general offline editing or native mobile as delivered.

## Design

The clickable layout is `design/home-preview.html`. Edward accepted the calm layout and visible capture actions, but requested white backgrounds and neutral chrome instead of a green theme, so different task/workspace colors remain clear. Implement that palette revision in the working app. Prototype records are fictional and not application persistence.

## Verification and report

Run typecheck and production build, test queue/contract behavior where meaningful, then verify live account/create/reload/edit/complete and narrow-screen behavior. Return evidence and limits to the coordinator. Screenshots accompany UI review. No merge, deployment, real messages, provider processing, or shared-data edits. No AI attribution in commits/PR descriptions.
