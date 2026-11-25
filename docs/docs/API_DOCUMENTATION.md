# API Documentation

Base URL (local default): `http://localhost:4949`

All JSON error responses follow a uniform envelope produced by `errorMiddleware`:

```json
{
  "success": false,
  "message": "Human-readable error message",
  "errorCode": "ERROR_CODE_OR_EMPTY_STRING"
}
```

> **Note:** Unexpected/unhandled errors return HTTP `500` with `errorCode: "INTERNAL_SERVER_ERROR"` and `"Internal Server Error"` without leaking internal error details or `ClientError.meta`.

---

## Endpoint Summary

| # | Method & Path | Purpose | Middleware Validation |
| :--- | :--- | :--- | :--- |
| 1 | `POST /api/users` | Register a new user | `validate(userValidator)` |
| 2 | `GET /api/users/:id/sessions` | Get a user's upcoming & completed sessions | — (validated in service) |
| 3 | `POST /api/sessions` | Create a new available session for a teacher | `validate(sessionValidator)` |
| 4 | `GET /api/sessions/available` | List available sessions for a given UTC day | — (validated in controller) |
| 5 | `POST /api/sessions/:id/book` | Book an available session for a user | — (validated in service) |
| 6 | `PATCH /api/sessions/:id/complete` | Mark a booked session as completed | — (validated in service) |
| — | `GET /health` | Server health check | — |

---

## 1. Create User

**`POST /api/users`**

Creates a new user account after validating the payload and checking for duplicate emails.

### Request Body (`application/json`)

| Field | Type | Required | Rules |
| :--- | :--- | :--- | :--- |
| `fullName` | `string` | Yes | Trimmed, non-empty |
| `email` | `string` | Yes | Trimmed, lowercased, valid email format (`tlds: { allow: false }` so any TLD is accepted) |
| `phone` | `string` | Yes | Trimmed, exactly 10 characters, must match `/^[6-9]\d{9}$/` (Indian mobile format) |

### End-to-End Flow

1. **Middleware (`validate(userValidator)`):**
   - Validates `req.body` with `abortEarly: true`, `stripUnknown: true`, `convert: true`.
   - Unknown fields are silently stripped; `fullName`, `email`, and `phone` are trimmed; `email` is lowercased.
   - Replaces `req.body` with the sanitized value.
2. **Controller (`createUserController`):**
   - Passes `req.body` to `createUser(payload)`.
3. **Service (`createUser`):**
   - Logs entry with payload fields.
   - Queries `UserModel.findOne({ email })`.
   - If a user exists, throws `ClientError` (`409`, `"EMAIL_ALREADY_EXISTS"`).
   - Calls `UserModel.create(payload)` inside a `try/catch` that also catches Mongo duplicate-key race conditions (`err?.code === 11000`) and throws `409` `"EMAIL_ALREADY_EXISTS"`.
4. **Response (`201 Created`):**
   ```json
   {
     "success": true,
     "message": "User created successfully",
     "data": {
       "_id": "674...",
       "fullName": "Aarav Sharma",
       "email": "aarav@example.com",
       "phone": "9876543210",
       "createdAt": "2026-01-01T10:00:00.000Z",
       "updatedAt": "2026-01-01T10:00:00.000Z"
     }
   }
   ```

### Validations & Verified Edge Cases

- Missing or empty `fullName`, `email`, or `phone` → `400 VALIDATION_FAILED`.
- Invalid email format → `400 VALIDATION_FAILED` (`"Please enter a valid email"`). Any TLD is accepted.
- Phone not 10 digits or not starting with `6–9` → `400 VALIDATION_FAILED` (`"Mobile number shall be 10 digits long"` or `"Please enter a valid Indian mobile number"`).
- Non-object or array body → `400 VALIDATION_FAILED`.
- Extra unknown properties in body → stripped automatically, request succeeds.
- Duplicate email (pre-check or E11000 race condition) → `409 EMAIL_ALREADY_EXISTS`.

---

## 2. Find User Sessions

