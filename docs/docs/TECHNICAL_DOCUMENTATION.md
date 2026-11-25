# Technical Documentation

This document provides a module-by-module technical breakdown of the codebase, covering architecture, entry point, configuration, models, pipelines, middleware, validators, controllers, services, utilities, and testing.

---

## 1. Architecture Overview

The application follows a layered Express + TypeScript architecture:

```text
HTTP Request
   │
   ▼
Routes (routes/*.routes.ts)
   │  └─ Optional Joi Middleware (middleware/payload.validator.ts + validators/*.validator.ts)
   ▼
Controllers (controllers/*.controller.ts)
   │  └─ Extract params/query/body, invoke service, format JSON response, forward errors via next(err)
   ▼
Services (services/*.service.ts)
   │  └─ Business rules, ObjectId/existence checks, Mongoose queries & aggregations
   ▼
Models & Pipelines (models/*.model.ts, pipelines/withTeacher.ts)
   │
   ▼
Global Error Middleware (middleware/error.middleware.ts)
   └─ Logs error via Pino; maps ClientError -> custom status/JSON, others -> 500
```

---

## 2. Entry Point & Build Configuration

### `server.ts`
- Loads environment variables via `dotenv.config()`.
- Initializes Express (`const app = express()`) with `express.json()` and `express.urlencoded({ extended: true })`.
- Mounts route modules:
  - `/api/users` → `userRoutes`
  - `/api/sessions` → `sessionRoutes`
  - `GET /health` → returns `{ status: "healthy" }`.
- Registers `app.use(errorMiddleware)` after all routes.
- Calls `start()`, which awaits `connectDB()` and starts listening on hardcoded port `4949`. Any startup error is caught and logged via `logger.error`.

### `tsconfig.json`
- Strict TypeScript configuration (`"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`, `"verbatimModuleSyntax": true`, `"isolatedModules": true`).
- Uses `"module": "nodenext"` and `"target": "esnext"`, compiling all `**/*.ts` files (excluding `node_modules`, `dist`, `**/*.test.ts`, `jest.config.js`) into `./dist` with source maps and `.d.ts` declarations.

### `jest.config.js`
- Configured for ESM TypeScript testing (`extensionsToTreatAsEsm: [".ts"]`, `testEnvironment: "node"`).
- Uses `@swc/jest` targeting `es2022` with `es6` module output.
- Maps relative `.js` imports to `.ts` (`"^(\\.{1,2}/.*)\\.js$": "$1"`) and redirects `logger/logger.js` imports to `tests/helpers/logger.mock.ts`.
- Automatically clears mocks between tests (`clearMocks: true`) and excludes `server.ts`, tests, `dist`, and `node_modules` from coverage.

---

## 3. Configuration (`config/`)

### `config/db.ts` — `connectDB()`
- Reads `process.env.MONGO_URI` at call time (not module load time).
- Throws `new Error("MONGO_URI is not defined in .env")` if `MONGO_URI` is missing or empty.
- Connects via `await mongoose.connect(uri)` and logs `"MongoDB connected"` on success.
- On connection failure, logs `"MongoDB connection failed:"` with the error and terminates the process with `process.exit(1)`.

### `config/clientError.ts` — `ClientError`
- Extends native `Error` to represent expected operational/client errors.
- Properties:
  - `name`: `"ClientError"`
  - `message`: error message passed to `super(message)`
  - `statusCode`: HTTP status code (e.g., `400`, `404`, `409`)
  - `errorCode`: machine-readable code (e.g., `"VALIDATION_FAILED"`, `"EMAIL_ALREADY_EXISTS"`)
  - `isClientError`: `true` (used by `errorMiddleware` to distinguish `ClientError` instances)
  - `meta`: optional diagnostic object (default `{}`), logged internally but never returned to HTTP clients.

---

## 4. Models (`models/`)

### `models/user.model.ts`
- **Interface `User` & `UserDocument` (`HydratedDocument<User>`):**
  - `fullName`: `String`, required, trimmed.
  - `email`: `String`, required, trimmed, `unique: true`, `lowercase: true`, regex `/^\S+@\S+\.\S+$/`.
  - `phone`: `String`, required, trimmed, `length: 10`.
- **Options:** `{ timestamps: true }` (`createdAt`, `updatedAt`).
- **Model:** `UserModel` (`"User"`).

### `models/teacher.model.ts`
- **Interface `Teacher` & `TeacherDocument` (`HydratedDocument<Teacher>`):**
  - `fullName`: `String`, required, trimmed.
  - `email`: `String`, required, trimmed, `lowercase: true`, regex `/^\S+@\S+\.\S+$/`.
  - `specialization`: `String`, required, trimmed.
  - `experience`: `Number`, `min: 0`, required.
