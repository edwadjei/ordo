CREATE TABLE audio_settings (
 owner_user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 provider text NOT NULL DEFAULT 'local_whisper' CHECK (provider IN ('local_whisper','openai')),
 encrypted_api_key text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
