# English Yaari Assignment — Session Booking & User Management API

A TypeScript + Express 5 + MongoDB (Mongoose) backend service for managing users (students), teachers, and 1-on-1 session scheduling, discovery, booking, and completion.

## Tech Stack

- **Runtime & Language:** Node.js (ESM, `"type": "module"`), TypeScript (`target: esnext`, `module: nodenext`)
- **Web Framework:** Express `^5.3.0`
- **Database & ODM:** MongoDB with Mongoose `^9.12.2`
- **Validation:** Joi (via custom Express validation middleware)
- **Logging:** Pino `^10.4.0` (`pino-pretty` in development, JSON + rotating/file targets in `logs/`)
- **Testing:** Jest `^30.5.2` with `@swc/jest` and `supertest`
- **Dev Tooling:** `tsx` (hot-reload dev server), `tsc` (build), `cross-env`

---

## Prerequisites

- **Node.js** (v18+ or v20+ recommended; ESM + `--experimental-vm-modules` used for Jest)
- **npm** (comes with Node.js)
- **MongoDB** instance (local `mongod` or MongoDB Atlas connection string)

---

## Setup Instructions

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Create a `.env` file in the project root with the following variables:

   | Variable | Required | Default | Description |
   | :--- | :--- | :--- | :--- |
   | `MONGO_URI` | **Yes** | — | MongoDB connection URI (throws an error if missing) |
   | `NODE_ENV` | No | `development` | Set to `production` for JSON stdout logging and `info` default level |
   | `LOG_LEVEL` | No | `debug` (dev) / `info` (prod) | Pino log threshold (`debug`, `info`, `error`, etc.) |
   | `LOG_DIR` | No | `./logs` | Directory where `app.log` and `error.log` are written |

   > Note: The HTTP server port is currently hardcoded to `4949` in `server.ts`.

3. **Run in development mode (watch):**
   ```bash
   npm run dev
   ```
   Starts `tsx watch server.ts` on `http://localhost:4949`.

4. **Type-check, build, and run in production:**
   ```bash
   npm run typecheck
   npm run build
   npm start
   ```
   `npm run build` compiles TypeScript into `dist/`, and `npm start` runs `node dist/server.js`.

5. **Run tests:**
   ```bash
   npm test              # Run all unit tests
   npm run test:watch    # Run tests in watch mode
   npm run test:coverage # Run tests with coverage report
   ```

6. **Verify server health:**
   ```bash
   curl http://localhost:4949/health
   # Expected: {"status":"healthy"}
   ```

---

## Folder Structure

```text
english-yaari-assignment/
├── server.ts                  # Application entry point, Express setup, route mounting, DB startup
├── package.json               # Dependencies, ESM config, and npm scripts
├── tsconfig.json              # Strict TypeScript compiler configuration (outputs to dist/)
├── jest.config.js             # Jest + @swc/jest ESM test runner configuration
├── .env                       # Environment variables (ignored by git)
├── .gitignore                 # Excludes node_modules, dist, .env, logs
├── config/
│   ├── clientError.ts         # Custom ClientError class for operational 4xx errors
│   └── db.ts                  # MongoDB connection helper using MONGO_URI
├── controllers/
│   ├── session.controller.ts  # HTTP handlers for session creation, availability, booking, completion
│   └── user.controller.ts     # HTTP handlers for user creation and fetching user sessions
├── middleware/
│   ├── error.middleware.ts    # Global Express error-handling middleware
│   └── payload.validator.ts   # Reusable Joi request-body validation middleware factory
├── models/
│   ├── session.model.ts       # Session Mongoose schema, status enum, and TypeScript types
│   ├── teacher.model.ts       # Teacher Mongoose schema and TypeScript types
│   └── user.model.ts          # User Mongoose schema and TypeScript types
├── pipelines/
│   └── withTeacher.ts         # Reusable MongoDB aggregation pipeline to join teacher details
├── routes/
│   ├── session.routes.ts      # Express router for /api/sessions endpoints
│   └── user.routes.ts         # Express router for /api/users endpoints
├── services/
│   ├── session.service.ts     # Business logic and DB operations for sessions
│   └── user.service.ts        # Business logic and DB operations for users
├── utils/
│   ├── dateUtils.ts           # UTC day-boundary timestamp helper (getDayRange)
│   ├── error/
│   │   └── throwClientError.ts # Conditional ClientError throw helper
│   └── logger/
│       └── logger.ts          # Pino logger setup with file & console transports + redaction
└── tests/
    ├── config/                # Unit tests for db.ts
    ├── controllers/           # Unit tests for session & user controllers
    ├── helpers/               # Shared test mocks (logger.mock.ts)
    ├── middleware/            # Unit tests for error & payload validation middleware
    ├── services/              # Unit tests for session & user services
    ├── utils/                 # Unit tests for dateUtils & throwClientError
    └── validators/            # Unit tests for Joi schemas
```

---

## Folder Overview

- **`config/`**: Infrastructure and core application primitives—database connectivity (`db.ts`) and the `ClientError` class (`clientError.ts`) used across the app to represent predictable client-facing errors.
- **`routes/`**: Express route definitions mapping HTTP methods and URL paths to validation middleware and controller functions (`/api/users` and `/api/sessions`).
- **`validators/`**: Joi validation schemas defining field types, formatting rules, and custom error messages for incoming request bodies.
- **`middleware/`**: Express middleware for pre-controller request body validation (`payload.validator.ts`) and centralized post-controller error formatting/logging (`error.middleware.ts`).
- **`controllers/`**: Thin HTTP layer that extracts `req.body`, `req.params`, and `req.query`, delegates business logic to `services/`, formats JSON responses, and forwards errors to `next(error)`.
- **`services/`**: Core business logic, domain-level validations (existence checks, state transitions, ObjectId checks), and Mongoose queries/aggregations.
- **`models/`**: Mongoose schemas, indexes/constraints (such as unique lowercase email), custom schema validators, and TypeScript interfaces/hydrated document types.
- **`pipelines/`**: Reusable MongoDB aggregation stage arrays (e.g., `withTeacherPipeline` for `$lookup` + `$unwind` + `$project` on `teachers`).
- **`utils/`**: Shared cross-cutting helpers including UTC date range calculation (`dateUtils.ts`), conditional error throwing (`throwClientError.ts`), and structured Pino logging (`logger.ts`).
- **`tests/`**: Comprehensive Jest unit test suite mirroring the project directory structure, using mocked Mongoose models and a mocked logger (`tests/helpers/logger.mock.ts`).
