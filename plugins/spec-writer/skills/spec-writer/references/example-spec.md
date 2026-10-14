# Auth0 Organizations, RBAC & SSO

Technical specification

| Status | Owner | Reviewers | Last updated |
|---|---|---|---|
| In review | Platform engineering | Backend and frontend leads, security | 2026-09-04 |

## Contents

1. Purpose
2. Goals and non-goals
3. Definitions
4. Platform constraints
5. Architecture
6. Token contract
7. Roles and permissions
8. Authentication and the org gate
9. Org provisioning
10. Membership management
11. Invitations
12. Enterprise SSO
13. Frontend
14. Rate limiting and observability
15. API surface
16. Error semantics
17. Security invariants
18. Open decisions

## 01 Purpose

Implement single sign-on and organization management on Auth0, enforced through the Kong API gateway. Every customer is an Auth0 Organization, and a user must belong to one to reach the app at all. Access inside an org is governed by three roles; enterprise customers authenticate through their own identity provider.

Requirements are numbered so implementations, tests, and gateway config can cite them directly.

## 02 Goals and non-goals

Goals

- Every user is a member of at least one Auth0 Organization, and cannot reach the application otherwise.
- Access is governed by three roles with org-scoped permissions.
- Customers onboard by email invitation, or through their own identity provider for enterprise orgs.
- Tenant isolation holds even if a single enforcement layer is misconfigured.

Non-goals

- Billing or plan tiers tied to orgs.
- Self-serve org signup. All orgs are provisioned by Hume staff.
- Per-org login page theming.
- SCIM or directory sync.

## 03 Definitions

| Term | Meaning |
|---|---|
| Organization | An Auth0 Organization representing one customer tenant. |
| hume-internal | A reserved Organization whose members are Hume staff. |
| Member | A user holding an Auth0 membership in a given Organization. |
| Role | One of `hume_admin`, `admin`, `standard_user`. |
| Org-scoped role | A role assigned to a user within an organization. Only these appear in a token issued through an organization login. |
| Direct role | A role assigned to a user at tenant level. Exists independently of any organization and is not surfaced in an organization login without an Action reading it. |
| Permission | A capability string carried in the token's `permissions` claim. |
| Org claim | `https://hume.app/org_id` on an issued token. |
| The gate | The org-membership check that returns 404 to non-members. |

## 04 Platform constraints

Auth0 limits that shape the design and the commercial plan. These are not requirements on us; they are conditions we build within.

**CON-1** Organization count is capped by plan tier. One customer maps to one organization, so the tier sets a ceiling on how many customers can be onboarded. The free tier allows a handful; B2B tiers allow substantially more. The tier and its ceiling MUST be confirmed before launch, and headroom monitored.

**CON-2** Enterprise connections are plan-gated. SAML and OIDC connections for customer identity providers are limited by tier and typically metered per connection. Enterprise SSO capacity is a commercial constraint, not just a technical one.

**CON-3** One email provider serves the whole tenant. Invitation, verification, password reset, MFA, and blocked-account email all route through a single configured provider. Changing it affects every authentication email, not just invitations.

**CON-4** The built-in email provider cannot be used. It is limited to roughly ten messages per minute with excess silently discarded, sends from a fixed Auth0 address, offers no delivery guarantee, and disables template customization entirely.

**CON-5** Auth0 log retention is short and tier-dependent. Tenant logs must be streamed out to have any usable history; see OBS-4.

**CON-6** The Management API is rate-limited per tenant. Provisioning, membership, and invitation operations share that budget, so bulk operations need backoff and should not run in a request-response path where avoidable.

## 05 Architecture

### Modelling the platform-operator role

Auth0 supports both org-scoped and direct role assignment. The constraint that matters here is narrower than "roles must be org-scoped": when a user authenticates through an organization, only their org-scoped roles are reflected in the issued token. A directly assigned role still exists, but does not appear unless an Action fetches and injects it.

That leaves two viable ways to model `hume_admin`:

