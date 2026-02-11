# ROADMAP — AmazonSender

*Strategic planning for future versions*
*Last Updated: 2026-02-10*

> 🗺️ Long-term vision. Current tasks → [BACKLOG.md](./BACKLOG.md)

---

## v0.2.0 — Production Ready (Q1 2026)

**Goal:** Harden MVP for production use

**Target Date:** March 2026

### Must Have

- ✅ Fix all CRITICAL security issues (XSS, .env in git)
- ✅ Complete test suite (80%+ coverage)
- ✅ Retry logic with exponential backoff
- ✅ Rate limiting on all endpoints
- ✅ Input validation framework (Joi/Zod)

### Should Have

- Dependency injection (MailoutService class)
- Parallel email sending (5x performance boost)
- Request logging (Morgan)
- Error monitoring (Sentry)

### Nice to Have

- JSDoc documentation
- CORS configuration
- Async CSV writing

**Success Criteria:**
- Zero CRITICAL/HIGH security issues
- Test coverage ≥ 80%
- Can handle 10,000 emails in < 30 minutes
- No production incidents for 2 weeks

---

## v0.3.0 — Enhanced Features (Q2 2026)

**Goal:** Add missing production features

**Target Date:** May 2026

### Features

- **Dry-run mode** - Test mailouts without sending
- **Webhook signature validation** - Verify all webhook sources
- **Email templates** - Reusable email layouts
- **Scheduled sends** - Queue mailouts for future delivery
- **Bounce/complaint analytics** - Track deliverability metrics

### Improvements

- TypeScript migration (types for all modules)
- Connection pooling for Supabase
- Advanced logging (structured JSON logs)
- API documentation (Swagger/OpenAPI)

**Success Criteria:**
- Dry-run mode tested with 5+ use cases
- Analytics dashboard showing bounce rates
- Full TypeScript migration (0 `any` types)

---

## v0.4.0 — Scalability (Q3 2026)

**Goal:** Handle high-volume sends

**Target Date:** August 2026

### Performance

- **Queue-based processing** - Move to background jobs (BullMQ)
- **Horizontal scaling** - Multiple executor instances
- **Redis caching** - Cache Notion content
- **Database optimization** - Indexed queries, read replicas

### Monitoring

- **Health checks** - /health returns dependency status
- **Metrics endpoint** - Prometheus-compatible metrics
- **Alerting** - PagerDuty integration for errors
- **Tracing** - OpenTelemetry for request tracing

**Success Criteria:**
- Can handle 100,000 emails in < 1 hour
- Auto-scales to 5 instances under load
- 99.9% uptime over 30 days

---

## v1.0.0 — Stable Release (Q4 2026)

**Goal:** Production-grade email executor

**Target Date:** November 2026

### Quality

- ✅ Test coverage ≥ 95%
- ✅ Zero known security vulnerabilities
- ✅ Full API documentation
- ✅ CI/CD pipeline with auto-deploy
- ✅ Load tested to 1M emails/day

### Features

- **Multi-tenant support** - Multiple organizations
- **Advanced segmentation** - Filter subscribers by attributes
- **A/B testing** - Test subject lines
- **Email analytics** - Opens, clicks, conversions (optional)
- **Compliance** - GDPR, CAN-SPAM compliance tools

### Documentation

- Complete user guide
- API reference docs
- Troubleshooting guide
- Migration guides

**Success Criteria:**
- Deployed to production with real users
- Handles 1M emails/day without issues
- Customer satisfaction score ≥ 4.5/5

---

## v2.0.0 — Platform Evolution (2027)

**Vision:** Full-featured email platform

### Possibilities

- Visual email editor (drag-and-drop)
- Campaign automation workflows
- Advanced reporting dashboard
- Multi-channel support (SMS, push notifications)
- AI-powered send time optimization
- Webhook integrations (Zapier, Make)

**Decision Point:** After v1.0, evaluate user feedback and market demand

---

## 🎯 Key Metrics to Track

| Metric | Current | v0.2 Target | v1.0 Target |
|--------|---------|-------------|-------------|
| Test Coverage | 0% | 80% | 95% |
| Security Score | 6/10 | 9/10 | 10/10 |
| Max Throughput | 5 emails/sec | 25 emails/sec | 100 emails/sec |
| Response Time (p95) | N/A | < 500ms | < 200ms |
| Uptime | N/A | 99% | 99.9% |

---

*Roadmap is subject to change based on user feedback and priorities*
