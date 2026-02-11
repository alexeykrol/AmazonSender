# ROADMAP — AmazonSender

*Strategic Planning*

> 🗺️ Future phases and features. Current tasks → [BACKLOG.md](./BACKLOG.md)

---

## v1.0 — MVP Release

**Goal:** Minimal viable executor for production use

### Core Features

- ✅ Executor service with 3 endpoints
  - POST /send-mailout (atomic sending)
  - GET /unsubscribe (token-based)
  - POST /ses-events (bounce/complaint)

- ✅ Database schema (Supabase)
  - subscribers table
  - mailouts table
  - send_logs table

- ✅ Amazon SES integration
  - Batch sending with rate limiting
  - Configuration set support
  - SNS event processing

- ✅ State machine protection
  - Atomic mailout status transitions
  - Prevent double-sending
  - Idempotency guarantees

### Deployment

- ✅ Docker container configuration
- ✅ Environment variable documentation
- ✅ Health check endpoint
- ✅ Basic logging and monitoring

---

## v1.1 — Production Hardening

**Goal:** Reliability and observability improvements

### Features

- [ ] Enhanced error handling
  - Retry logic for transient SES errors
  - Circuit breaker for SES API
  - Graceful degradation

- [ ] Monitoring & Observability
  - Structured JSON logging
  - Metrics export (Prometheus/CloudWatch)
  - Dashboard for send statistics
  - Alert on bounce rate thresholds

- [ ] Testing & Quality
  - Integration tests with SES sandbox
  - Load testing for rate limiting
  - Dry-run mode for testing

---

## v1.2 — Enhanced Management

**Goal:** Better operational control

### Features

- [ ] Admin API endpoints
  - GET /mailouts (list all mailouts)
  - GET /mailouts/:id (mailout details)
  - GET /subscribers (paginated list)
  - GET /subscribers/:email (subscriber details)

- [ ] Subscriber management
  - Bulk import CSV
  - Bulk export CSV
  - Manual status override

- [ ] Mailout templates
  - Reusable HTML templates
  - Variable substitution (name, email)
  - Template preview

---

## v2.0 — Advanced Features

**Goal:** Optional marketing features (if needed)

### Possible Features

- [ ] Email analytics
  - Open tracking (optional)
  - Click tracking (optional)
  - Engagement reports

- [ ] Subscriber segmentation
  - Tags and custom fields
  - Filtered sending (send to tag)

- [ ] Scheduling
  - Delayed sending
  - Timezone-aware delivery

*Note: These features contradict original "minimalistic" principle. Only add if business requirements change.*

---

## Future Considerations

### Infrastructure

- [ ] Multi-region SES support
- [ ] Horizontal scaling (multiple executor instances)
- [ ] Queue-based architecture (SQS/RabbitMQ)

### Integrations

- [ ] Alternative email providers (SendGrid, Mailgun) as fallback
- [ ] Zapier/Make integration for easier Notion connectivity
- [ ] Slack notifications for completed mailouts

### Security

- [ ] DKIM/SPF validation checks
- [ ] Bounce rate monitoring with auto-pause
- [ ] IP reputation monitoring

---

*Last Updated: 2026-02-11*
