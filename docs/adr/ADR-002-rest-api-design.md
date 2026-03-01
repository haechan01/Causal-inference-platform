# ADR-002: RESTful API Design with Flask Blueprints

**Status:** Accepted
**Date:** 2025-10-31
**Deciders:** Development Team

## Context

Causalytics requires a backend API to support user authentication, project management, file uploads, and causal analysis features. The API needs to:

- Provide clear, predictable endpoints for the React frontend
- Support authentication and authorization for multi-user access
- Scale as new features are added without becoming monolithic
- Follow industry standards for maintainability and developer experience
- Handle CORS for cross-origin requests from the frontend
- Provide consistent error handling and response formats
- Be testable, maintainable, and well-documented

The backend is built with Flask (Python), and we need to establish architectural patterns that will guide API development throughout the project lifecycle.

## Decision

We will implement a **RESTful API architecture** using **Flask Blueprints** for modular route organization, with **JWT Bearer token authentication** for security.

### Core Design Principles:

#### 1. Blueprint-Based Modularization
- Organize routes into separate blueprints by domain/resource:
  - `auth_bp`: Authentication endpoints (`/api/auth/*`)
  - `projects_bp`: Project and file management (`/api/projects/*`)
  - `analysis_bp`: Data analysis operations (`/api/analysis/*`)
- Each blueprint is self-contained in `routes/{domain}.py`
- URL prefixes defined at blueprint level for consistency

#### 2. RESTful Resource Naming Conventions
- **URL Structure**: `/api/{resource}/{id}/{sub-resource}`
  - Examples:
    - `GET /api/projects` - List all projects
    - `GET /api/projects/5` - Get project #5
    - `POST /api/projects/5/upload` - Upload file to project #5
    - `GET /api/projects/5/datasets` - List datasets in project #5

- **Resource Naming Rules**:
  - Use plural nouns for collections (`/projects`, `/datasets`, `/analyses`)
  - Use kebab-case for multi-word resources (future: `/user-profiles`)
  - Avoid verbs in URLs (actions implied by HTTP method)
  - Nest related resources under parent resources

#### 3. HTTP Methods and Semantics
- `POST`: Create new resources, perform actions
  - Returns `201 Created` for resource creation
  - Returns `200 OK` for actions that don't create resources
- `GET`: Retrieve resources (read-only, idempotent)
  - Returns `200 OK` with resource data
- `PUT`: Full resource update (future use)
- `PATCH`: Partial resource update (future use)
- `DELETE`: Remove resources (future use)

#### 4. Authentication Strategy
- **JWT (JSON Web Tokens)** via Flask-JWT-Extended
- **Two-token system**:
  - Access token: 1 hour expiration (configurable via env)
  - Refresh token: 30 days expiration (configurable via env)
- **Token format**: `Authorization: Bearer <token>`
- **Protected routes**: Decorated with `@jwt_required()`
- **Token payload**: User ID stored as string for JWT compatibility
- **Refresh flow**: `/api/auth/refresh` endpoint for token renewal

#### 5. Response Format Standards
**Success Response Structure:**
```json
{
  "message": "Descriptive success message",
  "data_field": { ... },
  "related_field": [ ... ]
}
```

**Error Response Structure:**
```json
{
  "error": "Clear, actionable error message"
}
```

**Status Code Usage:**
- `200 OK`: Successful GET/POST actions
- `201 Created`: Successful resource creation
- `400 Bad Request`: Invalid client input
- `401 Unauthorized`: Missing/invalid authentication
- `403 Forbidden`: Authenticated but lacks permission
- `404 Not Found`: Resource doesn't exist
- `409 Conflict`: Resource already exists (e.g., duplicate email)
- `500 Internal Server Error`: Unexpected server errors

#### 6. Error Handling Pattern
```python
try:
    # Business logic
    db.session.commit()
    return jsonify({"result": data}), 200
except ValueError as e:
    return jsonify({"error": "Invalid input"}), 400
except Exception as e:
    db.session.rollback()
    logger.error("Operation failed: %s", str(e))
    return jsonify({"error": "Operation failed"}), 500
```

- All routes wrapped in try-except blocks
- Database rollback on errors
- Structured logging for debugging
- Generic error messages to clients (no stack traces in production)

#### 7. Configuration Management
- All sensitive configuration via environment variables
- Required variables validated at application startup
- Configuration categories:
  - **JWT**: `JWT_SECRET_KEY`, `JWT_ACCESS_TOKEN_EXPIRES`, `JWT_REFRESH_TOKEN_EXPIRES`
  - **Database**: `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME`
  - **AWS**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET_NAME`
  - **CORS**: `CORS_ORIGINS` (comma-separated list)

#### 8. CORS Configuration
- Enabled via Flask-CORS extension
- Allowed origins from environment variable
- Defaults to `http://localhost:3000` for development
- Supports multiple origins (comma-separated)

## Consequences

### Positive

- **Modularity**: Blueprints provide clear separation of concerns; easy to locate and modify specific functionality
- **Scalability**: New features can be added as new blueprints without touching existing code
- **Predictability**: RESTful conventions make API intuitive for frontend developers
- **Security**: JWT tokens provide stateless, secure authentication; refresh tokens minimize exposure
- **Testability**: Blueprint isolation simplifies unit and integration testing
- **Maintainability**: Consistent patterns reduce cognitive load; new developers can quickly understand structure
- **Flexibility**: Environment-based configuration supports multiple deployment environments
- **Standards Compliance**: Follows REST principles and HTTP specifications
- **Frontend Integration**: JSON responses and CORS support seamless React integration
- **Developer Experience**: Clear error messages and consistent responses improve DX
- **Documentation**: Blueprint structure maps directly to API documentation

