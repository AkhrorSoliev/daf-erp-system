-- User ID sequence'ni kamida 10000 dan boshlash (5 xonali ID)
SELECT setval(pg_get_serial_sequence('"User"', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM "User"), 0), 9999));

-- Student ID sequence'ni kamida 10000 dan boshlash (5 xonali ID)
SELECT setval(pg_get_serial_sequence('"Student"', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM "Student"), 0), 9999));
