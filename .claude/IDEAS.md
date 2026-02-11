# IDEAS — AmazonSender

*Last Updated: 2026-02-11*

> 💡 Spontaneous ideas and thoughts
>
> **Workflow:** IDEAS.md → ROADMAP.md → BACKLOG.md

---

## 💭 Unstructured Ideas

- **Test mode enhancement:** Add special test email list that bypasses rate limiting for instant testing
- **Notion integration:** Create Notion template database with pre-configured properties
- **Email preview:** Generate HTML preview before sending (save to file or serve via temp URL)
- **Subscriber source tracking:** Add `source` field to track where subscriber came from
- **Unsubscribe reasons:** Capture optional reason when user unsubscribes
- **Send time optimization:** Analyze best send times based on historical open rates (if tracking added)
- **Double opt-in:** Optional confirmation email before adding to active list

---

## 🤔 Ideas on Review

*Ideas being considered for ROADMAP*

### Dry-run Mode
**Problem:** Need to test sending logic without actually sending emails
**Idea:** Add `DRY_RUN=true` env var that simulates sending but doesn't call SES
**Pros:** Safe testing, no SES quota usage
**Cons:** May miss real SES errors
**Status:** Likely to add in v1.1

### Webhook Retry Logic
**Problem:** If executor is down, Notion webhook fails
**Idea:** Add webhook retry endpoint or use queue (SQS)
**Pros:** More reliable
**Cons:** Adds complexity, may not be needed for manual trigger
**Status:** Evaluate after v1.0 usage

---

## ❌ Rejected Ideas

### Idea: Built-in email template editor
**Reason:** Out of scope — Notion already serves as content editor. Adding UI would bloat the project and contradict "minimalistic" principle.

### Idea: A/B testing support
**Reason:** Explicitly listed as out-of-scope in spec. Would require segmentation, analytics, and complexity that defeats the purpose.

### Idea: Multi-tenant support
**Reason:** Project is designed for single user/organization. Multi-tenancy adds significant auth/isolation complexity.

---

*Add new ideas here as they come up. Move promising ideas to ROADMAP.md when ready.*
