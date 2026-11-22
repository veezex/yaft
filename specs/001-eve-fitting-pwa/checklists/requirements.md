# Specification Quality Checklist · EVE Online Browser Fitting Assistant

**Purpose** · Check that the specification is complete before planning

**Date** · 2026-11-22

**Specification** · [EVE Online Browser Fitting Assistant](../spec.md)

## Content Quality

- [x] Technology choices are deferred to planning
- [x] Player and maintainer workflows are described
- [x] Requirements are clear to stakeholders
- [x] All mandatory sections are complete

## Requirement Completeness

- [x] No open questions require clarification of the requirements
- [x] Requirements are unambiguous and testable
- [x] Success criteria are measurable
- [x] Success criteria can be verified independently of implementation technology
- [x] Acceptance scenarios are described
- [x] Edge cases are defined
- [x] Scope boundaries are documented
- [x] Dependencies and assumptions are listed

## Feature Readiness

- [x] Acceptance scenarios or edge cases cover all functional requirements
- [x] Scenarios cover the main player and maintainer workflows
- [x] Measurable criteria cover the intended application outcomes
- [x] The specification describes expected behavior and external compatibility

## Notes

| Scenario | Requirements | Verification |
| --- | --- | --- |
| Create and edit a fit | FR-002–FR-005, FR-007 | Catalog, constraints, calculation accuracy, saving, and restoration. SC-001–SC-003 |
| Connect a character and exchange fits with EVE Online | FR-009–FR-011 | Skills and fitting operations for two characters, plus a partial price estimate. SC-004 |
| Update data and compatibility | FR-014–FR-015 | Two data releases, an interrupted update, rollback, and a known change in Pyfa rules. SC-005–SC-006 |
| Analyze and transfer fits | FR-002, FR-005–FR-008 | Comparison, profiles, external effects, calculation accuracy, and exchange in supported formats. SC-001, SC-004 |
| Use the app on a phone and offline | FR-001, FR-007, FR-012–FR-013 | Installation where supported, editor use on a narrow screen, offline restart, and local library transfer. SC-002–SC-003, SC-007 |

EVE SSO, ESI, SDE, and fitting formats are external compatibility requirements. The Pyfa reference corpus and browser sign-in are covered by planning and subsequent acceptance testing. The checkmarks above record the document review.