**`GET /api/users/:id/sessions`**

Retrieves a user's sessions grouped into `upcoming` (`BOOKED`) and `completed` (`COMPLETED`), enriched with teacher details and sorted ascending by `startTime`.

### Path Parameters

| Parameter | Type | Required | Rules |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Valid 24-char MongoDB `ObjectId` |

### End-to-End Flow

1. **Controller (`findUserSessionsController`):**
   - Extracts `req.params.id` and calls `findUserSessions(userId)`.
2. **Service (`findUserSessions`):**
   - Validates `!userId || typeof userId !== "string" || !Types.ObjectId.isValid(userId)`. If invalid, throws `ClientError` (`400`, `"INVALID_PAYLOAD"`, `"Invalid userId"`).
   - Runs `SessionModel.aggregate([...])` with two stages:
     1. `$match`: `userId: new Types.ObjectId(userId)` (explicitly cast because Mongoose `aggregate()` does not auto-cast strings) and `status: { $in: ["BOOKED", "COMPLETED"] }`.
     2. `$facet`:
        - `upcoming`: `$match` `BOOKED` → `$sort: { startTime: 1 }` → `...withTeacherPipeline`
        - `completed`: `$match` `COMPLETED` → `$sort: { startTime: 1 }` → `...withTeacherPipeline`
   - Destructures `[result]` from the aggregation output and returns it.
3. **Response (`200 OK`):**
   ```json
   {
     "success": true,
     "message": "Found user sessions",
     "data": {
       "upcoming": [
         {
           "_id": "675...",
           "startTime": "2026-02-01T09:00:00.000Z",
           "endTime": "2026-02-01T10:00:00.000Z",
           "status": "BOOKED",
           "teacher": {
             "_id": "673...",
             "fullName": "Priya Nair",
             "email": "priya@englishyaari.com"
           }
         }
       ],
       "completed": []
     }
   }
   ```

### Validations & Verified Edge Cases

- Invalid or malformed `userId` → `400 INVALID_PAYLOAD`.
- User with no sessions → `200 OK` with `{ upcoming: [], completed: [] }` (note: `$facet` always returns a single document with empty arrays when `$match` matches 0 docs).
- `AVAILABLE` sessions are excluded by the `$match` stage.
- Teacher lookup preserves session documents even if the teacher record is missing (`preserveNullAndEmptyArrays: true`).

---

## 3. Create Session

**`POST /api/sessions`**

Creates a new `AVAILABLE` session slot for an existing teacher.

### Request Body (`application/json`)

| Field | Type | Required | Rules |
| :--- | :--- | :--- | :--- |
| `teacherId` | `string` | Yes | 24-character hexadecimal string |
| `startTime` | `Date` / ISO string / ms timestamp | Yes | Valid date (`Joi.date()`) |
| `endTime` | `Date` / ISO string / ms timestamp | Yes | Valid date, strictly greater than `startTime` |

### End-to-End Flow

1. **Middleware (`validate(sessionValidator)`):**
   - Validates `req.body` (`abortEarly: true`, `stripUnknown: true`, `convert: true`).
   - Converts `startTime` and `endTime` strings/timestamps into `Date` objects.
   - Enforces `endTime > startTime` (strictly greater; equal timestamps fail).
2. **Controller (`createSessionController`):**
   - Passes `req.body` to `createSession(payload)`.
3. **Service (`createSession`):**
   - Queries `TeacherModel.findById(teacherId)`.
   - If not found, throws `ClientError` (`404`, `"TEACHER_NOT_FOUND"`, `"Teacher not found"`).
   - Checks `startTime < now || endTime < now`: if true, throws `ClientError` (`400`, `""`, `"Sessions can't be created in the past. Please choose valid time"`).
   - Checks `startTime > endTime`: if true, throws `ClientError` (`400`, `"INVALID_PAYLOAD"`, `"End time must be greater than start time"`).
   - Calls `SessionModel.create(payload)` (defaults `status` to `"AVAILABLE"`).
