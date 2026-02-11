# BACKLOG — AmazonSender

*Current Sprint: Initial Implementation*

> 📋 Active tasks only. Strategic planning → [ROADMAP.md](./ROADMAP.md)

---

## 🚀 Phase 1: Core Setup

### Infrastructure Setup

- [ ] Choose implementation language (Node.js vs Python)
  - [ ] Evaluate based on: deployment ease, SES SDK maturity, team familiarity
  - [ ] Document decision in ARCHITECTURE.md

- [ ] Set up Supabase database
  - [ ] Create `subscribers` table
  - [ ] Create `mailouts` table
  - [ ] Create `send_logs` table (optional)
  - [ ] Set up indexes and constraints
  - [ ] Test connection from local environment

- [ ] Configure Amazon SES
  - [ ] Verify sender email identity
  - [ ] Request production access (if needed)
  - [ ] Set up configuration set
  - [ ] Configure SNS topic for bounce/complaint events

### Executor Service

- [ ] Implement HTTP server skeleton
  - [ ] POST /send-mailout endpoint
  - [ ] GET /unsubscribe endpoint
  - [ ] POST /ses-events endpoint
  - [ ] GET /health endpoint
  - [ ] Shared secret authentication

- [ ] Implement core sending logic
  - [ ] Load mailout from database
  - [ ] Atomic state transition (ready → sending)
  - [ ] Fetch active subscribers
  - [ ] Batch sending with rate limiting
  - [ ] Error handling and logging

- [ ] Implement event handlers
  - [ ] Unsubscribe token generation/validation
  - [ ] SNS signature verification
  - [ ] Bounce/complaint processing
  - [ ] Status updates in database

---

## 🐛 Known Issues

*No known issues yet — fresh project*

---

## 📝 Next Sprint Preparation

- [ ] Set up local development environment
- [ ] Create .env.example with all required variables
- [ ] Write unit tests for core logic

---

*Updated: 2026-02-11*
