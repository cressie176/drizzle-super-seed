CREATE TYPE "public"."letting_status" AS ENUM('pending', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TABLE "holiday_homes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"pitch_id" integer NOT NULL,
	"owner_id" uuid NOT NULL,
	"model" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lettings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lettings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"holiday_home_id" bigserial NOT NULL,
	"guest_name" varchar(200) NOT NULL,
	"status" "letting_status" DEFAULT 'pending' NOT NULL,
	"start_date" date NOT NULL,
	"cleaning_fee" numeric(8, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"email" varchar(320) NOT NULL,
	"member_since" date NOT NULL,
	"referred_by_owner_id" uuid,
	CONSTRAINT "owners_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "parks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "parks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(120) NOT NULL,
	"region" varchar(40) NOT NULL,
	"opened_at" date NOT NULL,
	"latitude" double precision,
	"amenities" jsonb,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pitches" (
	"id" serial PRIMARY KEY NOT NULL,
	"park_id" integer NOT NULL,
	"reference" varchar(20) NOT NULL,
	"monthly_fee" numeric(8, 2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holiday_homes" ADD CONSTRAINT "holiday_homes_pitch_id_pitches_id_fk" FOREIGN KEY ("pitch_id") REFERENCES "public"."pitches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_homes" ADD CONSTRAINT "holiday_homes_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lettings" ADD CONSTRAINT "lettings_holiday_home_id_holiday_homes_id_fk" FOREIGN KEY ("holiday_home_id") REFERENCES "public"."holiday_homes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owners" ADD CONSTRAINT "owners_referred_by_owner_id_owners_id_fk" FOREIGN KEY ("referred_by_owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitches" ADD CONSTRAINT "pitches_park_id_parks_id_fk" FOREIGN KEY ("park_id") REFERENCES "public"."parks"("id") ON DELETE no action ON UPDATE no action;