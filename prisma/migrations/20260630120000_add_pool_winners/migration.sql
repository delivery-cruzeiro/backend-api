CREATE TABLE IF NOT EXISTS "pool_winners" (
	"match" TEXT PRIMARY KEY,
	"result" TEXT NOT NULL,
	"first_winner" TEXT,
	"second_winner" TEXT,
	"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION "set_pool_winners_from_guesses"()
RETURNS TRIGGER AS $$
DECLARE
	first_handle TEXT;
	second_handle TEXT;
BEGIN
	SELECT "instagram_handle"
	INTO first_handle
	FROM "cup_poll_guesses"
	WHERE "score_format" = NEW."match"
		AND "score" = NEW."result"
	ORDER BY "created_at" ASC, "id" ASC
	LIMIT 1;

	SELECT "instagram_handle"
	INTO second_handle
	FROM (
		SELECT "instagram_handle", random() AS random_order
		FROM "cup_poll_guesses"
		WHERE "score_format" = NEW."match"
			AND "score" = NEW."result"
			AND (
				first_handle IS NULL
				OR "instagram_handle" <> first_handle
			)
	) AS eligible_guesses
	ORDER BY random_order
	LIMIT 1;

	NEW."first_winner" = COALESCE(NEW."first_winner", first_handle);
	NEW."second_winner" = COALESCE(NEW."second_winner", second_handle);
	NEW."updated_at" = CURRENT_TIMESTAMP;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "pool_winners_set_winners_trigger" ON "pool_winners";

CREATE TRIGGER "pool_winners_set_winners_trigger"
BEFORE INSERT OR UPDATE OF "result" ON "pool_winners"
FOR EACH ROW
EXECUTE FUNCTION "set_pool_winners_from_guesses"();
