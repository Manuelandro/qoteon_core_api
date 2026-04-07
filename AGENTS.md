# AGENTS.md

## Project rules
- The Core API is the public backend entry point for the frontend
- Keep route handlers thin; business logic belongs in services
- Do not duplicate Prompt Library logic in the Core API
- Do not duplicate Prompt Runner execution logic in the Core API
- Use client/adaptor boundaries for internal service communication
- Support both in-process modules and HTTP client implementations where practical
- Prefer explicit, readable code over abstraction-heavy patterns
- Optimize for MVP speed, but keep the design extensible
- Add tests for orchestration workflows and partial failure handling