A. Reserved internal organization. Hume staff are members of `hume-internal` and hold `hume_admin` as an org-scoped role there. The Post-Login Action grants cross-org scope when the login org is `hume-internal`. Cost: one reserved org and a membership to maintain per staff member. Roles arrive in the token natively, with no extra call at login.

B. Direct tenant-level assignment. `hume_admin` is assigned directly to the user at tenant level. The Post-Login Action reads it through the Management API and injects the claim on every login. Cost: a Management API call inside the login path, against a rate-limited budget and the sub-100 ms Action target in AUTH-4, unless cached.

Recommendation: A. Option B puts a rate-limited external call in the hot path of every staff login, which conflicts with AUTH-4 and adds a failure mode to authentication itself. A keeps all three roles in one consistent model at the cost of one reserved organization. This SHOULD be confirmed rather than assumed; see Open decisions.

### Enforcement layers

A request passes inward through three checks.

1. Auth0 Post-Login Action. Denies login when there is no org context, so no token is issued at all. Getting past this requires a validly signed token.
2. Kong gateway. Validates the JWT, requires a non-empty org claim, and strips client-supplied identity headers. Getting past this puts unvalidated requests in front of services.
3. Services. Re-validate the token and scope every query to the org inside it. Getting past this exposes one tenant's data to another.

**ARCH-1** Each layer MUST be correct on its own; none MAY assume another is functioning.

**ARCH-2** Layer 3 MUST NOT derive authorization from gateway-forwarded headers. The token is the only source of truth for org identity (SEC-2).

## 06 Token contract

### Claims

**TOK-1** Issued tokens MUST carry the claims below.

| Claim | Type | Notes |
|---|---|---|
| `sub` | string | Auth0 user ID |
| `https://hume.app/org_id` | string | Non-empty. Auth0 Organization ID. |
| `https://hume.app/org_name` | string | Display name, for UI only |
| `https://hume.app/roles` | string[] | Org-scoped role names held in this org |
| `permissions` | string[] | Flattened permission set from Auth0 RBAC |

**TOK-2** Custom claims MUST be URI-namespaced. Auth0 silently drops claims that are not.

**TOK-3** Renaming a claim MUST be treated as a coordinated change across the Action, the gateway, and the services. Claim names are a hard contract across all three enforcement layers; renaming one breaks all of them at once.

### Forwarded headers

**TOK-4** The gateway MUST forward `X-Org-Id`, `X-User-Id`, `X-User-Permissions`, and `X-Request-Id` to upstreams, and MUST strip the first three from all inbound client requests.

**TOK-5** Services MAY use forwarded headers for logging and correlation and MUST NOT use them for authorization decisions.

## 07 Roles and permissions

### Permissions

```
org:read                  org:update
org:members:read          org:members:invite       org:members:remove
org:roles:assign          org:connections:manage
platform:orgs:provision   platform:org_admin:assign
```

### Role composition

| Role | Who | Permissions |
|---|---|---|
| `hume_admin` | Hume staff | All permissions |
| `admin` | Customer administrator | All except `platform:*` |
| `standard_user` | Customer user | `org:read` |

**RBAC-1** The API definition MUST have RBAC and "Add Permissions in the Access Token" enabled.

**RBAC-2** Services MUST authorize on permission strings, never on role names.

**RBAC-3** No role other than `hume_admin` MAY be able to grant `hume_admin`, by any request path.

**RBAC-4** Role IDs MUST be stored in per-environment config. Auth0 references roles by ID, and IDs differ per tenant.

**RBAC-5** Each role's exact permission set MUST be asserted by an automated test.

**RBAC-6** Roles MUST be assigned as org-scoped roles, not direct tenant-level roles, so that they appear in tokens issued through organization login without additional lookup.

## 08 Authentication and the org gate

**AUTH-1** The Auth0 application MUST be configured with Organization Behavior "Require Organization". A login without an organization parameter MUST be rejected by Auth0.

**AUTH-2** Login flow MUST default to "No prompt", with the org picker as fallback.

**AUTH-3** The Post-Login Action MUST deny login when `event.organization` is undefined, with a distinguishable error code.

**AUTH-4** The Action MUST complete in under 100 ms, and MUST be version-controlled and deployed through tooling rather than edited in the dashboard.

