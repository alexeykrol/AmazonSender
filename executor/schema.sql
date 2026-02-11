-- AmazonSender Database Schema
-- Subscribers table for email list management

CREATE TABLE IF NOT EXISTS subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  bounce_type TEXT,
  bounce_subtype TEXT,
  status_updated_at TIMESTAMPTZ,
  from_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);

-- Comments for documentation
COMMENT ON TABLE subscribers IS 'Email subscribers list with bounce tracking';
COMMENT ON COLUMN subscribers.email IS 'Subscriber email address (unique)';
COMMENT ON COLUMN subscribers.status IS 'Subscription status: active, bounced, unsubscribed, complained';
COMMENT ON COLUMN subscribers.bounce_type IS 'SES bounce type: Permanent, Transient, Undetermined';
COMMENT ON COLUMN subscribers.bounce_subtype IS 'SES bounce subtype: General, NoEmail, Suppressed, etc.';
COMMENT ON COLUMN subscribers.from_name IS 'Name associated with this subscriber';
