# Carrier Webhooks specification

Signature validation, replay protection, event deduplication and event reconciliation.

## Required acceptance criteria
- Server-side validation and authorization are enforced.
- Sensitive data is minimized and never logged unnecessarily.
- Failure paths and retries are tested.
- User-visible status is truthful and auditable.
- Add automated tests, monitoring, documentation and rollback steps.
- Keep this feature disabled until its provider dependencies and compliance requirements are satisfied.