**AUTH-5** Auth0 tenant configuration MUST be reproducible from version control with no manual dashboard steps.

**ORG-1** Any authenticated request whose token lacks a non-empty org claim MUST receive 404, never 403 or 401.

**ORG-2** The org-less 404 MUST be indistinguishable from a genuine 404 in body, status, headers, and response timing.

**ORG-3** The gateway and the services MUST return byte-identical 404 responses. A difference between them reveals which layer rejected the request.

**ORG-4** The canonical 404 response (exact body, status line, and header set) MUST be defined once in a shared artifact that both the gateway config and the service code consume.

**ORG-5** The gate MUST apply to every route including root, excepting only health checks and public static assets.

**ORG-6** The Post-Login Action's denial error MUST be mapped at the callback handler to the same 404.

> **Why 404 and not 403.** A 403 confirms the resource exists. Timing is part of the response: a gate that short-circuits measurably faster than a real 404 is still a signal, so the two paths need comparable cost.

> **Why one shared artifact.** Two independent implementations of "the standard 404" will diverge, which is why ORG-4 requires a single source both layers consume.

## 09 Org provisioning

Hume staff create every organization and seat its first administrator. There is no self-serve path.

**PROV-1** Only holders of `platform:orgs:provision` MAY create organizations. All others receive 403.

**PROV-2** Org creation MUST accept name, display name, metadata, and logo.

**PROV-3** The org name MUST be validated against Auth0's constraints (lowercase alphanumeric with hyphens) before the API call.

**PROV-4** Duplicate names MUST be rejected cleanly rather than producing a partially created org.

**PROV-5** `display_name` is the customer-visible value and MUST be used wherever an org is shown in the product. `name` is an identifier, not a label.

**PROV-6** A newly provisioned org MUST be immediately usable for login.

**PROV-7** Every provisioning action MUST be audit-logged with actor and timestamp.

**PROV-8** Anything holding an org reference SHOULD store the organization ID rather than the name, since `name` can change.

> **Renaming.** Auth0's Management API permits updating an organization's `name`, `display_name`, branding, and metadata after creation, so `name` is not immutable at the platform level. The Auth0 Deploy CLI has historically not supported renaming, so if organizations are managed declaratively through that tooling, treat `name` as fixed in practice and rename through the Management API or dashboard when needed.

## 10 Membership management

Org administrators manage their own members. This is the tenant isolation boundary and the highest-risk surface in the system.

**MEM-1** Org ID for every member operation MUST be read from the token claim. No endpoint MAY accept an org identifier from request body, path, or query.

**MEM-2** An admin in Org A MUST NOT be able to read or mutate Org B's members under any request shaping, including forged gateway headers.

**MEM-3** Assignable roles MUST be limited to `admin` and `standard_user`.

**MEM-4** Removing or demoting the last remaining admin in an org MUST be rejected with a clear message.

**MEM-5** Self-demotion MUST be blocked.

**MEM-6** All membership mutations MUST be audit-logged.

**MEM-7** Role changes MUST take effect on the member's next token refresh. Immediate revocation is not specified; see Open decisions.

> **Offboarding latency.** MEM-7 means a removed or demoted user keeps their prior access until their token expires. If that window is unacceptable, a revocation mechanism needs specifying; see Open decisions.

## 11 Invitations

The primary join path for orgs without enterprise SSO. Auth0's invitation tickets handle identity verification, so the role decision is made at invite time and applied on acceptance.

**INV-1** Invitations MUST use Auth0 Organization Invitations, passing org-scoped role IDs at invite time so the role is applied on acceptance.

**INV-2** Ticket TTL MUST be set to 7 days. Auth0 defaults to 7 days when unspecified and permits a maximum of 30.

**INV-3** Resend MUST issue a fresh ticket and revoke the prior one. Tickets are single-use; leaving both live is a defect.

**INV-4** Inviting a user who is already a member MUST be rejected.

**INV-5** Bulk invite MUST NOT discard successful invitations when one or more invitations in the batch fail.

**INV-6** Expired and revoked tickets MUST produce a clear user-facing message.

