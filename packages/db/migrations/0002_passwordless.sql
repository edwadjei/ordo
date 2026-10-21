ALTER TABLE users ADD COLUMN phone text UNIQUE;
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN phone_verified_at timestamptz;
CREATE TABLE otp_challenges (
 contact text PRIMARY KEY,
 challenge_id uuid NOT NULL UNIQUE,
 code_hash text NOT NULL,
 expires_at timestamptz NOT NULL,
 next_send_at timestamptz NOT NULL,
 window_started_at timestamptz NOT NULL,
 requests integer NOT NULL DEFAULT 0,
 attempts integer NOT NULL DEFAULT 0,
 ready boolean NOT NULL DEFAULT false,
 consumed boolean NOT NULL DEFAULT false
);