- **Options:** `{ timestamps: true }`.
- **Model:** `TeacherModel` (`"Teacher"`). *(Note: Teachers are referenced by sessions and joined via `withTeacherPipeline`, though no teacher CRUD routes are exposed in `routes/`.)*

### `models/session.model.ts`
- **Enum `SessionStatus`:** `AVAILABLE = "AVAILABLE"`, `BOOKED = "BOOKED"`, `COMPLETED = "COMPLETED"`.
- **Interface `Session` & `SessionDocument` (`HydratedDocument<Session>`):**
  - `teacherId`: `ObjectId` (ref `"Teacher"`), required.
  - `userId`: `ObjectId | null` (ref `"User"`), optional (populated upon booking).
  - `startTime`: `Date`, required.
  - `endTime`: `Date`, required, with Mongoose custom validator ensuring `value > this.startTime`.
  - `status`: `String`, enum of `SessionStatus`, defaults to `SessionStatus.AVAILABLE`.
  - `completedAt`: `Date | null`, optional (populated upon completion).
- **Options:** `{ timestamps: true }`.
- **Model:** `SessionModel` (`"Session"`).

---

## 5. Aggregation Pipelines (`pipelines/`)

### `pipelines/withTeacher.ts` — `withTeacherPipeline`
An exported array of MongoDB aggregation stages designed to be spread (`...withTeacherPipeline`) into `SessionModel.aggregate()` calls:
1. **`$lookup`:** Joins `teachers` collection matching `localField: "teacherId"` to `foreignField: "_id"`, outputting to `teacher` array.
2. **`$unwind`:** Flattens `teacher` with `preserveNullAndEmptyArrays: true` so sessions still appear if a teacher document is absent.
3. **`$project`:** Exposes only `_id`, `startTime`, `endTime`, `status`, and a nested `teacher` object (`_id`, `fullName`, `email`).

---

## 6. Middleware (`middleware/`)

### `middleware/payload.validator.ts` — `validate(schema)`
- Higher-order middleware factory accepting a `Joi.ObjectSchema`.
- Validates `req.body` with `{ abortEarly: true, stripUnknown: true, convert: true }`.
- On validation error: extracts `error.details[0].message` and calls `next(new ClientError(mainError.message, 400, "VALIDATION_FAILED"))`, leaving `req.body` untouched.
- On success: replaces `req.body` with the sanitized/coerced `value` and calls `next()`.

### `middleware/error.middleware.ts` — `errorMiddleware(err, req, res, next)`
- Logs every error first via `logger.error(err.message, err)`.
- If `err instanceof ClientError && err.isClientError`: responds with `err.statusCode` and `{ success: false, message: err.message, errorCode: err.errorCode || "" }`. `err.meta` is intentionally omitted from the HTTP response.
- Otherwise: responds with `500` and `{ success: false, message: "Internal Server Error", errorCode: "INTERNAL_SERVER_ERROR" }` so internal stack traces, Mongo errors, or unexpected exceptions are never leaked.

---

## 7. Validators (`validators/`)

### `validators/user.validator.ts` — `userValidator`
- `fullName`: `Joi.string().trim().required()`.
- `email`: `Joi.string().lowercase().trim().email({ tlds: { allow: false } }).required()`.
- `phone`: `Joi.string().trim().length(10).pattern(/^[6-9]\d{9}$/).required()`.
- Custom messages are defined for empty, required, email format, length, and Indian mobile regex failures.

### `validators/session.validator.ts` — `sessionValidator`
- `teacherId`: `Joi.string().hex().length(24).required()`.
- `startTime`: `Joi.date().required()`.
- `endTime`: `Joi.date().greater(Joi.ref("startTime")).required()`.
- Because `convert: true` is enabled in `validate()`, valid ISO strings and numeric ms timestamps for `startTime`/`endTime` are coerced into `Date` instances before reaching the controller.

---

## 8. Routes & Controllers (`routes/`, `controllers/`)

### `routes/user.routes.ts` & `controllers/user.controller.ts`
- `POST /` → `validate(userValidator)` → `createUserController`: passes `req.body` to `createUser()`, returns `201`.
- `GET /:id/sessions` → `findUserSessionsController`: passes `req.params.id` to `findUserSessions()`, returns `200`.

### `routes/session.routes.ts` & `controllers/session.controller.ts`
- `POST /` → `validate(sessionValidator)` → `createSessionController`: passes `req.body` to `createSession()`, returns `201`.
- `GET /available` → `findAvailableSessionsController`: extracts `dateTimeStamp` and `sort = "asc"` from `req.query`, validates `dateTimeStamp` is present and numeric (`400 INVALID_PAYLOAD` otherwise), converts it to `Number`, calls `findAvailableSessions()`, and returns `200`.
- `POST /:id/book` → `bookSessionController`: extracts `sessionId = req.params.id` and `userId = req.body.userId`, calls `bookSession()`, returns `200`.
- `PATCH /:id/complete` → `completeSessionController`: extracts `sessionId = req.params.id`, calls `completeSession()`, returns `200`.