**INV-7** Listing pending invitations MUST NOT assume invitations persist. Auth0 marks unaccepted invitations expired and deletes them in time, so the list is not a durable record; audit entries are (OBS-5).

**INV-8** Acceptance marks the invitee's email as verified. Any downstream logic that treats email verification as independently earned MUST account for this.

**INV-9** Where an invitation is accepted through federated login, the identity provider MUST return an email matching the invited address or acceptance fails. This case MUST produce a message naming the mismatch rather than a generic error.

**INV-10** A custom SMTP provider MUST be configured with verified SPF and DKIM, per CON-4.

**INV-11** The invitation template MUST include org display name, inviter name, and expiry.

> **Where invitations and SSO collide.** INV-9 is the collision point. An enterprise user invited at their work address whose IdP asserts a different primary address cannot accept, and the failure is opaque unless handled explicitly.

## 12 Enterprise SSO

Enterprise customers authenticate through their own identity provider, so access follows their existing joiner and leaver processes.

**SSO-1** Enterprise SAML and OIDC connections MUST be attachable to and detachable from an individual org, within the tier limits in CON-2.

**SSO-2** Connections MUST set `assign_membership_on_login`, granting `standard_user` by default.

**SSO-3** Home realm discovery MUST route by email domain to the correct org's identity provider.

**SSO-4** SSO-issued tokens MUST pass gateway and service validation identically to database-connection tokens.

**SSO-5** Orgs without SSO MUST continue to work on invitation and database login.

**SSO-6** At least two identity provider types MUST be validated end to end, for example Okta SAML and Entra ID OIDC.

**SSO-7** Customer onboarding documentation MUST state that identity provider access is org access, and that the customer's own group scoping controls who can log in.

> **SSO bypasses invitations entirely.** With `assign_membership_on_login`, IdP access is org access, which means the customer's own group scoping performs real security work on our behalf. SSO-7 exists so customers know that.

## 13 Frontend

**UI-1** The SPA MUST pass the organization on login. Whether the organization ID or name is passed MUST be decided explicitly: passing the name requires the tenant-level setting permitting organization names in the Authentication API, and accepts only `name`, never `display_name`.

**UI-2** Components and navigation MUST be gated on the `permissions` claim.

**UI-3** UI gating is presentation only. Every gated action MUST still have an independent server-side guard.

**UI-4** Token refresh MUST preserve org context without dropping in-flight requests.

**UI-5** Org-less users MUST see the 404 page, not a broken application shell.

**UI-6** 404 and 429 responses MUST be distinguishable from application errors in the client.

**UI-7** Organization display MUST use `display_name` from the token, never `name`.

## 14 Rate limiting and observability

**OBS-1** Rate limits MUST be keyed on org ID rather than applied globally, so one tenant cannot degrade service for others.

**OBS-2** Administrative and invitation endpoints MUST carry tighter limits than standard routes.

**OBS-3** 429 responses MUST include `Retry-After` and standard rate-limit headers.

**OBS-4** Auth0 tenant logs MUST be streamed to the observability platform, per CON-5.

**OBS-5** Audit entries MUST be recorded for org provisioning, role assignment, member removal, invitation issued and revoked, and connection attached and removed.

**OBS-6** Each audit entry MUST capture actor, target, org, action, timestamp, result, and correlation ID.

**OBS-7** A privileged action MUST be traceable from gateway log through to audit entry via correlation ID.

**OBS-8** Alerts MUST fire on JWKS fetch failure, gateway error-rate spikes, per-org failed-login spikes, and any `platform:*` action.

**OBS-9** Organization count against the tier ceiling in CON-1 MUST be monitored, with an alert before the limit is reached.

> **JWKS failure is an outage.** A JWKS fetch failure is a total outage condition, not a degradation. It needs its own alert rather than being folded into general error rate.

## 15 API surface

All routes sit behind the gate. Org context is always derived from the token, never from the request.

### Platform administration

Requires `platform:*`.

