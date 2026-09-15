CREATE TABLE "cup_poll_guesses" (
	"id" TEXT NOT NULL,
	"instagram_handle" TEXT NOT NULL,
	"score" TEXT NOT NULL,
	"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "cup_poll_guesses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cup_poll_guesses_instagram_handle_key"
	ON "cup_poll_guesses"("instagram_handle");

CREATE INDEX "cup_poll_guesses_created_at_idx"
	ON "cup_poll_guesses"("created_at");
