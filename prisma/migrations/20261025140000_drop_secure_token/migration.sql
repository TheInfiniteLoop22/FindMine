-- Email-code sign-up and password reset are gone (Google sign-in only), so the
-- table that held their one-time codes and tickets is no longer used.
DROP TABLE "SecureToken";
