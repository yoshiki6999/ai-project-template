# AI Autonomous Development — Deep Framework

> Read this when developing new features, new modules, or cross-module changes (CLAUDE.md §9).

## Development Philosophy

1. **Prototype-first**: Static UI → SPEC.md → automated development
2. **Contract-driven**: Modules communicate only through documented APIs
3. **Event-driven snapshots**: Commit on events, not on schedule
4. **Session continuity**: Every session ends with STATUS.md updated

## New Module Development Flow

```
1. Human provides: SPEC.md + optional JSX prototype
2. AI reads: CLAUDE.md → PROJECT.md → STATUS.md → CONTRACT.md
3. AI plans: derive API endpoints, DB tables, business logic from SPEC
4. Human approves plan (Prompt level)
5. AI executes: backend → verify → frontend → e2e verify
6. AI snapshots: L1 per function, L2 per feature, L3 status update
7. AI documents: update PROJECT.md, CONTRACT.md, STATUS.md
```

## SPEC.md Format

Every new feature/module should have a SPEC.md:

```markdown
# [Module Name] — Feature Specification

## Overview
[What this feature does in 1-2 sentences]

## User Stories
- As a [user type], I want to [action] so that [benefit]

## Acceptance Criteria
- [ ] [Specific, testable criterion]
- [ ] [Another criterion]

## UI Description
[Describe the UI layout, key components, user interactions]

## API Requirements
[List known API needs, or mark as "derive from UI"]

## Database Requirements
[List known schema needs, or mark as "derive from API"]

## Edge Cases
- [What happens when X?]
- [What if Y fails?]

## Security Considerations
- [Auth requirements]
- [Input validation needs]

## Out of Scope
- [What this feature does NOT include]
```

## Cross-Module Changes

When a change affects multiple modules:

1. Read ALL affected modules' sections in CONTRACT.md
2. Read MODULE-LOCK.md to understand file ownership
3. Plan changes to minimize cross-module impact
4. If interface changes needed → update CONTRACT.md FIRST (Prompt level)
5. Implement changes module by module
6. Test each module independently, then test integration

## Performance Checklist (for new features)

- [ ] Database queries use indexes for common lookups
- [ ] Lists/tables have pagination
- [ ] Large data transfers use streaming
- [ ] Expensive computations are cached with appropriate TTL
- [ ] Images/files have size limits and are validated server-side
- [ ] API responses include only necessary data (no over-fetching)

## Security Checklist (for new features)

- [ ] All endpoints require authentication (unless explicitly public)
- [ ] All user input validated and sanitized server-side
- [ ] File uploads: type check, size limit, content validation
- [ ] No secrets in client-side code or logs
- [ ] Rate limiting on sensitive endpoints (login, upload, etc.)
- [ ] Error responses reveal nothing about internal implementation

## Testing Strategy

### Unit Tests
- Business logic functions
- Data transformation/validation functions
- Utility functions

### Integration Tests
- API endpoint tests (normal + abnormal inputs)
- Database operations

### E2E Tests
- Complete user journeys
- Multiple user states (logged-in, logged-out, admin, etc.)
- Error scenarios

### Visual Tests
- Screenshots of all key page states
- Responsive layout checks (mobile, tablet, desktop)
- Console error checks
