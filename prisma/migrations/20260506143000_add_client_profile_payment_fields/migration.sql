CREATE TYPE "UserGender" AS ENUM (
	'FEMALE',
	'MALE',
	'NON_BINARY',
	'OTHER',
	'PREFER_NOT_TO_SAY'
);

CREATE TYPE "PaymentCardType" AS ENUM ('CREDIT', 'DEBIT');

ALTER TABLE "User"
ADD COLUMN "gender" "UserGender";

ALTER TABLE "PaymentMethod"
ADD COLUMN "cardType" "PaymentCardType";
