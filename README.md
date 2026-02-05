# Elvox Server

## Overview
Elvox Server is the core backend for a digital college election management system. It provides authentication, election administration, voting workflows, results publication/export, and appeals handling, with separate web and desktop APIs surfaced from the same Express application. It is designed to support multiple roles (students, teachers/tutors, supervisors, and administrators) and enforce role-scoped access to election data and actions.

## Tech Stack
- **Runtime & framework:** Node.js (ES modules) with Express.  
- **Database:** PostgreSQL via `pg` connection pooling.  
- **Authentication & security:** JWT, bcrypt, HTTP-only cookies.  
- **Storage:** Supabase Storage for file uploads.  
- **Notifications:** Expo push notifications and Brevo (email OTP).  
- **Utilities:** dotenv, multer, pdfkit, axios, cors, cookie-parser.  

## Architecture & Design
### Service layering
- **Routing layer:** Express routers under `/routes` for web and desktop clients, mounted in `app.js`.
- **Controller layer:** Controllers translate HTTP requests to service calls and responses.
- **Service layer:** Business logic and data access via PostgreSQL, including transactional workflows.
- **Data layer:** A shared PostgreSQL pool configuration with connection and error handling.

### Role-based access control
- **JWT-based authentication** populates `req.user`, and **role checks** are enforced via `requireRole` middleware.
- Teachers may have an **effective role** of `supervisor` during active elections via `resolveEffectiveRole`.
- Desktop voting devices authenticate using a device token verified against `voting_devices` entries.

### State-driven election lifecycle
Election status is computed using timestamp boundaries and advanced forward-only through the following states:
`draft → nominations → pre-voting → voting → post-voting → closed`. The scheduler updates status based on current time and triggers related actions (ballot entry creation and vote counting).

### Transaction usage and data integrity
Critical workflows (e.g., election creation/updates, vote casting, appeals creation, result publication) use PostgreSQL transactions (`BEGIN/COMMIT/ROLLBACK`) to ensure consistent state and avoid partial updates.

### Cron-based status transitions
A built-in scheduler runs every 30 seconds to advance election status, lock relevant rows, and trigger side effects (e.g., creating ballots, counting votes, sending notifications).

## Core Features
- **Authentication:** OTP-based signup and password reset flows, login/logout with JWT cookies, and user verification.
- **Election management:** Create/update elections, manage supervisors, configure categories, publish results, and generate secret keys for voting systems.
- **Candidate management:** Candidate applications, approval workflows, withdrawals, and asset uploads.
- **Voting:** Desktop voting system authentication, voter authentication, ballot retrieval, and vote casting.
- **Results:** Results retrieval, random result sampling, and export to CSV or PDF.
- **Appeals:** Appeal submission with optional attachments, and admin review/decision flow.
- **Notifications:** In-app notifications and push notifications via Expo, plus device registration.

## Database Overview
The service uses PostgreSQL with a pooled connection. The schema is inferred from queries in the codebase. Key tables referenced include:
- `users`, `students`, `teachers`, `classes`
- `elections`, `supervisors`, `voters`, `voting_devices`
- `candidates`, `ballot_entries`, `votes`, `results`
- `appeals`, `appeal_attachments`
- `notifications`, `push_notification_devices`
- `logs`

Because schema migrations are not present in this repository, you must provision the database and views (e.g., `student_user_view`, `teacher_user_view`) to match the queries used by services.

## API Overview
**Base health endpoints**
- `GET /` – basic liveness response
- `GET /healthz` – JSON health check

**Web API** (mounted in `app.js`)
- `/auth` – OTP, signup, login, logout, password reset, and profile checks
- `/students`, `/teachers`, `/users` – directory/user lookups and user management
- `/classes` – class data
- `/elections` – election lifecycle, supervisor management, logs, and admin actions
- `/candidates` – candidate applications, approvals, and retrieval
- `/notifications` – user notifications and read status
- `/appeals` – appeal creation and admin review
- `/results` – results retrieval and exports
- `/voters` – voter-related operations

**Desktop API** (voting system endpoints)
- `/desktop/verify` – verify device authentication
- `/desktop/elections` – get active election, activate voting system, cast votes
- `/desktop/voters` – authenticate voters
- `/desktop/candidates` – fetch ballot entries

> Note: The exact request/response schemas and validation rules live in controllers and services; consult those files for client integration.

## Environment Variables
The application reads the following environment variables from `process.env`. If a variable is used only in specific flows, it is marked as optional for those flows.

| Variable | Required? | Purpose |
| --- | --- | --- |
| `PORT` | **Required** | Port for the Express server to listen on. |
| `DB_URL` | **Required** | PostgreSQL connection string for the `pg` pool. |
| `JWT_SECRET` | **Required** | JWT signing/verification for session tokens (auth middleware and login). |
| `SIGNUP_SECRET` | **Required** | JWT signing for short-lived signup OTP tokens. |
| `PASSWORD_CHANGE_SECRET` | **Required** | JWT signing for password reset tokens. |
| `VOTING_TOKEN_SECRET` | **Required** | JWT signing/verification for voting tokens used during vote casting. |
| `SECRET_KEY_PEPPER` | **Required** | HMAC pepper for hashing/verification of election secret keys. |
| `NODE_ENV` | Optional | Enables production CORS and secure cookie settings. |
| `BREVO_SENDER_EMAIL` | Optional* | Brevo sender email for OTP email delivery (required if OTP via email is used). |
| `BREVO_SENDER_NAME` | Optional* | Brevo sender name for OTP email delivery (required if OTP via email is used). |
| `BREVO_API_KEY` | Optional* | Brevo API key for OTP email delivery (required if OTP via email is used). |
| `SUPABASE_URL` | Optional* | Supabase project URL for storage uploads (required for file uploads). |
| `SUPABASE_SECRET_API_KEY` | Optional* | Supabase service key for storage uploads (required for file uploads). |

> **Important:** The server does not ship an `.env.example`. Ensure all required values are set in your deployment environment.

## Installation & Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Set environment variables (see **Environment Variables** above).
3. Start the server:
   ```bash
   npm start
   ```
   For development with auto-reload:
   ```bash
   npm run dev
   ```

## Security Considerations
- **JWT authentication** is enforced for protected routes, with cookies marked `httpOnly` and `secure` in production.
- **Role-based access control** is applied via middleware, including a dynamic supervisor role during active elections.
- **Desktop voting devices** use bearer tokens stored as hashes in the database and can be revoked.
- **Password storage** uses bcrypt hashing.
- **CORS** is restricted by environment, with stricter origins in production.

## Project Structure
- `app.js` – Express app, middleware, and route mounting.
- `server.js` – HTTP server bootstrap.
- `routes/` – Web and desktop API route definitions.
- `controllers/` – Request handlers delegating to services.
- `services/` – Business logic, data access, and transactional workflows.
- `middleware/` – Auth, role enforcement, uploads, and error handling.
- `jobs/` – Scheduler for election status transitions and notifications.
- `db/` – PostgreSQL pool configuration.
- `utils/` – Shared helper utilities (e.g., status calculation, file storage).

## License
ISC (as listed in `package.json`).
