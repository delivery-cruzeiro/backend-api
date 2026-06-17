ALTER TABLE "cup_poll_guesses"
	ADD COLUMN "score_format" TEXT;

UPDATE "cup_poll_guesses"
SET "score_format" = regexp_replace(
	regexp_replace(lower("score"), '\([0-9]+\)', '', 'g'),
	'\s+',
	'',
	'g'
)
WHERE "score_format" IS NULL;

ALTER TABLE "cup_poll_guesses"
	ALTER COLUMN "score_format" SET NOT NULL;

DROP INDEX "cup_poll_guesses_instagram_handle_key";

CREATE UNIQUE INDEX "cup_poll_guesses_instagram_handle_score_format_key"
	ON "cup_poll_guesses"("instagram_handle", "score_format");