4. **Response (`201 Created`):**
   ```json
   {
     "success": true,
     "message": "Session created successfully",
     "data": {
       "_id": "675...",
       "teacherId": "673...",
       "startTime": "2026-02-01T09:00:00.000Z",
       "endTime": "2026-02-01T10:00:00.000Z",
       "status": "AVAILABLE",
       "createdAt": "2026-01-01T10:00:00.000Z",
       "updatedAt": "2026-01-01T10:00:00.000Z"
     }
   }
   ```

### Validations & Verified Edge Cases

- Non-hex or wrong-length `teacherId` → `400 VALIDATION_FAILED` (hex rule runs before length rule).
- `endTime <= startTime` → `400 VALIDATION_FAILED` (`"End time must be greater than start time"`).
- `endTime` 1 ms after `startTime` → accepted by validator.
- Teacher does not exist → `404 TEACHER_NOT_FOUND` (checked before time-in-past validation).
- `startTime` or `endTime` in the past → `400` with `errorCode: ""` (default `throwClientError` status/code).
- Unknown fields in body → stripped by middleware.

---

## 4. Find Available Sessions

**`GET /api/sessions/available`**

Returns all `AVAILABLE` sessions whose `startTime` falls within the UTC calendar day of the supplied timestamp, joined with teacher details.

### Query Parameters

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `dateTimeStamp` | `number` (string in query) | Yes | — | Unix timestamp in **seconds** (`< 1e12`) or **milliseconds** (`>= 1e12`) |
| `sort` | `string` | No | `"asc"` | `"desc"` sorts descending by `startTime`; any other non-empty value sorts ascending (`1`) |

### End-to-End Flow

1. **Controller (`findAvailableSessionsController`):**
   - Reads `dateTimeStamp` and `sort = "asc"` from `req.query`.
   - Validates `!dateTimeStamp || !sort || isNaN(Number(dateTimeStamp))`. If invalid, throws `ClientError` (`400`, `"INVALID_PAYLOAD"`).
   - Converts `dateTimeStamp` to `Number` and calls `findAvailableSessions(dateTimeStampNumber, sort)`.
2. **Service (`findAvailableSessions`):**
   - Calls `getDayRange(dateTimeStamp)` to compute `[dayStart, dayEnd)` in UTC (`00:00:00.000Z` to next day `00:00:00.000Z`).
   - Sets `sortValue = sort === "desc" ? -1 : 1`.
   - Runs `SessionModel.aggregate([...])`:
     1. `$match`: `status: "AVAILABLE"` and `startTime: { $gte: dayStart, $lt: dayEnd }`.
     2. `$sort`: `{ startTime: sortValue }`.
     3. `...withTeacherPipeline` (joins `teachers` and projects `_id`, `startTime`, `endTime`, `status`, `teacher`).
3. **Response (`200 OK`):**
   ```json
   {
     "success": true,
     "message": "Available sessions found",
     "data": [
       {
         "_id": "675...",
         "startTime": "2026-02-01T09:00:00.000Z",
         "endTime": "2026-02-01T10:00:00.000Z",
         "status": "AVAILABLE",
         "teacher": {
           "_id": "673...",
           "fullName": "Priya Nair",
           "email": "priya@englishyaari.com"
         }
       }
     ]
   }
   ```

### Validations & Verified Edge Cases

- Missing or non-numeric `dateTimeStamp` → `400 INVALID_PAYLOAD`.
- Timestamp in seconds vs. milliseconds → `getDayRange` automatically multiplies values `< 1e12` by `1000`.
- Empty results → `200 OK` with `data: []`.
- Unrecognized `sort` values (e.g., `"random"`) → falls back to ascending (`1`).
- **Known quirks (documented in unit tests):** `dateTimeStamp="0"`, whitespace `" "` (`Number(" ") === 0`), and `"Infinity"` pass `isNaN(Number(dateTimeStamp))` and are forwarded to the service.

---

## 5. Book Session

**`POST /api/sessions/:id/book`**

Books an `AVAILABLE` session for a registered user, transitioning its status to `BOOKED`.