```
POST   /admin/organizations                        Create org
GET    /admin/organizations                        List, paginated + search
PATCH  /admin/organizations/:id                    Update display name, logo
POST   /admin/organizations/:id/admins             Invite first admin as `admin`
POST   /admin/organizations/:id/connections        Attach enterprise IdP
DELETE /admin/organizations/:id/connections/:cid   Detach enterprise IdP
```

### Org administration

Org-scoped. Requires `org:*`.

```
GET    /org/members                  List members with roles, paginated
DELETE /org/members/:id              Remove member
PATCH  /org/members/:id/roles        Reassign role
POST   /org/invitations              Invite, single or bulk
GET    /org/invitations              List pending
DELETE /org/invitations/:id          Revoke
POST   /org/invitations/:id/resend   Reissue and revoke prior
```

## 16 Error semantics

| Condition | Status | Response |
|---|---|---|
| No org claim, or not a member | 404 | The canonical 404 from ORG-4, identical at every layer |
| Valid org, permission missing | 403 | Generic denial, no detail on which permission |
| Token invalid, expired, or malformed | 401 | Standard |
| Rate limit exceeded | 429 | With `Retry-After` |

**ERR-1** 403 responses MUST NOT name the missing permission.

**ERR-2** 404 responses MUST NOT vary by whether the underlying resource exists.

## 17 Security invariants

These are the properties whose violation constitutes a security incident rather than a bug.

**SEC-1** Header sanitation. The gateway strips `X-Org-Id`, `X-User-Id`, and `X-User-Permissions` from inbound client requests. If a client can inject `X-Org-Id`, every downstream org check is bypassed and tenant isolation is gone. This MUST have a dedicated regression test.

**SEC-2** Token as sole authority. Services read org identity from the validated token claim only. Forwarded headers are logging metadata and carry no authority.

**SEC-3** No gateway bypass. Upstream services are network-isolated and unreachable except through the gateway.

**SEC-4** Least privilege on the Management API. The machine-to-machine client holds only organization, member, member-role, and invitation grants plus `read:users`. The grant list is the blast radius if the secret leaks. The secret lives in the secrets manager, never in the repository.

**SEC-5** Privilege escalation boundary. No path exists by which `admin` obtains `hume_admin` or any `platform:*` permission.

**SEC-6** Cross-tenant isolation. Every org-scoped endpoint has explicit negative tests proving Org A cannot reach Org B's data.

### Required adversarial tests

**SEC-7** Every test below MUST pass before release.

- A forged `X-Org-Id` header does not reach an upstream service
- A direct-to-upstream request from outside the network is refused
- A valid Org A token cannot read or mutate Org B data on any endpoint
- Expired, malformed, and unsigned tokens are rejected at both the gateway and the service
- An org-less token receives 404 on every route including root
- Gateway and service 404 responses are byte-identical
- Auth0 signing key rotation does not cause an outage

## 18 Open decisions

These are unresolved and block the work they affect.

| Decision | Consequence |
|---|---|
| Confirm the `hume_admin` model: reserved internal org, or direct tenant-level assignment? | Section 05 recommends the reserved org because the alternative puts a rate-limited Management API call in every staff login. Confirm rather than inherit. |
| Confirm plan tier and its organization ceiling | One org per customer means the tier caps customer count (CON-1). Also determines enterprise connection capacity. |
| Can a user belong to more than one org? | Determines login prompt mode, the shape of claim validation, and whether the UI needs an org switcher. |
| Can `hume_admin` act inside a customer org, or only provision it? | If yes, membership management needs a cross-org path with its own audit treatment. |
| Is immediate role revocation required? | MEM-7 currently defers to token refresh. If offboarding latency is unacceptable, a revocation mechanism must be specified. |
| Organization ID or name in the login parameter? | UI-1. Names are friendlier in URLs but require a tenant-level setting and expose the internal name rather than the display name. |
| Permission naming convention | This spec uses `org:members:read`; Prism's scopes use `read:prism-runs`. Either two conventions live in one tenant, or these are renamed before anything depends on them. |
| Gateway plugin choice | The enterprise openid-connect plugin handles Auth0 discovery and JWKS rotation natively; the open-source jwt plugin needs per-consumer key registration and a rotation runbook. |
