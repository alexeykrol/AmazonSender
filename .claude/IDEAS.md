# IDEAS — AmazonSender

*Spontaneous ideas and brainstorming*
*Last Updated: 2026-02-10*

> 💡 Capture ideas here before they're lost. Graduate promising ones to ROADMAP.md.

**Workflow:** IDEAS.md → ROADMAP.md → BACKLOG.md

---

## 💭 Unstructured Ideas

*Raw thoughts, no filtering yet*

- GraphQL API for frontend integration?
- WebSocket real-time progress updates during send
- Email preview mode (send to yourself first)
- Notion → Email template library (reusable layouts)
- Subscriber import from CSV
- Bounce categorization (hard vs soft, with auto-retry soft bounces)
- Email scheduling (queue for future delivery)
- Multi-language support for footer/unsubscribe text

---

## 🤔 Ideas Under Review

*Needs more thought or validation*

### Idea: Background Job Queue

**What:** Move long-running sends to background queue (BullMQ + Redis)

**Pros:**
- Non-blocking HTTP responses
- Can pause/resume sends
- Better error recovery
- Priority queues

**Cons:**
- Adds complexity (Redis dependency)
- Deployment complexity (workers + Redis)
- MVP doesn't need it yet (< 10k emails/send)

**Decision:** Defer to v0.4.0 when volume justifies complexity

---

### Idea: TypeScript Migration

**What:** Convert all .js files to .ts

**Pros:**
- Type safety (catch errors at compile time)
- Better IDE autocomplete
- Easier refactoring
- Industry standard for Node.js

**Cons:**
- Learning curve
- Slower iteration in MVP phase
- Build step required

**Decision:** Add to ROADMAP v0.3.0 after core features stable

---

### Idea: Email Open/Click Tracking

**What:** Track when emails are opened and links clicked

**Pros:**
- Valuable analytics for users
- Industry standard feature

**Cons:**
- Privacy concerns (GDPR compliance)
- Requires image pixel + link wrapper
- CDN needed for tracking pixel
- Not core to MVP value prop (send reliably)

**Decision:** Consider for v2.0.0 if users request it

---

## ✅ Ideas Graduated to Roadmap

*These made it to ROADMAP.md*

- ✅ Retry logic (→ ROADMAP v0.2.0)
- ✅ Test suite (→ ROADMAP v0.2.0)
- ✅ Rate limiting (→ ROADMAP v0.2.0)
- ✅ Dry-run mode (→ ROADMAP v0.3.0)
- ✅ Monitoring/Sentry (→ ROADMAP v0.3.0)

---

## ❌ Rejected Ideas

*Not a good fit for this project*

### Rejected: Full Marketing Automation

**Why rejected:** Scope creep. AmazonSender is an *executor*, not a marketing platform. Keep it focused on reliable delivery.

### Rejected: Visual Email Editor

**Why rejected:** Notion already serves as the content editor. Building a drag-and-drop editor is months of work with little marginal value.

### Rejected: A/B Testing Engine

**Why rejected:** Too complex for MVP. Users can manually test with small test sends. If needed, add in v1.0+.

---

## 🎯 Evaluation Criteria

Before moving an idea to ROADMAP, ask:

1. **Does it solve a real user problem?**
2. **Is it aligned with our core value prop (reliable email delivery)?**
3. **What's the complexity/value ratio?**
4. **Can we test demand before building?** (survey, manual workaround)
5. **Does it block other features?** (prioritize blockers)

---

*Keep ideas flowing! Bad ideas are better than no ideas.*