### Path & Body Parameters

| Location | Field | Type | Required | Rules |
| :--- | :--- | :--- | :--- | :--- |
| Path | `id` | `string` | Yes | Valid 24-char MongoDB `ObjectId` |
| Body | `userId` | `string` | Yes | Valid 24-char MongoDB `ObjectId` |

### End-to-End Flow

1. **Controller (`bookSessionController`):**
   - Extracts `sessionId = req.params.id` and `{ userId } = req.body`.
   - Calls `bookSession(sessionId, userId)`.
2. **Service (`bookSession`):**
   - Validates `sessionId` (`Types.ObjectId.isValid`) → `400 INVALID_PAYLOAD` if invalid.
   - Validates `userId` (`Types.ObjectId.isValid`) → `400 INVALID_PAYLOAD` if invalid.
   - Queries `UserModel.findById(userId)` → `404 USER_NOT_FOUND` if missing.
   - Queries `SessionModel.findById(sessionId)` → `404 SESSION_NOT_FOUND` if missing.
   - Checks `existingSession?.status !== "AVAILABLE"` → `400 SESSION_NOT_AVAILABLE` if `BOOKED` or `COMPLETED`.
   - Executes `SessionModel.updateOne({ _id: sessionId }, { status: "BOOKED", userId })`.
3. **Response (`200 OK`):**
   ```json
   {
     "success": true,
     "message": "Session booked successfully",
     "data": {
       "acknowledged": true,
       "modifiedCount": 1,
       "upsertedId": null,
       "upsertedCount": 0,
       "matchedCount": 1
     }
   }
   ```

### Validations & Verified Edge Cases

- `sessionId` is validated before `userId`.
- Extra fields in `req.body` are ignored.
- Missing `userId` in an object body → `400 INVALID_PAYLOAD`.
- Missing `req.body` altogether (`undefined`) → destructuring throws `TypeError`, forwarded to `errorMiddleware` as `500 INTERNAL_SERVER_ERROR`.
- Non-existent user → `404 USER_NOT_FOUND`; non-existent session → `404 SESSION_NOT_FOUND`.
- Session already `BOOKED` or `COMPLETED` → `400 SESSION_NOT_AVAILABLE`.

---

## 6. Complete Session

**`PATCH /api/sessions/:id/complete`**

Marks a `BOOKED` session as `COMPLETED` and records the `completedAt` timestamp.

### Path Parameters

| Parameter | Type | Required | Rules |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Yes | Valid 24-char MongoDB `ObjectId` |

### End-to-End Flow

1. **Controller (`completeSessionController`):**
   - Extracts `sessionId = req.params.id` and calls `completeSession(sessionId)`.
2. **Service (`completeSession`):**
   - Validates `sessionId` (`Types.ObjectId.isValid`) → `400 INVALID_PAYLOAD` if invalid.
   - Queries `SessionModel.findById(sessionId)` → `404 SESSION_NOT_FOUND` if missing.
   - Checks `existingSession?.status !== "BOOKED"` → `400 INVALID_SESSION` if `AVAILABLE` or already `COMPLETED`.
   - Executes `SessionModel.updateOne({ _id: sessionId }, { status: "COMPLETED", completedAt: new Date() })`.
3. **Response (`200 OK`):**
   ```json
   {
     "success": true,
     "message": "Session completed successfully",
     "data": {
       "acknowledged": true,
       "modifiedCount": 1,
       "upsertedId": null,
       "upsertedCount": 0,
       "matchedCount": 1
     }
   }
   ```

### Validations & Verified Edge Cases

- Invalid `sessionId` → `400 INVALID_PAYLOAD`.
- Non-existent session → `404 SESSION_NOT_FOUND`.
- Completing an `AVAILABLE` (unbooked) or already `COMPLETED` session → `400 INVALID_SESSION`.

---

## Health Check Endpoint

**`GET /health`**

Defined directly in `server.ts`. Immediately returns `200 OK`:

```json
{
  "status": "healthy"
}
```