### Negative

- **Boilerplate**: RESTful patterns can create more code than ad-hoc approaches
- **Token Management**: JWT requires careful handling on client-side (storage, refresh logic)
- **Statelessness Limitations**: JWT tokens cannot be invalidated server-side without additional infrastructure (blacklist)
- **Learning Curve**: Team must understand REST principles and Flask-JWT-Extended
- **Verbosity**: Consistent error handling requires repetitive try-catch blocks
- **Environment Complexity**: Multiple environment variables must be managed across environments
- **CORS Configuration**: Incorrect CORS setup can block legitimate frontend requests
- **Over-Engineering Risk**: Simple CRUD operations still require full REST implementation
- **Token Expiration**: Short-lived access tokens require refresh logic in frontend

## Alternatives Considered

### 1. GraphQL API
**Description**: Use GraphQL instead of REST for flexible, client-driven queries.

**Pros**:
- Clients request only needed fields (reduces over-fetching)
- Single endpoint for all operations
- Strong typing via GraphQL schema
- Excellent tooling (GraphiQL, Apollo)

**Cons**:
- Higher learning curve for team
- More complex server implementation
- Caching strategies more difficult
- Overkill for simple CRUD operations
- Less standardized than REST
- Python GraphQL libraries less mature than Flask

**Rejection Reason**: REST is sufficient for current use cases. The flexibility of GraphQL is not needed, and the team has more experience with REST.

### 2. Monolithic Flask Application (No Blueprints)
**Description**: Define all routes in a single `app.py` file without blueprint separation.

**Pros**:
- Simpler initial setup
- Fewer files to navigate
- Direct route registration
- Less boilerplate

**Cons**:
- Becomes unmanageable as application grows
- Difficult to test specific modules
- No clear separation of concerns
- Hard to onboard new developers
- Merge conflicts in single file

**Rejection Reason**: Does not scale. Even with current scope (~15 endpoints), blueprints improve organization significantly.

### 3. RPC-Style API (Function Calls)
**Description**: Use function-like endpoints (e.g., `/api/create_project`, `/api/get_user`).

**Pros**:
- Intuitive for developers from RPC backgrounds
- Clear action names
- Simple to implement

**Cons**:
- Not RESTful (violates HTTP semantics)
- Doesn't leverage HTTP methods
- Less predictable for frontend developers
- Poor caching behavior
- Against web standards

**Rejection Reason**: REST is the industry standard for web APIs. RPC-style APIs are harder to cache and don't follow HTTP best practices.

### 4. Session-Based Authentication (Cookies)
**Description**: Use Flask sessions with cookies instead of JWT tokens.

**Pros**:
- Server-side session control (can revoke immediately)
- Simpler client-side (no token management)
- Built into Flask
- CSRF protection patterns well-established

**Cons**:
- Requires server-side session storage (Redis, database)
- Stateful (harder to scale horizontally)
- CORS complexity with credentials
- Not suitable for mobile apps or microservices
- Less flexible for multi-service architectures

**Rejection Reason**: JWT is stateless and better suited for modern SPA architectures. Easier to scale and works well with React frontend.

### 5. Flask-RESTful Extension
**Description**: Use Flask-RESTful library for API resource classes.

**Pros**:
- Resource-based class structure
- Built-in request parsing
- Automatic HTTP method routing
- Cleaner than raw blueprints for pure REST

**Cons**:
- Additional dependency
- More opinionated structure
- Learning curve for Flask-RESTful patterns
- Less flexibility for non-REST endpoints
- Project already established with blueprints

**Rejection Reason**: Standard Flask blueprints provide sufficient structure. Flask-RESTful would be beneficial for a greenfield project, but switching now adds complexity without clear benefits.

### 6. API Versioning from Start
**Description**: Version API endpoints (e.g., `/api/v1/projects`, `/api/v2/projects`).

**Pros**:
- Allows breaking changes without affecting existing clients
- Clear deprecation path
- Industry best practice for public APIs

**Cons**:
- Premature optimization (no external API consumers yet)
- Increased complexity
- Duplicates code during transitions
- More endpoints to document and test

**Rejection Reason**: YAGNI (You Aren't Gonna Need It). API versioning adds complexity before it's needed. Can be added later if external API access is provided.

---

## Implementation References

- Flask application setup: `backend/app.py:1-98`
- Blueprint examples:
  - Authentication: `backend/routes/auth.py:27`
  - Projects: `backend/routes/projects.py:14`
  - Analysis: `backend/routes/analysis.py:6`
- JWT configuration: `backend/app.py:23-42`
- CORS setup: `backend/app.py:13-15`
- Error handling pattern: `backend/routes/projects.py:164-253`

## Related ADRs

- ADR-001: Amazon S3 for File Storage (file upload endpoints)
- Future: ADR-003: Two-Token JWT Authentication Strategy (detailed authentication ADR)

---

## References

- [RESTful API Design Best Practices](https://restfulapi.net/)
- [Flask Blueprints Documentation](https://flask.palletsprojects.com/en/latest/blueprints/)
- [Flask-JWT-Extended Documentation](https://flask-jwt-extended.readthedocs.io/)
- [HTTP Status Code Definitions (RFC 7231)](https://tools.ietf.org/html/rfc7231#section-6)
- API Documentation: `backend/API_DOCUMENTATION.md`
