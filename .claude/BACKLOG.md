# BACKLOG — AmazonSender

*Current Sprint: Production Hardening*
*Last Updated: 2026-02-10*

> 🎯 Active tasks only. Strategic planning → [ROADMAP.md](./ROADMAP.md)

---

## 🔥 Priority 0: CRITICAL (Do Now)

### Security

- [ ] **Fix XSS vulnerability in render.js** (Issue #1)
  - Add URL sanitization for href attributes
  - Block javascript:, data:, vbscript: protocols
  - Effort: 30 minutes
  - File: `executor/src/render.js:23`

- [ ] **Remove .env from git tracking** (Issue #1)
  - Run: `git rm --cached executor/.env`
  - Add to .gitignore
  - Verify no secrets in git history
  - Effort: 15 minutes

- [ ] **Add .gitignore file**
  - Include .env, .env.*, security patterns
  - Effort: 10 minutes

---

## 🔴 Priority 1: HIGH (This Sprint)

### Testing

- [ ] **Add Jest test suite**
  - Install Jest: `npm install --save-dev jest`
  - Create `__tests__/` directory
  - Effort: 2 hours setup

- [ ] **Write tests for security modules**
  - Test: `unsubscribe.js` (HMAC token validation)
  - Test: `sns.js` (signature verification)
  - Test: `render.js` (XSS protection after fix)
  - Test: `utils.js` (email validation)
  - Effort: 4-6 hours
  - Target: 80%+ coverage for security-critical modules

### Input Validation

- [ ] **Add Notion ID validation**
  - Create `isValidNotionId()` in utils.js
  - Validate UUID format before API calls
  - File: `executor/src/utils.js`
  - Effort: 30 minutes

- [ ] **Install validation library**
  - Option A: Joi
  - Option B: Zod (recommended for TypeScript future)
  - Effort: 1 hour integration

### Error Handling

- [ ] **Implement retry logic for SES**
  - Add exponential backoff (2^n seconds)
  - Retry on: Throttling, ServiceUnavailable, 500 errors
  - Max retries: 3
  - File: `executor/src/ses.js`
  - Effort: 2 hours

### Rate Limiting

- [ ] **Add rate limiting to endpoints**
  - Install: `express-rate-limit`
  - `/send-mailout`: 10 req/min
  - `/unsubscribe`: 30 req/min
  - `/ses-events`: 100 req/min
  - Effort: 1 hour

---

## 🟡 Priority 2: MEDIUM (Next Sprint)

### Code Quality

- [ ] **Refactor server.js endpoint**
  - Extract 175-line `/send-mailout` into 5 functions
  - Create: `validateMailoutRequest()`, `fetchMailoutContent()`, etc.
  - Effort: 3-4 hours

- [ ] **Add dependency injection**
  - Create MailoutService class
  - Use constructor injection for clients
  - Makes testing easier (can mock dependencies)
  - Effort: 4-6 hours

- [ ] **Add JSDoc comments**
  - Document complex functions
  - Add @param, @returns, @example
  - Focus on: server.js, render.js, notion.js
  - Effort: 2-3 hours

### Performance

- [ ] **Parallel email sending with rate limit**
  - Install: `p-limit`
  - Send batch in parallel (5 concurrent)
  - Expected: 5x faster (1000 emails in 40s vs 200s)
  - File: `executor/src/server.js:172-226`
  - Effort: 2-3 hours

- [ ] **Async CSV writing**
  - Replace synchronous fs.appendFileSync with async
  - Use write queue to avoid blocking
  - File: `executor/src/csv.js`
  - Effort: 1-2 hours

---

## 🟢 Priority 3: Nice to Have (Future)

- [ ] **Add CORS configuration**
  - Install: `cors`
  - Configure allowed origins from .env
  - Effort: 30 minutes

- [ ] **Secure CSV filenames**
  - Use crypto.randomBytes instead of Date.now()
  - Prevents timing-based enumeration
  - Effort: 15 minutes

- [ ] **Add request logging**
  - Install: `morgan`
  - Log all requests with timestamps
  - Effort: 30 minutes

- [ ] **Add monitoring**
  - Option A: Sentry (error tracking)
  - Option B: DataDog (full observability)
  - Effort: 2-4 hours

---

## 📋 Completed

- [x] Initial project setup
- [x] 12-module architecture
- [x] Notion, Supabase, SES integrations
- [x] HMAC token system
- [x] SNS signature verification
- [x] CSV reporting
- [x] Code review completed (6/10 score) - 2026-02-10
- [x] Framework migration to v2.2 - 2026-02-10
- [x] Generated all Framework metafiles (SNAPSHOT, BACKLOG, ROADMAP, ARCHITECTURE, IDEAS)
- [x] Created comprehensive documentation (code review + migration reports)

---

*Track progress in GitHub Issues: https://github.com/alexeykrol/AmazonSender/issues*