All controllers wrap their logic in `try/catch` and forward errors to `next(error)`.

---

## 9. Services (`services/`)

### `services/user.service.ts`
- **`createUser(payload: User)`:**
  - Checks `UserModel.findOne({ email })`; throws `409 EMAIL_ALREADY_EXISTS` (with `payload` as `meta`) if found.
  - Creates the user via `UserModel.create(payload)`, catching Mongo `11000` duplicate-key errors as `409 EMAIL_ALREADY_EXISTS` and rethrowing any other error.
- **`findUserSessions(userId: string)`:**
  - Validates `userId` with `Types.ObjectId.isValid(userId)` (`400 INVALID_PAYLOAD`).
  - Aggregates `SessionModel` matching `new Types.ObjectId(userId)` and status in `["BOOKED", "COMPLETED"]`, then uses `$facet` to split into `upcoming` (`BOOKED`) and `completed` (`COMPLETED`), each sorted ascending by `startTime` and enriched via `withTeacherPipeline`.

### `services/session.service.ts`
- **`createSession(payload: Pick<Session, "teacherId" | "startTime" | "endTime">)`:**
  - Verifies teacher exists via `TeacherModel.findById(teacherId)` (`404 TEACHER_NOT_FOUND`).
  - Rejects past times (`startTime < now || endTime < now`) with `ClientError` (`400`, `""`).
  - Rejects `startTime > endTime` with `ClientError` (`400`, `"INVALID_PAYLOAD"`).
  - Persists session via `SessionModel.create(payload)`.
- **`findAvailableSessions(dateTimeStamp: number, sort: string)`:**
  - Computes `{ dayStart, dayEnd }` via `getDayRange(dateTimeStamp)`.
  - Maps `sort === "desc"` to `-1`, otherwise `1`.
  - Aggregates `SessionModel` matching `status: AVAILABLE` and `startTime` in `[dayStart, dayEnd)`, sorted by `startTime`, and joined with `withTeacherPipeline`.
- **`bookSession(sessionId: string, userId: string)`:**
  - Validates both `sessionId` and `userId` as valid ObjectIds (`400 INVALID_PAYLOAD`).
  - Verifies user exists (`404 USER_NOT_FOUND`) and session exists (`404 SESSION_NOT_FOUND`).
  - Verifies `existingSession.status === "AVAILABLE"` (`400 SESSION_NOT_AVAILABLE`).
  - Updates session via `SessionModel.updateOne({ _id: sessionId }, { status: "BOOKED", userId })`.
- **`completeSession(sessionId: string)`:**
  - Validates `sessionId` as a valid ObjectId (`400 INVALID_PAYLOAD`).
  - Verifies session exists (`404 SESSION_NOT_FOUND`).
  - Verifies `existingSession.status === "BOOKED"` (`400 INVALID_SESSION`).
  - Updates session via `SessionModel.updateOne({ _id: sessionId }, { status: "COMPLETED", completedAt: new Date() })`.

---

## 10. Utilities (`utils/`)

### `utils/dateUtils.ts` — `getDayRange(timestamp: number)`
- Normalizes seconds vs. milliseconds: if `timestamp < 1e12`, multiplies by `1000`.
- Constructs `dayStart` at `00:00:00.000 UTC` of that date and `dayEnd` exactly `24 * 60 * 60 * 1000` ms later.
- Returns `{ dayStart, dayEnd }`.

### `utils/error/throwClientError.ts` — `throwClientError(...)`
- Signature: `(condition: any, message: string, statusCode = 400, errorCode = "", meta: Object = {})`.
- Throws `new ClientError(message, statusCode, errorCode, meta)` whenever `condition` is truthy.

### `utils/logger/logger.ts` — `logger`
- Configures Pino with `base: { service: "english-yaari-api" }`, ISO timestamps, and `pino.stdSerializers.err`.
- **Redaction:** Masks `password`, `token`, `*.password`, `*.token`, and `req.headers.authorization` with `"[REDACTED]"`.
- **Transports:**
  1. `logs/app.log` (all logs at configured `level`).
  2. `logs/error.log` (`error` level only).
  3. Console: `pino-pretty` (colorized) in non-production, raw JSON stdout (`destination: 1`) in production.
- Exports an `AppLogger` wrapper (`info`, `error`, `child`) that normalizes both `Error` instances and non-Error thrown values.
