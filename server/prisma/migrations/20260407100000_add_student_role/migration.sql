-- Add Student role (id: 6) if it doesn't exist
INSERT INTO "Role" (id, name) VALUES (6, 'Student') ON CONFLICT (id) DO NOTHING;
