import { sql } from 'drizzle-orm';
// The MusicBrainz schema (musicbrainz schema only, 372 tables), introspected with
// drizzle-kit pull 0.31.10 against the DDL at metabrainz/musicbrainz-server commit
// 5d91d1f4df996e3c593d290d28d89f03f1c10536 (v-2026-07-30.1), then repaired by hand where the
// pull's output was wrong. The repairs, recorded so a regeneration can repeat them:
//
// 1. 256 defaults rendered as the unterminated literal .default(') - drizzle-kit's rendering
//    of DEFAULT ''::text and ''::character varying - became .default('').
// 2. medium_index.toc pulled as the non-compiling unknown("toc"); it is a cube, carried here
//    through the customType contract, with the rule supplying its text form.
// 3. place.coordinates is a point, which the library refuses; nullable, so deleted, because
//    omitted columns are never inserted.
// 4. The six array columns of the artist_release and artist_release_group partitions lost
//    their .array() in the pull (cdtoc's survived); restored, or the module lies about the
//    type and the failure is a malformed array literal at COPY time.
//
// Two partitioned parents (artist_release, artist_release_group) are invisible to the pull
// and absent here, along with their four foreign keys; their partitions are present and are
// seeded directly, respecting the LIST (is_track_artist) bounds.
import {
  bigint,
  boolean,
  char,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  point,
  primaryKey,
  serial,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const musicbrainz = pgSchema('musicbrainz');

// cube via the customType contract: the rule supplies the text form the column accepts.
const cube = customType<{ data: string }>({ dataType: () => 'cube' });
export const coverArtPresenceInMusicbrainz = musicbrainz.enum('cover_art_presence', ['absent', 'present', 'darkened']);
export const editNoteStatusInMusicbrainz = musicbrainz.enum('edit_note_status', ['deleted', 'edited']);
export const eventArtPresenceInMusicbrainz = musicbrainz.enum('event_art_presence', ['absent', 'present', 'darkened']);
export const fluencyInMusicbrainz = musicbrainz.enum('fluency', ['basic', 'intermediate', 'advanced', 'native']);
export const oauthCodeChallengeMethodInMusicbrainz = musicbrainz.enum('oauth_code_challenge_method', ['plain', 'S256']);
export const ratableEntityTypeInMusicbrainz = musicbrainz.enum('ratable_entity_type', [
  'artist',
  'event',
  'label',
  'place',
  'recording',
  'release_group',
  'work',
]);
export const taggableEntityTypeInMusicbrainz = musicbrainz.enum('taggable_entity_type', [
  'area',
  'artist',
  'event',
  'instrument',
  'label',
  'place',
  'recording',
  'release',
  'release_group',
  'series',
  'work',
]);

export const alternativeMediumInMusicbrainz = musicbrainz.table(
  'alternative_medium',
  {
    id: serial().primaryKey().notNull(),
    medium: integer().notNull(),
    alternativeRelease: integer('alternative_release').notNull(),
    name: varchar(),
  },
  (table) => [
    index('alternative_medium_idx_alternative_release').using(
      'btree',
      table.alternativeRelease.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.medium],
      foreignColumns: [mediumInMusicbrainz.id],
      name: 'alternative_medium_fk_medium',
    }),
    foreignKey({
      columns: [table.alternativeRelease],
      foreignColumns: [alternativeReleaseInMusicbrainz.id],
      name: 'alternative_medium_fk_alternative_release',
    }),
    check('alternative_medium_name_check', sql`(name)::text <> ''::text`),
  ],
);

export const alternativeReleaseInMusicbrainz = musicbrainz.table(
  'alternative_release',
  {
    id: serial().primaryKey().notNull(),
    gid: uuid().notNull(),
    release: integer().notNull(),
    name: varchar(),
    artistCredit: integer('artist_credit'),
    type: integer().notNull(),
    language: integer().notNull(),
    script: integer().notNull(),
    comment: varchar({ length: 255 }).default('').notNull(),
  },
  (table) => [
    index('alternative_release_idx_artist_credit').using('btree', table.artistCredit.asc().nullsLast().op('int4_ops')),
    uniqueIndex('alternative_release_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    index('alternative_release_idx_language_script').using(
      'btree',
      table.language.asc().nullsLast().op('int4_ops'),
      table.script.asc().nullsLast().op('int4_ops'),
    ),
    index('alternative_release_idx_name').using('btree', table.name.asc().nullsLast().op('text_ops')),
    index('alternative_release_idx_release').using('btree', table.release.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.release],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'alternative_release_fk_release',
    }),
    foreignKey({
      columns: [table.artistCredit],
      foreignColumns: [artistCreditInMusicbrainz.id],
      name: 'alternative_release_fk_artist_credit',
    }),
    foreignKey({
      columns: [table.type],
      foreignColumns: [alternativeReleaseTypeInMusicbrainz.id],
      name: 'alternative_release_fk_type',
    }),
    foreignKey({
      columns: [table.language],
      foreignColumns: [languageInMusicbrainz.id],
      name: 'alternative_release_fk_language',
    }),
    foreignKey({
      columns: [table.script],
      foreignColumns: [scriptInMusicbrainz.id],
      name: 'alternative_release_fk_script',
    }),
    check('alternative_release_name_check', sql`(name)::text <> ''::text`),
  ],
);

export const alternativeTrackInMusicbrainz = musicbrainz.table(
  'alternative_track',
  {
    id: serial().primaryKey().notNull(),
    name: varchar(),
    artistCredit: integer('artist_credit'),
    refCount: integer('ref_count').default(0).notNull(),
  },
  (table) => [
    index('alternative_track_idx_artist_credit').using('btree', table.artistCredit.asc().nullsLast().op('int4_ops')),
    index('alternative_track_idx_name').using('btree', table.name.asc().nullsLast().op('text_ops')),
    foreignKey({
      columns: [table.artistCredit],
      foreignColumns: [artistCreditInMusicbrainz.id],
      name: 'alternative_track_fk_artist_credit',
    }),
    check(
      'alternative_track_check',
      sql`((name)::text <> ''::text) AND ((name IS NOT NULL) OR (artist_credit IS NOT NULL))`,
    ),
  ],
);

export const alternativeReleaseTypeInMusicbrainz = musicbrainz.table(
  'alternative_release_type',
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'alternative_release_type_fk_parent',
    }),
  ],
);

export const annotationInMusicbrainz = musicbrainz.table(
  'annotation',
  {
    id: serial().primaryKey().notNull(),
    editor: integer().notNull(),
    text: text(),
    changelog: varchar({ length: 255 }),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('annotation_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'annotation_fk_editor',
    }),
  ],
);

export const applicationInMusicbrainz = musicbrainz.table(
  'application',
  {
    id: serial().primaryKey().notNull(),
    owner: integer().notNull(),
    name: text().notNull(),
    oauthId: text('oauth_id').notNull(),
    oauthSecret: text('oauth_secret').notNull(),
    oauthRedirectUri: text('oauth_redirect_uri'),
  },
  (table) => [
    uniqueIndex('application_idx_oauth_id').using('btree', table.oauthId.asc().nullsLast().op('text_ops')),
    index('application_idx_owner').using('btree', table.owner.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.owner],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'application_fk_owner',
    }),
  ],
);

export const areaTypeInMusicbrainz = musicbrainz.table(
  'area_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('area_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'area_type_fk_parent',
    }),
  ],
);

export const areaAliasTypeInMusicbrainz = musicbrainz.table(
  'area_alias_type',
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('area_alias_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'area_alias_type_fk_parent',
    }),
  ],
);

export const areaGidRedirectInMusicbrainz = musicbrainz.table(
  'area_gid_redirect',
  {
    gid: uuid().primaryKey().notNull(),
    newId: integer('new_id').notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('area_gid_redirect_idx_new_id').using('btree', table.newId.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.newId],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'area_gid_redirect_fk_new_id',
    }),
  ],
);

export const areaInMusicbrainz = musicbrainz.table(
  'area',
  {
    id: serial().primaryKey().notNull(),
    gid: uuid().notNull(),
    name: varchar().notNull(),
    type: integer(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    ended: boolean().default(false).notNull(),
    comment: varchar({ length: 255 }).default('').notNull(),
  },
  (table) => [
    uniqueIndex('area_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    index('area_idx_name').using('btree', table.name.asc().nullsLast().op('text_ops')),
    foreignKey({
      columns: [table.type],
      foreignColumns: [areaTypeInMusicbrainz.id],
      name: 'area_fk_type',
    }),
    check(
      'area_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
    check('area_comment_check', sql`CHECK (musicbrainz.controlled_for_whitespace((comment)::text`),
    check('area_edits_pending_check', sql`edits_pending >= 0`),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
  ],
);

export const areaAttributeTypeInMusicbrainz = musicbrainz.table(
  'area_attribute_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    comment: varchar({ length: 255 }).default('').notNull(),
    freeText: boolean('free_text').notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('area_attribute_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'area_attribute_type_fk_parent',
    }),
  ],
);

export const areaAttributeTypeAllowedValueInMusicbrainz = musicbrainz.table(
  'area_attribute_type_allowed_value',
  {
    id: serial().primaryKey().notNull(),
    areaAttributeType: integer('area_attribute_type').notNull(),
    value: text(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('area_attribute_type_allowed_value_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    index('area_attribute_type_allowed_value_idx_name').using(
      'btree',
      table.areaAttributeType.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.areaAttributeType],
      foreignColumns: [areaAttributeTypeInMusicbrainz.id],
      name: 'area_attribute_type_allowed_value_fk_area_attribute_type',
    }),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'area_attribute_type_allowed_value_fk_parent',
    }),
  ],
);

export const areaAttributeInMusicbrainz = musicbrainz.table(
  'area_attribute',
  {
    id: serial().primaryKey().notNull(),
    area: integer().notNull(),
    areaAttributeType: integer('area_attribute_type').notNull(),
    areaAttributeTypeAllowedValue: integer('area_attribute_type_allowed_value'),
    areaAttributeText: text('area_attribute_text'),
  },
  (table) => [
    index('area_attribute_idx_area').using('btree', table.area.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.area],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'area_attribute_fk_area',
    }),
    foreignKey({
      columns: [table.areaAttributeType],
      foreignColumns: [areaAttributeTypeInMusicbrainz.id],
      name: 'area_attribute_fk_area_attribute_type',
    }),
    foreignKey({
      columns: [table.areaAttributeTypeAllowedValue],
      foreignColumns: [areaAttributeTypeAllowedValueInMusicbrainz.id],
      name: 'area_attribute_fk_area_attribute_type_allowed_value',
    }),
    check(
      'area_attribute_check',
      sql`((area_attribute_type_allowed_value IS NULL) AND (area_attribute_text IS NOT NULL)) OR ((area_attribute_type_allowed_value IS NOT NULL) AND (area_attribute_text IS NULL))`,
    ),
  ],
);

export const artistAliasTypeInMusicbrainz = musicbrainz.table(
  'artist_alias_type',
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('artist_alias_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'artist_alias_type_fk_parent',
    }),
  ],
);

export const artistAttributeTypeInMusicbrainz = musicbrainz.table(
  'artist_attribute_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    comment: varchar({ length: 255 }).default('').notNull(),
    freeText: boolean('free_text').notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('artist_attribute_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'artist_attribute_type_fk_parent',
    }),
  ],
);

export const cdtocRawInMusicbrainz = musicbrainz.table(
  'cdtoc_raw',
  {
    id: serial().primaryKey().notNull(),
    release: integer().notNull(),
    discid: char({ length: 28 }).notNull(),
    trackCount: integer('track_count').notNull(),
    leadoutOffset: integer('leadout_offset').notNull(),
    trackOffset: integer('track_offset').array().notNull(),
  },
  (table) => [
    index('cdtoc_raw_discid').using('btree', table.discid.asc().nullsLast().op('bpchar_ops')),
    uniqueIndex('cdtoc_raw_toc').using(
      'btree',
      table.trackCount.asc().nullsLast().op('int4_ops'),
      table.leadoutOffset.asc().nullsLast().op('int4_ops'),
      table.trackOffset.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.release],
      foreignColumns: [releaseRawInMusicbrainz.id],
      name: 'cdtoc_raw_fk_release',
    }),
  ],
);

export const artistTypeInMusicbrainz = musicbrainz.table(
  'artist_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('artist_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'artist_type_fk_parent',
    }),
  ],
);

export const artistCreditInMusicbrainz = musicbrainz.table(
  'artist_credit',
  {
    id: serial().primaryKey().notNull(),
    name: varchar().notNull(),
    artistCount: smallint('artist_count').notNull(),
    refCount: integer('ref_count').default(0),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
    editsPending: integer('edits_pending').default(0).notNull(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('artist_credit_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    index('artist_credit_idx_musicbrainz_collate').using('btree', table.name.asc().nullsLast().op('text_ops')),
    check('artist_credit_edits_pending_check', sql`edits_pending >= 0`),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
  ],
);

export const artistAttributeInMusicbrainz = musicbrainz.table(
  'artist_attribute',
  {
    id: serial().primaryKey().notNull(),
    artist: integer().notNull(),
    artistAttributeType: integer('artist_attribute_type').notNull(),
    artistAttributeTypeAllowedValue: integer('artist_attribute_type_allowed_value'),
    artistAttributeText: text('artist_attribute_text'),
  },
  (table) => [
    index('artist_attribute_idx_artist').using('btree', table.artist.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.artist],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'artist_attribute_fk_artist',
    }),
    foreignKey({
      columns: [table.artistAttributeType],
      foreignColumns: [artistAttributeTypeInMusicbrainz.id],
      name: 'artist_attribute_fk_artist_attribute_type',
    }),
    foreignKey({
      columns: [table.artistAttributeTypeAllowedValue],
      foreignColumns: [artistAttributeTypeAllowedValueInMusicbrainz.id],
      name: 'artist_attribute_fk_artist_attribute_type_allowed_value',
    }),
    check(
      'artist_attribute_check',
      sql`((artist_attribute_type_allowed_value IS NULL) AND (artist_attribute_text IS NOT NULL)) OR ((artist_attribute_type_allowed_value IS NOT NULL) AND (artist_attribute_text IS NULL))`,
    ),
  ],
);

export const artistCreditGidRedirectInMusicbrainz = musicbrainz.table(
  'artist_credit_gid_redirect',
  {
    gid: uuid().primaryKey().notNull(),
    newId: integer('new_id').notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('artist_credit_gid_redirect_idx_new_id').using('btree', table.newId.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.newId],
      foreignColumns: [artistCreditInMusicbrainz.id],
      name: 'artist_credit_gid_redirect_fk_new_id',
    }),
  ],
);

export const artistGidRedirectInMusicbrainz = musicbrainz.table(
  'artist_gid_redirect',
  {
    gid: uuid().primaryKey().notNull(),
    newId: integer('new_id').notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('artist_gid_redirect_idx_new_id').using('btree', table.newId.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.newId],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'artist_gid_redirect_fk_new_id',
    }),
  ],
);

export const artistMetaInMusicbrainz = musicbrainz.table(
  'artist_meta',
  {
    id: integer().primaryKey().notNull(),
    rating: smallint(),
    ratingCount: integer('rating_count'),
  },
  (table) => [
    foreignKey({
      columns: [table.id],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'artist_meta_fk_id',
    }).onDelete('cascade'),
    check('artist_meta_rating_check', sql`(rating >= 0) AND (rating <= 100)`),
  ],
);

export const artistReleaseNonvaInMusicbrainz = musicbrainz.table(
  'artist_release_nonva',
  {
    isTrackArtist: boolean('is_track_artist').notNull(),
    artist: integer().notNull(),
    firstReleaseDate: integer('first_release_date'),
    catalogNumbers: text('catalog_numbers').array(),
    countryCode: char('country_code', { length: 2 }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    barcode: bigint({ mode: 'number' }),
    name: varchar().notNull(),
    release: integer().notNull(),
  },
  (table) => [
    index('artist_release_nonva_idx_sort').using(
      'btree',
      table.artist.asc().nullsLast().op('int4_ops'),
      table.firstReleaseDate.asc().nullsLast().op('int4_ops'),
      table.catalogNumbers.asc().nullsLast().op('int4_ops'),
      table.countryCode.asc().nullsLast().op('int4_ops'),
      table.barcode.asc().nullsLast().op('int4_ops'),
      table.name.asc().nullsLast().op('int4_ops'),
      table.release.asc().nullsLast().op('int4_ops'),
    ),
    uniqueIndex('artist_release_nonva_idx_uniq').using(
      'btree',
      table.release.asc().nullsLast().op('int4_ops'),
      table.artist.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.artist],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'artist_release_fk_artist',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.release],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'artist_release_fk_release',
    }).onDelete('cascade'),
  ],
);

export const autoeditorElectionInMusicbrainz = musicbrainz.table(
  'autoeditor_election',
  {
    id: serial().primaryKey().notNull(),
    candidate: integer().notNull(),
    proposer: integer().notNull(),
    seconder1: integer('seconder_1'),
    seconder2: integer('seconder_2'),
    status: integer().default(1).notNull(),
    yesVotes: integer('yes_votes').default(0).notNull(),
    noVotes: integer('no_votes').default(0).notNull(),
    proposeTime: timestamp('propose_time', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    openTime: timestamp('open_time', { withTimezone: true, mode: 'string' }),
    closeTime: timestamp('close_time', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    foreignKey({
      columns: [table.candidate],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'autoeditor_election_fk_candidate',
    }),
    foreignKey({
      columns: [table.proposer],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'autoeditor_election_fk_proposer',
    }),
    foreignKey({
      columns: [table.seconder1],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'autoeditor_election_fk_seconder_1',
    }),
    foreignKey({
      columns: [table.seconder2],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'autoeditor_election_fk_seconder_2',
    }),
    check('autoeditor_election_status_check', sql`status = ANY (ARRAY[1, 2, 3, 4, 5, 6])`),
  ],
);

export const artistReleasePendingUpdateInMusicbrainz = musicbrainz.table(
  'artist_release_pending_update',
  {
    release: integer().notNull(),
  },
  (table) => [
    index('artist_release_pending_update_idx_release').using('hash', table.release.asc().nullsLast().op('int4_ops')),
  ],
);

export const artistReleaseVaInMusicbrainz = musicbrainz.table(
  'artist_release_va',
  {
    isTrackArtist: boolean('is_track_artist').notNull(),
    artist: integer().notNull(),
    firstReleaseDate: integer('first_release_date'),
    catalogNumbers: text('catalog_numbers').array(),
    countryCode: char('country_code', { length: 2 }),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    barcode: bigint({ mode: 'number' }),
    name: varchar().notNull(),
    release: integer().notNull(),
  },
  (table) => [
    index('artist_release_va_idx_sort').using(
      'btree',
      table.artist.asc().nullsLast().op('int4_ops'),
      table.firstReleaseDate.asc().nullsLast().op('int4_ops'),
      table.catalogNumbers.asc().nullsLast().op('int4_ops'),
      table.countryCode.asc().nullsLast().op('int4_ops'),
      table.barcode.asc().nullsLast().op('int4_ops'),
      table.name.asc().nullsLast().op('int4_ops'),
      table.release.asc().nullsLast().op('int4_ops'),
    ),
    uniqueIndex('artist_release_va_idx_uniq').using(
      'btree',
      table.release.asc().nullsLast().op('int4_ops'),
      table.artist.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.artist],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'artist_release_fk_artist',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.release],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'artist_release_fk_release',
    }).onDelete('cascade'),
  ],
);

export const artistReleaseGroupPendingUpdateInMusicbrainz = musicbrainz.table(
  'artist_release_group_pending_update',
  {
    releaseGroup: integer('release_group').notNull(),
  },
  (table) => [
    index('artist_release_group_pending_update_idx_release_group').using(
      'hash',
      table.releaseGroup.asc().nullsLast().op('int4_ops'),
    ),
  ],
);

export const artistReleaseGroupNonvaInMusicbrainz = musicbrainz.table(
  'artist_release_group_nonva',
  {
    isTrackArtist: boolean('is_track_artist').notNull(),
    artist: integer().notNull(),
    unofficial: boolean().notNull(),
    primaryTypeChildOrder: smallint('primary_type_child_order'),
    primaryType: smallint('primary_type'),
    secondaryTypeChildOrders: smallint('secondary_type_child_orders').array(),
    secondaryTypes: smallint('secondary_types').array(),
    firstReleaseDate: integer('first_release_date'),
    name: varchar().notNull(),
    releaseGroup: integer('release_group').notNull(),
  },
  (table) => [
    index('artist_release_group_nonva_idx_sort').using(
      'btree',
      table.artist.asc().nullsLast().op('int4_ops'),
      table.unofficial.asc().nullsLast().op('int4_ops'),
      table.primaryTypeChildOrder.asc().nullsFirst().op('int4_ops'),
      table.primaryType.asc().nullsFirst().op('int4_ops'),
      table.secondaryTypeChildOrders.asc().nullsFirst().op('int4_ops'),
      table.secondaryTypes.asc().nullsFirst().op('int4_ops'),
      table.firstReleaseDate.asc().nullsLast().op('int4_ops'),
      table.name.asc().nullsLast().op('int4_ops'),
      table.releaseGroup.asc().nullsLast().op('int4_ops'),
    ),
    uniqueIndex('artist_release_group_nonva_idx_uniq').using(
      'btree',
      table.releaseGroup.asc().nullsLast().op('int4_ops'),
      table.artist.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.artist],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'artist_release_group_fk_artist',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.releaseGroup],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'artist_release_group_fk_release_group',
    }).onDelete('cascade'),
  ],
);

export const artistReleaseGroupVaInMusicbrainz = musicbrainz.table(
  'artist_release_group_va',
  {
    isTrackArtist: boolean('is_track_artist').notNull(),
    artist: integer().notNull(),
    unofficial: boolean().notNull(),
    primaryTypeChildOrder: smallint('primary_type_child_order'),
    primaryType: smallint('primary_type'),
    secondaryTypeChildOrders: smallint('secondary_type_child_orders').array(),
    secondaryTypes: smallint('secondary_types').array(),
    firstReleaseDate: integer('first_release_date'),
    name: varchar().notNull(),
    releaseGroup: integer('release_group').notNull(),
  },
  (table) => [
    index('artist_release_group_va_idx_sort').using(
      'btree',
      table.artist.asc().nullsLast().op('int4_ops'),
      table.unofficial.asc().nullsLast().op('int4_ops'),
      table.primaryTypeChildOrder.asc().nullsFirst().op('int4_ops'),
      table.primaryType.asc().nullsFirst().op('int4_ops'),
      table.secondaryTypeChildOrders.asc().nullsFirst().op('int4_ops'),
      table.secondaryTypes.asc().nullsFirst().op('int4_ops'),
      table.firstReleaseDate.asc().nullsLast().op('int4_ops'),
      table.name.asc().nullsLast().op('int4_ops'),
      table.releaseGroup.asc().nullsLast().op('int4_ops'),
    ),
    uniqueIndex('artist_release_group_va_idx_uniq').using(
      'btree',
      table.releaseGroup.asc().nullsLast().op('int4_ops'),
      table.artist.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.artist],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'artist_release_group_fk_artist',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.releaseGroup],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'artist_release_group_fk_release_group',
    }).onDelete('cascade'),
  ],
);

export const autoeditorElectionVoteInMusicbrainz = musicbrainz.table(
  'autoeditor_election_vote',
  {
    id: serial().primaryKey().notNull(),
    autoeditorElection: integer('autoeditor_election').notNull(),
    voter: integer().notNull(),
    vote: integer().notNull(),
    voteTime: timestamp('vote_time', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    index('autoeditor_election_vote_idx_voter').using('btree', table.voter.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.autoeditorElection],
      foreignColumns: [autoeditorElectionInMusicbrainz.id],
      name: 'autoeditor_election_vote_fk_autoeditor_election',
    }),
    foreignKey({
      columns: [table.voter],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'autoeditor_election_vote_fk_voter',
    }),
    check('autoeditor_election_vote_vote_check', sql`vote = ANY (ARRAY['-1'::integer, 0, 1])`),
  ],
);

export const cdtocInMusicbrainz = musicbrainz.table(
  'cdtoc',
  {
    id: serial().primaryKey().notNull(),
    discid: char({ length: 28 }).notNull(),
    freedbId: char('freedb_id', { length: 8 }).notNull(),
    trackCount: integer('track_count').notNull(),
    leadoutOffset: integer('leadout_offset').notNull(),
    trackOffset: integer('track_offset').array().notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    uniqueIndex('cdtoc_idx_discid').using('btree', table.discid.asc().nullsLast().op('bpchar_ops')),
    index('cdtoc_idx_freedb_id').using('btree', table.freedbId.asc().nullsLast().op('bpchar_ops')),
  ],
);

export const editNoteChangeInMusicbrainz = musicbrainz.table(
  'edit_note_change',
  {
    id: serial().primaryKey().notNull(),
    status: editNoteStatusInMusicbrainz(),
    editNote: integer('edit_note').notNull(),
    changeEditor: integer('change_editor').notNull(),
    changeTime: timestamp('change_time', { withTimezone: true, mode: 'string' }).defaultNow(),
    oldNote: text('old_note').notNull(),
    newNote: text('new_note').notNull(),
    reason: text().default('').notNull(),
  },
  (table) => [
    index('edit_note_change_idx_edit_note').using('btree', table.editNote.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.editNote],
      foreignColumns: [editNoteInMusicbrainz.id],
      name: 'edit_note_change_fk_edit_note',
    }),
    foreignKey({
      columns: [table.changeEditor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'edit_note_change_fk_change_editor',
    }),
  ],
);

export const countryAreaInMusicbrainz = musicbrainz.table(
  'country_area',
  {
    area: integer().primaryKey().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.area],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'country_area_fk_area',
    }),
  ],
);

export const editorInMusicbrainz = musicbrainz.table(
  'editor',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 64 }).notNull(),
    privs: integer().default(0),
    email: varchar({ length: 64 }).default(sql`NULL`),
    website: varchar({ length: 255 }).default(sql`NULL`),
    bio: text(),
    memberSince: timestamp('member_since', { withTimezone: true, mode: 'string' }).defaultNow(),
    emailConfirmDate: timestamp('email_confirm_date', { withTimezone: true, mode: 'string' }),
    lastLoginDate: timestamp('last_login_date', { withTimezone: true, mode: 'string' }).defaultNow(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    birthDate: date('birth_date'),
    gender: integer(),
    area: integer(),
    password: varchar({ length: 128 }).notNull(),
    ha1: char({ length: 32 }).notNull(),
    deleted: boolean().default(false).notNull(),
  },
  (table) => [
    index('editor_idx_deleted').using('btree', table.id.asc().nullsLast().op('int4_ops')).where(sql`deleted`),
    uniqueIndex('editor_idx_name').using('btree', sql`lower((name)::text)`),
    foreignKey({
      columns: [table.gender],
      foreignColumns: [genderInMusicbrainz.id],
      name: 'editor_fk_gender',
    }),
    foreignKey({
      columns: [table.area],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'editor_fk_area',
    }),
  ],
);

export const editInMusicbrainz = musicbrainz.table(
  'edit',
  {
    id: serial().primaryKey().notNull(),
    editor: integer().notNull(),
    type: smallint().notNull(),
    status: smallint().notNull(),
    autoedit: smallint().default(0).notNull(),
    openTime: timestamp('open_time', { withTimezone: true, mode: 'string' }).defaultNow(),
    closeTime: timestamp('close_time', { withTimezone: true, mode: 'string' }),
    expireTime: timestamp('expire_time', { withTimezone: true, mode: 'string' }).notNull(),
    language: integer(),
    quality: smallint().default(1).notNull(),
  },
  (table) => [
    index('edit_idx_close_time').using('brin', table.closeTime.asc().nullsLast().op('timestamptz_minmax_ops')),
    index('edit_idx_editor_id_desc').using(
      'btree',
      table.editor.asc().nullsLast().op('int4_ops'),
      table.id.desc().nullsFirst().op('int4_ops'),
    ),
    index('edit_idx_editor_open_time').using(
      'btree',
      table.editor.asc().nullsLast().op('int4_ops'),
      table.openTime.asc().nullsLast().op('timestamptz_ops'),
    ),
    index('edit_idx_expire_time').using('brin', table.expireTime.asc().nullsLast().op('timestamptz_minmax_ops')),
    index('edit_idx_open_time').using('brin', table.openTime.asc().nullsLast().op('timestamptz_minmax_ops')),
    index('edit_idx_status_id')
      .using('btree', table.status.asc().nullsLast().op('int4_ops'), table.id.asc().nullsLast().op('int2_ops'))
      .where(sql`(status <> 2)`),
    index('edit_idx_type_id').using(
      'btree',
      table.type.asc().nullsLast().op('int4_ops'),
      table.id.asc().nullsLast().op('int2_ops'),
    ),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'edit_fk_editor',
    }),
    foreignKey({
      columns: [table.language],
      foreignColumns: [languageInMusicbrainz.id],
      name: 'edit_fk_language',
    }),
  ],
);

export const editDataInMusicbrainz = musicbrainz.table(
  'edit_data',
  {
    edit: integer().primaryKey().notNull(),
    data: jsonb().notNull(),
  },
  (table) => [
    index('edit_data_idx_link_type').using('gin', sql`array_remove(ARRAY[((data #>> '{link_type,id}'::text[]))::integ`),
    foreignKey({
      columns: [table.edit],
      foreignColumns: [editInMusicbrainz.id],
      name: 'edit_data_fk_edit',
    }),
  ],
);

export const editNoteInMusicbrainz = musicbrainz.table(
  'edit_note',
  {
    id: serial().primaryKey().notNull(),
    editor: integer().notNull(),
    edit: integer().notNull(),
    text: text().notNull(),
    postTime: timestamp('post_time', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('edit_note_idx_edit').using('btree', table.edit.asc().nullsLast().op('int4_ops')),
    index('edit_note_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'edit_note_fk_editor',
    }),
    foreignKey({
      columns: [table.edit],
      foreignColumns: [editInMusicbrainz.id],
      name: 'edit_note_fk_edit',
    }),
  ],
);

export const deletedEntityInMusicbrainz = musicbrainz.table('deleted_entity', {
  gid: uuid().primaryKey().notNull(),
  data: jsonb().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const editorPreferenceInMusicbrainz = musicbrainz.table(
  'editor_preference',
  {
    id: serial().primaryKey().notNull(),
    editor: integer().notNull(),
    name: varchar({ length: 50 }).notNull(),
    value: varchar({ length: 100 }).notNull(),
  },
  (table) => [
    uniqueIndex('editor_preference_idx_editor_name').using(
      'btree',
      table.editor.asc().nullsLast().op('int4_ops'),
      table.name.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'editor_preference_fk_editor',
    }),
  ],
);

export const editorSubscribeLabelInMusicbrainz = musicbrainz.table(
  'editor_subscribe_label',
  {
    id: serial().primaryKey().notNull(),
    editor: integer().notNull(),
    label: integer().notNull(),
    lastEditSent: integer('last_edit_sent').notNull(),
  },
  (table) => [
    index('editor_subscribe_label_idx_label').using('btree', table.label.asc().nullsLast().op('int4_ops')),
    uniqueIndex('editor_subscribe_label_idx_uniq').using(
      'btree',
      table.editor.asc().nullsLast().op('int4_ops'),
      table.label.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'editor_subscribe_label_fk_editor',
    }),
    foreignKey({
      columns: [table.label],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'editor_subscribe_label_fk_label',
    }),
    foreignKey({
      columns: [table.lastEditSent],
      foreignColumns: [editInMusicbrainz.id],
      name: 'editor_subscribe_label_fk_last_edit_sent',
    }),
  ],
);

export const eventInMusicbrainz = musicbrainz.table(
  'event',
  {
    id: serial().primaryKey().notNull(),
    gid: uuid().notNull(),
    name: varchar().notNull(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    time: time(),
    type: integer(),
    cancelled: boolean().default(false).notNull(),
    setlist: text(),
    comment: varchar({ length: 255 }).default('').notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    ended: boolean().default(false).notNull(),
  },
  (table) => [
    uniqueIndex('event_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    index('event_idx_name').using('btree', table.name.asc().nullsLast().op('text_ops')),
    foreignKey({
      columns: [table.type],
      foreignColumns: [eventTypeInMusicbrainz.id],
      name: 'event_fk_type',
    }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('event_comment_check', sql`CHECK (musicbrainz.controlled_for_whitespace((comment)::text`),
    check('event_edits_pending_check', sql`edits_pending >= 0`),
    check(
      'event_ended_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
  ],
);

export const eventAttributeTypeAllowedValueInMusicbrainz = musicbrainz.table(
  'event_attribute_type_allowed_value',
  {
    id: serial().primaryKey().notNull(),
    eventAttributeType: integer('event_attribute_type').notNull(),
    value: text(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('event_attribute_type_allowed_value_idx_gid').using(
      'btree',
      table.gid.asc().nullsLast().op('uuid_ops'),
    ),
    index('event_attribute_type_allowed_value_idx_name').using(
      'btree',
      table.eventAttributeType.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.eventAttributeType],
      foreignColumns: [eventAttributeTypeInMusicbrainz.id],
      name: 'event_attribute_type_allowed_value_fk_event_attribute_type',
    }),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'event_attribute_type_allowed_value_fk_parent',
    }),
  ],
);

export const editorSubscribeArtistInMusicbrainz = musicbrainz.table(
  'editor_subscribe_artist',
  {
    id: serial().primaryKey().notNull(),
    editor: integer().notNull(),
    artist: integer().notNull(),
    lastEditSent: integer('last_edit_sent').notNull(),
  },
  (table) => [
    index('editor_subscribe_artist_idx_artist').using('btree', table.artist.asc().nullsLast().op('int4_ops')),
    uniqueIndex('editor_subscribe_artist_idx_uniq').using(
      'btree',
      table.editor.asc().nullsLast().op('int4_ops'),
      table.artist.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'editor_subscribe_artist_fk_editor',
    }),
    foreignKey({
      columns: [table.artist],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'editor_subscribe_artist_fk_artist',
    }),
    foreignKey({
      columns: [table.lastEditSent],
      foreignColumns: [editInMusicbrainz.id],
      name: 'editor_subscribe_artist_fk_last_edit_sent',
    }),
  ],
);

export const eventMetaInMusicbrainz = musicbrainz.table(
  'event_meta',
  {
    id: integer().primaryKey().notNull(),
    rating: smallint(),
    ratingCount: integer('rating_count'),
    eventArtPresence: eventArtPresenceInMusicbrainz('event_art_presence').default('absent').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.id],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'event_meta_fk_id',
    }).onDelete('cascade'),
    check('event_meta_rating_check', sql`(rating >= 0) AND (rating <= 100)`),
  ],
);

export const editorSubscribeCollectionInMusicbrainz = musicbrainz.table(
  'editor_subscribe_collection',
  {
    id: serial().primaryKey().notNull(),
    editor: integer().notNull(),
    collection: integer().notNull(),
    lastEditSent: integer('last_edit_sent').notNull(),
    available: boolean().default(true).notNull(),
    lastSeenName: varchar('last_seen_name', { length: 255 }),
  },
  (table) => [
    index('editor_subscribe_collection_idx_collection').using(
      'btree',
      table.collection.asc().nullsLast().op('int4_ops'),
    ),
    uniqueIndex('editor_subscribe_collection_idx_uniq').using(
      'btree',
      table.editor.asc().nullsLast().op('int4_ops'),
      table.collection.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'editor_subscribe_collection_fk_editor',
    }),
  ],
);

export const editorSubscribeEditorInMusicbrainz = musicbrainz.table(
  'editor_subscribe_editor',
  {
    id: serial().primaryKey().notNull(),
    editor: integer().notNull(),
    subscribedEditor: integer('subscribed_editor').notNull(),
    lastEditSent: integer('last_edit_sent').notNull(),
  },
  (table) => [
    uniqueIndex('editor_subscribe_editor_idx_uniq').using(
      'btree',
      table.editor.asc().nullsLast().op('int4_ops'),
      table.subscribedEditor.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'editor_subscribe_editor_fk_editor',
    }),
    foreignKey({
      columns: [table.subscribedEditor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'editor_subscribe_editor_fk_subscribed_editor',
    }),
  ],
);

export const editorSubscribeSeriesInMusicbrainz = musicbrainz.table(
  'editor_subscribe_series',
  {
    id: serial().primaryKey().notNull(),
    editor: integer().notNull(),
    series: integer().notNull(),
    lastEditSent: integer('last_edit_sent').notNull(),
  },
  (table) => [
    index('editor_subscribe_series_idx_series').using('btree', table.series.asc().nullsLast().op('int4_ops')),
    uniqueIndex('editor_subscribe_series_idx_uniq').using(
      'btree',
      table.editor.asc().nullsLast().op('int4_ops'),
      table.series.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'editor_subscribe_series_fk_editor',
    }),
    foreignKey({
      columns: [table.series],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'editor_subscribe_series_fk_series',
    }),
    foreignKey({
      columns: [table.lastEditSent],
      foreignColumns: [editInMusicbrainz.id],
      name: 'editor_subscribe_series_fk_last_edit_sent',
    }),
  ],
);

export const eventAliasTypeInMusicbrainz = musicbrainz.table(
  'event_alias_type',
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('event_alias_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'event_alias_type_fk_parent',
    }),
  ],
);

export const eventAttributeTypeInMusicbrainz = musicbrainz.table(
  'event_attribute_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    comment: varchar({ length: 255 }).default('').notNull(),
    freeText: boolean('free_text').notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('event_attribute_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'event_attribute_type_fk_parent',
    }),
  ],
);

export const eventAliasInMusicbrainz = musicbrainz.table(
  'event_alias',
  {
    id: serial().primaryKey().notNull(),
    event: integer().notNull(),
    name: varchar().notNull(),
    locale: text(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    type: integer(),
    sortName: varchar('sort_name').notNull(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    primaryForLocale: boolean('primary_for_locale').default(false).notNull(),
    ended: boolean().default(false).notNull(),
  },
  (table) => [
    index('event_alias_idx_event').using('btree', table.event.asc().nullsLast().op('int4_ops')),
    uniqueIndex('event_alias_idx_primary')
      .using('btree', table.event.asc().nullsLast().op('int4_ops'), table.locale.asc().nullsLast().op('int4_ops'))
      .where(sql`((primary_for_locale = true) AND (locale IS NOT NULL))`),
    foreignKey({
      columns: [table.event],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'event_alias_fk_event',
    }),
    foreignKey({
      columns: [table.type],
      foreignColumns: [eventAliasTypeInMusicbrainz.id],
      name: 'event_alias_fk_type',
    }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('control_for_whitespace_sort_name', sql`CHECK (musicbrainz.controlled_for_whitespace((sort_name)::text`),
    check(
      'event_alias_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
    check('event_alias_edits_pending_check', sql`edits_pending >= 0`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
    check('only_non_empty_sort_name', sql`(sort_name)::text <> ''::text`),
    check('primary_check', sql`((locale IS NULL) AND (primary_for_locale IS FALSE)) OR (locale IS NOT NULL)`),
    check(
      'search_hints_are_empty',
      sql`(type <> 2) OR ((type = 2) AND ((sort_name)::text = (name)::text) AND (begin_date_year IS NULL) AND (begin_date_month IS NULL) AND (begin_date_day IS NULL) AND (end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL) AND (primary_for_locale IS FALSE) AND (locale IS NULL))`,
    ),
  ],
);

export const genderInMusicbrainz = musicbrainz.table(
  'gender',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('gender_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'gender_fk_parent',
    }),
  ],
);

export const genreAliasTypeInMusicbrainz = musicbrainz.table(
  'genre_alias_type',
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('genre_alias_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'genre_alias_type_fk_parent',
    }),
  ],
);

export const instrumentTypeInMusicbrainz = musicbrainz.table(
  'instrument_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('instrument_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'instrument_type_fk_parent',
    }),
  ],
);

export const genreInMusicbrainz = musicbrainz.table(
  'genre',
  {
    id: serial().primaryKey().notNull(),
    gid: uuid().notNull(),
    name: varchar().notNull(),
    comment: varchar({ length: 255 }).default('').notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    uniqueIndex('genre_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    uniqueIndex('genre_idx_name').using('btree', sql`lower((name)::text)`),
    check('genre_edits_pending_check', sql`edits_pending >= 0`),
  ],
);

export const recordingFirstReleaseDateInMusicbrainz = musicbrainz.table(
  'recording_first_release_date',
  {
    recording: integer().primaryKey().notNull(),
    year: smallint(),
    month: smallint(),
    day: smallint(),
  },
  (table) => [
    foreignKey({
      columns: [table.recording],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'recording_first_release_date_fk_recording',
    }).onDelete('cascade'),
  ],
);

export const eventTypeInMusicbrainz = musicbrainz.table(
  'event_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('event_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'event_type_fk_parent',
    }),
  ],
);

export const eventAttributeInMusicbrainz = musicbrainz.table(
  'event_attribute',
  {
    id: serial().primaryKey().notNull(),
    event: integer().notNull(),
    eventAttributeType: integer('event_attribute_type').notNull(),
    eventAttributeTypeAllowedValue: integer('event_attribute_type_allowed_value'),
    eventAttributeText: text('event_attribute_text'),
  },
  (table) => [
    index('event_attribute_idx_event').using('btree', table.event.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.event],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'event_attribute_fk_event',
    }),
    foreignKey({
      columns: [table.eventAttributeType],
      foreignColumns: [eventAttributeTypeInMusicbrainz.id],
      name: 'event_attribute_fk_event_attribute_type',
    }),
    foreignKey({
      columns: [table.eventAttributeTypeAllowedValue],
      foreignColumns: [eventAttributeTypeAllowedValueInMusicbrainz.id],
      name: 'event_attribute_fk_event_attribute_type_allowed_value',
    }),
    check(
      'event_attribute_check',
      sql`((event_attribute_type_allowed_value IS NULL) AND (event_attribute_text IS NOT NULL)) OR ((event_attribute_type_allowed_value IS NOT NULL) AND (event_attribute_text IS NULL))`,
    ),
  ],
);

export const eventGidRedirectInMusicbrainz = musicbrainz.table(
  'event_gid_redirect',
  {
    gid: uuid().primaryKey().notNull(),
    newId: integer('new_id').notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('event_gid_redirect_idx_new_id').using('btree', table.newId.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.newId],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'event_gid_redirect_fk_new_id',
    }),
  ],
);

export const genreAliasInMusicbrainz = musicbrainz.table(
  'genre_alias',
  {
    id: serial().primaryKey().notNull(),
    genre: integer().notNull(),
    name: varchar().notNull(),
    locale: text(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    type: integer(),
    sortName: varchar('sort_name').notNull(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    primaryForLocale: boolean('primary_for_locale').default(false).notNull(),
    ended: boolean().default(false).notNull(),
  },
  (table) => [
    index('genre_alias_idx_genre').using('btree', table.genre.asc().nullsLast().op('int4_ops')),
    uniqueIndex('genre_alias_idx_primary')
      .using('btree', table.genre.asc().nullsLast().op('int4_ops'), table.locale.asc().nullsLast().op('int4_ops'))
      .where(sql`((primary_for_locale = true) AND (locale IS NOT NULL))`),
    foreignKey({
      columns: [table.genre],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'genre_alias_fk_genre',
    }),
    foreignKey({
      columns: [table.type],
      foreignColumns: [genreAliasTypeInMusicbrainz.id],
      name: 'genre_alias_fk_type',
    }),
    check(
      'genre_alias_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
    check('genre_alias_edits_pending_check', sql`edits_pending >= 0`),
    check('primary_check', sql`((locale IS NULL) AND (primary_for_locale IS FALSE)) OR (locale IS NOT NULL)`),
    check(
      'search_hints_are_empty',
      sql`(type <> 2) OR ((type = 2) AND ((sort_name)::text = (name)::text) AND (begin_date_year IS NULL) AND (begin_date_month IS NULL) AND (begin_date_day IS NULL) AND (end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL) AND (primary_for_locale IS FALSE) AND (locale IS NULL))`,
    ),
  ],
);

export const releaseFirstReleaseDateInMusicbrainz = musicbrainz.table(
  'release_first_release_date',
  {
    release: integer().primaryKey().notNull(),
    year: smallint(),
    month: smallint(),
    day: smallint(),
  },
  (table) => [
    foreignKey({
      columns: [table.release],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'release_first_release_date_fk_release',
    }).onDelete('cascade'),
  ],
);

export const instrumentAttributeTypeAllowedValueInMusicbrainz = musicbrainz.table(
  'instrument_attribute_type_allowed_value',
  {
    id: serial().primaryKey().notNull(),
    instrumentAttributeType: integer('instrument_attribute_type').notNull(),
    value: text(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('instrument_attribute_type_allowed_value_idx_gid').using(
      'btree',
      table.gid.asc().nullsLast().op('uuid_ops'),
    ),
    index('instrument_attribute_type_allowed_value_idx_name').using(
      'btree',
      table.instrumentAttributeType.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.instrumentAttributeType],
      foreignColumns: [instrumentAttributeTypeInMusicbrainz.id],
      name: 'instrument_attribute_type_allowed_value_fk_instrument_attribute',
    }),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'instrument_attribute_type_allowed_value_fk_parent',
    }),
  ],
);

export const instrumentGidRedirectInMusicbrainz = musicbrainz.table(
  'instrument_gid_redirect',
  {
    gid: uuid().primaryKey().notNull(),
    newId: integer('new_id').notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('instrument_gid_redirect_idx_new_id').using('btree', table.newId.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.newId],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'instrument_gid_redirect_fk_new_id',
    }),
  ],
);

export const iso31662InMusicbrainz = musicbrainz.table(
  'iso_3166_2',
  {
    area: integer().notNull(),
    code: varchar({ length: 10 }).primaryKey().notNull(),
  },
  (table) => [
    index('iso_3166_2_idx_area').using('btree', table.area.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.area],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'iso_3166_2_fk_area',
    }),
  ],
);

export const iso31663InMusicbrainz = musicbrainz.table(
  'iso_3166_3',
  {
    area: integer().notNull(),
    code: char({ length: 4 }).primaryKey().notNull(),
  },
  (table) => [
    index('iso_3166_3_idx_area').using('btree', table.area.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.area],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'iso_3166_3_fk_area',
    }),
  ],
);

export const instrumentInMusicbrainz = musicbrainz.table(
  'instrument',
  {
    id: serial().primaryKey().notNull(),
    gid: uuid().notNull(),
    name: varchar().notNull(),
    type: integer(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    comment: varchar({ length: 255 }).default('').notNull(),
    description: text().default('').notNull(),
  },
  (table) => [
    uniqueIndex('instrument_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    index('instrument_idx_name').using('btree', table.name.asc().nullsLast().op('text_ops')),
    foreignKey({
      columns: [table.type],
      foreignColumns: [instrumentTypeInMusicbrainz.id],
      name: 'instrument_fk_type',
    }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('instrument_comment_check', sql`CHECK (musicbrainz.controlled_for_whitespace((comment)::text`),
    check('instrument_edits_pending_check', sql`edits_pending >= 0`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
  ],
);

export const instrumentAliasTypeInMusicbrainz = musicbrainz.table(
  'instrument_alias_type',
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('instrument_alias_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'instrument_alias_type_fk_parent',
    }),
  ],
);

export const instrumentAttributeInMusicbrainz = musicbrainz.table(
  'instrument_attribute',
  {
    id: serial().primaryKey().notNull(),
    instrument: integer().notNull(),
    instrumentAttributeType: integer('instrument_attribute_type').notNull(),
    instrumentAttributeTypeAllowedValue: integer('instrument_attribute_type_allowed_value'),
    instrumentAttributeText: text('instrument_attribute_text'),
  },
  (table) => [
    index('instrument_attribute_idx_instrument').using('btree', table.instrument.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.instrument],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'instrument_attribute_fk_instrument',
    }),
    foreignKey({
      columns: [table.instrumentAttributeType],
      foreignColumns: [instrumentAttributeTypeInMusicbrainz.id],
      name: 'instrument_attribute_fk_instrument_attribute_type',
    }),
    foreignKey({
      columns: [table.instrumentAttributeTypeAllowedValue],
      foreignColumns: [instrumentAttributeTypeAllowedValueInMusicbrainz.id],
      name: 'instrument_attribute_fk_instrument_attribute_type_allowed_value',
    }),
    check(
      'instrument_attribute_check',
      sql`((instrument_attribute_type_allowed_value IS NULL) AND (instrument_attribute_text IS NOT NULL)) OR ((instrument_attribute_type_allowed_value IS NOT NULL) AND (instrument_attribute_text IS NULL))`,
    ),
  ],
);

export const instrumentAttributeTypeInMusicbrainz = musicbrainz.table(
  'instrument_attribute_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    comment: varchar({ length: 255 }).default('').notNull(),
    freeText: boolean('free_text').notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('instrument_attribute_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'instrument_attribute_type_fk_parent',
    }),
  ],
);

export const iso31661InMusicbrainz = musicbrainz.table(
  'iso_3166_1',
  {
    area: integer().notNull(),
    code: char({ length: 2 }).primaryKey().notNull(),
  },
  (table) => [
    index('iso_3166_1_idx_area').using('btree', table.area.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.area],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'iso_3166_1_fk_area',
    }),
  ],
);

export const isrcInMusicbrainz = musicbrainz.table(
  'isrc',
  {
    id: serial().primaryKey().notNull(),
    recording: integer().notNull(),
    isrc: char({ length: 12 }).notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('isrc_idx_isrc').using('btree', table.isrc.asc().nullsLast().op('bpchar_ops')),
    uniqueIndex('isrc_idx_isrc_recording').using(
      'btree',
      table.isrc.asc().nullsLast().op('int4_ops'),
      table.recording.asc().nullsLast().op('bpchar_ops'),
    ),
    index('isrc_idx_recording').using('btree', table.recording.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.recording],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'isrc_fk_recording',
    }),
    check('isrc_edits_pending_check', sql`edits_pending >= 0`),
    check('isrc_isrc_check', sql`isrc ~ '^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$'::text`),
  ],
);

export const iswcInMusicbrainz = musicbrainz.table(
  'iswc',
  {
    id: serial().primaryKey().notNull(),
    work: integer().notNull(),
    iswc: char({ length: 15 }),
    editsPending: integer('edits_pending').default(0).notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('iswc_idx_iswc').using(
      'btree',
      table.iswc.asc().nullsLast().op('int4_ops'),
      table.work.asc().nullsLast().op('int4_ops'),
    ),
    index('iswc_idx_work').using('btree', table.work.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.work],
      foreignColumns: [workInMusicbrainz.id],
      name: 'iswc_fk_work',
    }),
    check('iswc_iswc_check', sql`iswc ~ '^T-?\d{3}.?\d{3}.?\d{3}[-.]?\d$'::text`),
  ],
);

export const instrumentAliasInMusicbrainz = musicbrainz.table(
  'instrument_alias',
  {
    id: serial().primaryKey().notNull(),
    instrument: integer().notNull(),
    name: varchar().notNull(),
    locale: text(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    type: integer(),
    sortName: varchar('sort_name').notNull(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    primaryForLocale: boolean('primary_for_locale').default(false).notNull(),
    ended: boolean().default(false).notNull(),
  },
  (table) => [
    index('instrument_alias_idx_instrument').using('btree', table.instrument.asc().nullsLast().op('int4_ops')),
    uniqueIndex('instrument_alias_idx_primary')
      .using('btree', table.instrument.asc().nullsLast().op('int4_ops'), table.locale.asc().nullsLast().op('int4_ops'))
      .where(sql`((primary_for_locale = true) AND (locale IS NOT NULL))`),
    foreignKey({
      columns: [table.instrument],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'instrument_alias_fk_instrument',
    }),
    foreignKey({
      columns: [table.type],
      foreignColumns: [instrumentAliasTypeInMusicbrainz.id],
      name: 'instrument_alias_fk_type',
    }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('control_for_whitespace_sort_name', sql`CHECK (musicbrainz.controlled_for_whitespace((sort_name)::text`),
    check(
      'instrument_alias_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
    check('instrument_alias_edits_pending_check', sql`edits_pending >= 0`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
    check('only_non_empty_sort_name', sql`(sort_name)::text <> ''::text`),
    check('primary_check', sql`((locale IS NULL) AND (primary_for_locale IS FALSE)) OR (locale IS NOT NULL)`),
    check(
      'search_hints_are_empty',
      sql`(type <> 2) OR ((type = 2) AND ((sort_name)::text = (name)::text) AND (begin_date_year IS NULL) AND (begin_date_month IS NULL) AND (begin_date_day IS NULL) AND (end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL) AND (primary_for_locale IS FALSE) AND (locale IS NULL))`,
    ),
  ],
);

export const lAreaEventInMusicbrainz = musicbrainz.table(
  'l_area_event',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_area_event_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_area_event_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_area_event_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'l_area_event_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'l_area_event_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_area_event_edits_pending_check', sql`edits_pending >= 0`),
    check('l_area_event_link_order_check', sql`link_order >= 0`),
  ],
);

export const lAreaGenreInMusicbrainz = musicbrainz.table(
  'l_area_genre',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_area_genre_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_area_genre_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_area_genre_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'l_area_genre_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'l_area_genre_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_area_genre_edits_pending_check', sql`edits_pending >= 0`),
    check('l_area_genre_link_order_check', sql`link_order >= 0`),
  ],
);

export const lAreaInstrumentInMusicbrainz = musicbrainz.table(
  'l_area_instrument',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_area_instrument_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_area_instrument_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_area_instrument_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'l_area_instrument_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'l_area_instrument_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_area_instrument_edits_pending_check', sql`edits_pending >= 0`),
    check('l_area_instrument_link_order_check', sql`link_order >= 0`),
  ],
);

export const lAreaAreaInMusicbrainz = musicbrainz.table(
  'l_area_area',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_area_area_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_area_area_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_area_area_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'l_area_area_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'l_area_area_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_area_area_edits_pending_check', sql`edits_pending >= 0`),
    check('l_area_area_link_order_check', sql`link_order >= 0`),
    check('non_loop_relationship', sql`entity0 <> entity1`),
  ],
);

export const lAreaArtistInMusicbrainz = musicbrainz.table(
  'l_area_artist',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_area_artist_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_area_artist_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_area_artist_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'l_area_artist_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'l_area_artist_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_area_artist_edits_pending_check', sql`edits_pending >= 0`),
    check('l_area_artist_link_order_check', sql`link_order >= 0`),
  ],
);

export const lAreaLabelInMusicbrainz = musicbrainz.table(
  'l_area_label',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_area_label_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_area_label_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_area_label_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'l_area_label_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'l_area_label_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_area_label_edits_pending_check', sql`edits_pending >= 0`),
    check('l_area_label_link_order_check', sql`link_order >= 0`),
  ],
);

export const lAreaMoodInMusicbrainz = musicbrainz.table(
  'l_area_mood',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_area_mood_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_area_mood_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_area_mood_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'l_area_mood_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [moodInMusicbrainz.id],
      name: 'l_area_mood_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_area_mood_edits_pending_check', sql`edits_pending >= 0`),
    check('l_area_mood_link_order_check', sql`link_order >= 0`),
  ],
);

export const lAreaRecordingInMusicbrainz = musicbrainz.table(
  'l_area_recording',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_area_recording_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_area_recording_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_area_recording_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'l_area_recording_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'l_area_recording_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_area_recording_edits_pending_check', sql`edits_pending >= 0`),
    check('l_area_recording_link_order_check', sql`link_order >= 0`),
  ],
);

export const lAreaReleaseInMusicbrainz = musicbrainz.table(
  'l_area_release',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_area_release_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_area_release_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_area_release_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'l_area_release_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'l_area_release_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_area_release_edits_pending_check', sql`edits_pending >= 0`),
    check('l_area_release_link_order_check', sql`link_order >= 0`),
  ],
);

export const lAreaReleaseGroupInMusicbrainz = musicbrainz.table(
  'l_area_release_group',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_area_release_group_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_area_release_group_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_area_release_group_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'l_area_release_group_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'l_area_release_group_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_area_release_group_edits_pending_check', sql`edits_pending >= 0`),
    check('l_area_release_group_link_order_check', sql`link_order >= 0`),
  ],
);

export const lAreaPlaceInMusicbrainz = musicbrainz.table(
  'l_area_place',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_area_place_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_area_place_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_area_place_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'l_area_place_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'l_area_place_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_area_place_edits_pending_check', sql`edits_pending >= 0`),
    check('l_area_place_link_order_check', sql`link_order >= 0`),
  ],
);

export const lAreaSeriesInMusicbrainz = musicbrainz.table(
  'l_area_series',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_area_series_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_area_series_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_area_series_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'l_area_series_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'l_area_series_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_area_series_edits_pending_check', sql`edits_pending >= 0`),
    check('l_area_series_link_order_check', sql`link_order >= 0`),
  ],
);

export const lAreaUrlInMusicbrainz = musicbrainz.table(
  'l_area_url',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_area_url_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_area_url_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_area_url_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'l_area_url_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [urlInMusicbrainz.id],
      name: 'l_area_url_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_area_url_edits_pending_check', sql`edits_pending >= 0`),
    check('l_area_url_link_order_check', sql`link_order >= 0`),
  ],
);

export const lAreaWorkInMusicbrainz = musicbrainz.table(
  'l_area_work',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_area_work_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_area_work_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_area_work_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'l_area_work_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [workInMusicbrainz.id],
      name: 'l_area_work_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_area_work_edits_pending_check', sql`edits_pending >= 0`),
    check('l_area_work_link_order_check', sql`link_order >= 0`),
  ],
);

export const lArtistInstrumentInMusicbrainz = musicbrainz.table(
  'l_artist_instrument',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_artist_instrument_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_artist_instrument_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_artist_instrument_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'l_artist_instrument_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'l_artist_instrument_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_artist_instrument_edits_pending_check', sql`edits_pending >= 0`),
    check('l_artist_instrument_link_order_check', sql`link_order >= 0`),
  ],
);

export const lArtistLabelInMusicbrainz = musicbrainz.table(
  'l_artist_label',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_artist_label_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_artist_label_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_artist_label_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'l_artist_label_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'l_artist_label_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_artist_label_edits_pending_check', sql`edits_pending >= 0`),
    check('l_artist_label_link_order_check', sql`link_order >= 0`),
  ],
);

export const lArtistMoodInMusicbrainz = musicbrainz.table(
  'l_artist_mood',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_artist_mood_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_artist_mood_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_artist_mood_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'l_artist_mood_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [moodInMusicbrainz.id],
      name: 'l_artist_mood_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_artist_mood_edits_pending_check', sql`edits_pending >= 0`),
    check('l_artist_mood_link_order_check', sql`link_order >= 0`),
  ],
);

export const lArtistPlaceInMusicbrainz = musicbrainz.table(
  'l_artist_place',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_artist_place_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_artist_place_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_artist_place_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'l_artist_place_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'l_artist_place_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_artist_place_edits_pending_check', sql`edits_pending >= 0`),
    check('l_artist_place_link_order_check', sql`link_order >= 0`),
  ],
);

export const lArtistEventInMusicbrainz = musicbrainz.table(
  'l_artist_event',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_artist_event_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_artist_event_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_artist_event_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'l_artist_event_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'l_artist_event_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_artist_event_edits_pending_check', sql`edits_pending >= 0`),
    check('l_artist_event_link_order_check', sql`link_order >= 0`),
  ],
);

export const lArtistGenreInMusicbrainz = musicbrainz.table(
  'l_artist_genre',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_artist_genre_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_artist_genre_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_artist_genre_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'l_artist_genre_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'l_artist_genre_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_artist_genre_edits_pending_check', sql`edits_pending >= 0`),
    check('l_artist_genre_link_order_check', sql`link_order >= 0`),
  ],
);

export const lArtistRecordingInMusicbrainz = musicbrainz.table(
  'l_artist_recording',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_artist_recording_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_artist_recording_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_artist_recording_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'l_artist_recording_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'l_artist_recording_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_artist_recording_edits_pending_check', sql`edits_pending >= 0`),
    check('l_artist_recording_link_order_check', sql`link_order >= 0`),
  ],
);

export const lArtistReleaseGroupInMusicbrainz = musicbrainz.table(
  'l_artist_release_group',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_artist_release_group_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_artist_release_group_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_artist_release_group_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'l_artist_release_group_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'l_artist_release_group_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_artist_release_group_edits_pending_check', sql`edits_pending >= 0`),
    check('l_artist_release_group_link_order_check', sql`link_order >= 0`),
  ],
);

export const lArtistSeriesInMusicbrainz = musicbrainz.table(
  'l_artist_series',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_artist_series_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_artist_series_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_artist_series_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'l_artist_series_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'l_artist_series_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_artist_series_edits_pending_check', sql`edits_pending >= 0`),
    check('l_artist_series_link_order_check', sql`link_order >= 0`),
  ],
);

export const lArtistUrlInMusicbrainz = musicbrainz.table(
  'l_artist_url',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_artist_url_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_artist_url_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_artist_url_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'l_artist_url_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [urlInMusicbrainz.id],
      name: 'l_artist_url_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_artist_url_edits_pending_check', sql`edits_pending >= 0`),
    check('l_artist_url_link_order_check', sql`link_order >= 0`),
  ],
);

export const lArtistReleaseInMusicbrainz = musicbrainz.table(
  'l_artist_release',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_artist_release_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_artist_release_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_artist_release_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'l_artist_release_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'l_artist_release_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_artist_release_edits_pending_check', sql`edits_pending >= 0`),
    check('l_artist_release_link_order_check', sql`link_order >= 0`),
  ],
);

export const lArtistWorkInMusicbrainz = musicbrainz.table(
  'l_artist_work',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_artist_work_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_artist_work_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_artist_work_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'l_artist_work_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [workInMusicbrainz.id],
      name: 'l_artist_work_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_artist_work_edits_pending_check', sql`edits_pending >= 0`),
    check('l_artist_work_link_order_check', sql`link_order >= 0`),
  ],
);

export const lEventEventInMusicbrainz = musicbrainz.table(
  'l_event_event',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_event_event_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_event_event_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_event_event_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'l_event_event_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'l_event_event_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_event_event_edits_pending_check', sql`edits_pending >= 0`),
    check('l_event_event_link_order_check', sql`link_order >= 0`),
    check('non_loop_relationship', sql`entity0 <> entity1`),
  ],
);

export const lEventPlaceInMusicbrainz = musicbrainz.table(
  'l_event_place',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_event_place_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_event_place_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_event_place_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'l_event_place_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'l_event_place_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_event_place_edits_pending_check', sql`edits_pending >= 0`),
    check('l_event_place_link_order_check', sql`link_order >= 0`),
  ],
);

export const lEventRecordingInMusicbrainz = musicbrainz.table(
  'l_event_recording',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_event_recording_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_event_recording_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_event_recording_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'l_event_recording_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'l_event_recording_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_event_recording_edits_pending_check', sql`edits_pending >= 0`),
    check('l_event_recording_link_order_check', sql`link_order >= 0`),
  ],
);

export const lEventReleaseInMusicbrainz = musicbrainz.table(
  'l_event_release',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_event_release_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_event_release_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_event_release_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'l_event_release_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'l_event_release_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_event_release_edits_pending_check', sql`edits_pending >= 0`),
    check('l_event_release_link_order_check', sql`link_order >= 0`),
  ],
);

export const lEventReleaseGroupInMusicbrainz = musicbrainz.table(
  'l_event_release_group',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_event_release_group_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_event_release_group_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_event_release_group_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'l_event_release_group_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'l_event_release_group_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_event_release_group_edits_pending_check', sql`edits_pending >= 0`),
    check('l_event_release_group_link_order_check', sql`link_order >= 0`),
  ],
);

export const lEventLabelInMusicbrainz = musicbrainz.table(
  'l_event_label',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_event_label_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_event_label_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_event_label_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'l_event_label_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'l_event_label_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_event_label_edits_pending_check', sql`edits_pending >= 0`),
    check('l_event_label_link_order_check', sql`link_order >= 0`),
  ],
);

export const lEventMoodInMusicbrainz = musicbrainz.table(
  'l_event_mood',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_event_mood_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_event_mood_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_event_mood_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'l_event_mood_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [moodInMusicbrainz.id],
      name: 'l_event_mood_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_event_mood_edits_pending_check', sql`edits_pending >= 0`),
    check('l_event_mood_link_order_check', sql`link_order >= 0`),
  ],
);

export const lEventSeriesInMusicbrainz = musicbrainz.table(
  'l_event_series',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_event_series_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_event_series_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_event_series_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'l_event_series_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'l_event_series_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_event_series_edits_pending_check', sql`edits_pending >= 0`),
    check('l_event_series_link_order_check', sql`link_order >= 0`),
  ],
);

export const lEventWorkInMusicbrainz = musicbrainz.table(
  'l_event_work',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_event_work_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_event_work_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_event_work_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'l_event_work_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [workInMusicbrainz.id],
      name: 'l_event_work_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_event_work_edits_pending_check', sql`edits_pending >= 0`),
    check('l_event_work_link_order_check', sql`link_order >= 0`),
  ],
);

export const lGenreGenreInMusicbrainz = musicbrainz.table(
  'l_genre_genre',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_genre_genre_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_genre_genre_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_genre_genre_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'l_genre_genre_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'l_genre_genre_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_genre_genre_edits_pending_check', sql`edits_pending >= 0`),
    check('l_genre_genre_link_order_check', sql`link_order >= 0`),
    check('non_loop_relationship', sql`entity0 <> entity1`),
  ],
);

export const lGenreInstrumentInMusicbrainz = musicbrainz.table(
  'l_genre_instrument',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_genre_instrument_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_genre_instrument_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_genre_instrument_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'l_genre_instrument_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'l_genre_instrument_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_genre_instrument_edits_pending_check', sql`edits_pending >= 0`),
    check('l_genre_instrument_link_order_check', sql`link_order >= 0`),
  ],
);

export const lEventUrlInMusicbrainz = musicbrainz.table(
  'l_event_url',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_event_url_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_event_url_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_event_url_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'l_event_url_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [urlInMusicbrainz.id],
      name: 'l_event_url_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_event_url_edits_pending_check', sql`edits_pending >= 0`),
    check('l_event_url_link_order_check', sql`link_order >= 0`),
  ],
);

export const lGenreLabelInMusicbrainz = musicbrainz.table(
  'l_genre_label',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_genre_label_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_genre_label_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_genre_label_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'l_genre_label_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'l_genre_label_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_genre_label_edits_pending_check', sql`edits_pending >= 0`),
    check('l_genre_label_link_order_check', sql`link_order >= 0`),
  ],
);

export const lGenreMoodInMusicbrainz = musicbrainz.table(
  'l_genre_mood',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_genre_mood_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_genre_mood_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_genre_mood_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'l_genre_mood_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [moodInMusicbrainz.id],
      name: 'l_genre_mood_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_genre_mood_edits_pending_check', sql`edits_pending >= 0`),
    check('l_genre_mood_link_order_check', sql`link_order >= 0`),
  ],
);

export const lGenreReleaseGroupInMusicbrainz = musicbrainz.table(
  'l_genre_release_group',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_genre_release_group_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_genre_release_group_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_genre_release_group_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'l_genre_release_group_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'l_genre_release_group_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_genre_release_group_edits_pending_check', sql`edits_pending >= 0`),
    check('l_genre_release_group_link_order_check', sql`link_order >= 0`),
  ],
);

export const lGenreSeriesInMusicbrainz = musicbrainz.table(
  'l_genre_series',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_genre_series_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_genre_series_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_genre_series_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'l_genre_series_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'l_genre_series_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_genre_series_edits_pending_check', sql`edits_pending >= 0`),
    check('l_genre_series_link_order_check', sql`link_order >= 0`),
  ],
);

export const lGenreUrlInMusicbrainz = musicbrainz.table(
  'l_genre_url',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_genre_url_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_genre_url_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_genre_url_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'l_genre_url_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [urlInMusicbrainz.id],
      name: 'l_genre_url_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_genre_url_edits_pending_check', sql`edits_pending >= 0`),
    check('l_genre_url_link_order_check', sql`link_order >= 0`),
  ],
);

export const lGenreWorkInMusicbrainz = musicbrainz.table(
  'l_genre_work',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_genre_work_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_genre_work_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_genre_work_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'l_genre_work_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [workInMusicbrainz.id],
      name: 'l_genre_work_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_genre_work_edits_pending_check', sql`edits_pending >= 0`),
    check('l_genre_work_link_order_check', sql`link_order >= 0`),
  ],
);

export const lGenreRecordingInMusicbrainz = musicbrainz.table(
  'l_genre_recording',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_genre_recording_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_genre_recording_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_genre_recording_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'l_genre_recording_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'l_genre_recording_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_genre_recording_edits_pending_check', sql`edits_pending >= 0`),
    check('l_genre_recording_link_order_check', sql`link_order >= 0`),
  ],
);

export const lGenreReleaseInMusicbrainz = musicbrainz.table(
  'l_genre_release',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_genre_release_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_genre_release_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_genre_release_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'l_genre_release_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'l_genre_release_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_genre_release_edits_pending_check', sql`edits_pending >= 0`),
    check('l_genre_release_link_order_check', sql`link_order >= 0`),
  ],
);

export const lInstrumentInstrumentInMusicbrainz = musicbrainz.table(
  'l_instrument_instrument',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_instrument_instrument_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_instrument_instrument_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_instrument_instrument_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'l_instrument_instrument_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'l_instrument_instrument_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_instrument_instrument_edits_pending_check', sql`edits_pending >= 0`),
    check('l_instrument_instrument_link_order_check', sql`link_order >= 0`),
    check('non_loop_relationship', sql`entity0 <> entity1`),
  ],
);

export const lInstrumentMoodInMusicbrainz = musicbrainz.table(
  'l_instrument_mood',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_instrument_mood_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_instrument_mood_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_instrument_mood_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'l_instrument_mood_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [moodInMusicbrainz.id],
      name: 'l_instrument_mood_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_instrument_mood_edits_pending_check', sql`edits_pending >= 0`),
    check('l_instrument_mood_link_order_check', sql`link_order >= 0`),
  ],
);

export const lInstrumentPlaceInMusicbrainz = musicbrainz.table(
  'l_instrument_place',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_instrument_place_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_instrument_place_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_instrument_place_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'l_instrument_place_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'l_instrument_place_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_instrument_place_edits_pending_check', sql`edits_pending >= 0`),
    check('l_instrument_place_link_order_check', sql`link_order >= 0`),
  ],
);

export const lInstrumentRecordingInMusicbrainz = musicbrainz.table(
  'l_instrument_recording',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_instrument_recording_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_instrument_recording_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_instrument_recording_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'l_instrument_recording_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'l_instrument_recording_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_instrument_recording_edits_pending_check', sql`edits_pending >= 0`),
    check('l_instrument_recording_link_order_check', sql`link_order >= 0`),
  ],
);

export const lInstrumentLabelInMusicbrainz = musicbrainz.table(
  'l_instrument_label',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_instrument_label_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_instrument_label_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_instrument_label_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'l_instrument_label_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'l_instrument_label_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_instrument_label_edits_pending_check', sql`edits_pending >= 0`),
    check('l_instrument_label_link_order_check', sql`link_order >= 0`),
  ],
);

export const lInstrumentReleaseInMusicbrainz = musicbrainz.table(
  'l_instrument_release',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_instrument_release_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_instrument_release_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_instrument_release_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'l_instrument_release_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'l_instrument_release_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_instrument_release_edits_pending_check', sql`edits_pending >= 0`),
    check('l_instrument_release_link_order_check', sql`link_order >= 0`),
  ],
);

export const lInstrumentReleaseGroupInMusicbrainz = musicbrainz.table(
  'l_instrument_release_group',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_instrument_release_group_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_instrument_release_group_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_instrument_release_group_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'l_instrument_release_group_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'l_instrument_release_group_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_instrument_release_group_edits_pending_check', sql`edits_pending >= 0`),
    check('l_instrument_release_group_link_order_check', sql`link_order >= 0`),
  ],
);

export const lInstrumentSeriesInMusicbrainz = musicbrainz.table(
  'l_instrument_series',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_instrument_series_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_instrument_series_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_instrument_series_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'l_instrument_series_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'l_instrument_series_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_instrument_series_edits_pending_check', sql`edits_pending >= 0`),
    check('l_instrument_series_link_order_check', sql`link_order >= 0`),
  ],
);

export const lLabelPlaceInMusicbrainz = musicbrainz.table(
  'l_label_place',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_label_place_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_label_place_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_label_place_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'l_label_place_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'l_label_place_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_label_place_edits_pending_check', sql`edits_pending >= 0`),
    check('l_label_place_link_order_check', sql`link_order >= 0`),
  ],
);

export const lLabelRecordingInMusicbrainz = musicbrainz.table(
  'l_label_recording',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_label_recording_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_label_recording_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_label_recording_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'l_label_recording_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'l_label_recording_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_label_recording_edits_pending_check', sql`edits_pending >= 0`),
    check('l_label_recording_link_order_check', sql`link_order >= 0`),
  ],
);

export const lLabelReleaseInMusicbrainz = musicbrainz.table(
  'l_label_release',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_label_release_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_label_release_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_label_release_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'l_label_release_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'l_label_release_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_label_release_edits_pending_check', sql`edits_pending >= 0`),
    check('l_label_release_link_order_check', sql`link_order >= 0`),
  ],
);

export const lLabelReleaseGroupInMusicbrainz = musicbrainz.table(
  'l_label_release_group',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_label_release_group_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_label_release_group_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_label_release_group_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'l_label_release_group_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'l_label_release_group_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_label_release_group_edits_pending_check', sql`edits_pending >= 0`),
    check('l_label_release_group_link_order_check', sql`link_order >= 0`),
  ],
);

export const lInstrumentWorkInMusicbrainz = musicbrainz.table(
  'l_instrument_work',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_instrument_work_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_instrument_work_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_instrument_work_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'l_instrument_work_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [workInMusicbrainz.id],
      name: 'l_instrument_work_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_instrument_work_edits_pending_check', sql`edits_pending >= 0`),
    check('l_instrument_work_link_order_check', sql`link_order >= 0`),
  ],
);

export const lLabelMoodInMusicbrainz = musicbrainz.table(
  'l_label_mood',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_label_mood_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_label_mood_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_label_mood_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'l_label_mood_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [moodInMusicbrainz.id],
      name: 'l_label_mood_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_label_mood_edits_pending_check', sql`edits_pending >= 0`),
    check('l_label_mood_link_order_check', sql`link_order >= 0`),
  ],
);

export const lLabelSeriesInMusicbrainz = musicbrainz.table(
  'l_label_series',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_label_series_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_label_series_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_label_series_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'l_label_series_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'l_label_series_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_label_series_edits_pending_check', sql`edits_pending >= 0`),
    check('l_label_series_link_order_check', sql`link_order >= 0`),
  ],
);

export const lLabelWorkInMusicbrainz = musicbrainz.table(
  'l_label_work',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_label_work_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_label_work_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_label_work_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'l_label_work_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [workInMusicbrainz.id],
      name: 'l_label_work_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_label_work_edits_pending_check', sql`edits_pending >= 0`),
    check('l_label_work_link_order_check', sql`link_order >= 0`),
  ],
);

export const lMoodMoodInMusicbrainz = musicbrainz.table(
  'l_mood_mood',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_mood_mood_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_mood_mood_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_mood_mood_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [moodInMusicbrainz.id],
      name: 'l_mood_mood_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [moodInMusicbrainz.id],
      name: 'l_mood_mood_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_mood_mood_edits_pending_check', sql`edits_pending >= 0`),
    check('l_mood_mood_link_order_check', sql`link_order >= 0`),
    check('non_loop_relationship', sql`entity0 <> entity1`),
  ],
);

export const lMoodPlaceInMusicbrainz = musicbrainz.table(
  'l_mood_place',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_mood_place_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_mood_place_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_mood_place_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [moodInMusicbrainz.id],
      name: 'l_mood_place_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'l_mood_place_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_mood_place_edits_pending_check', sql`edits_pending >= 0`),
    check('l_mood_place_link_order_check', sql`link_order >= 0`),
  ],
);

export const lLabelUrlInMusicbrainz = musicbrainz.table(
  'l_label_url',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_label_url_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_label_url_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_label_url_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'l_label_url_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [urlInMusicbrainz.id],
      name: 'l_label_url_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_label_url_edits_pending_check', sql`edits_pending >= 0`),
    check('l_label_url_link_order_check', sql`link_order >= 0`),
  ],
);

export const lMoodRecordingInMusicbrainz = musicbrainz.table(
  'l_mood_recording',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_mood_recording_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_mood_recording_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_mood_recording_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [moodInMusicbrainz.id],
      name: 'l_mood_recording_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'l_mood_recording_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_mood_recording_edits_pending_check', sql`edits_pending >= 0`),
    check('l_mood_recording_link_order_check', sql`link_order >= 0`),
  ],
);

export const lMoodReleaseInMusicbrainz = musicbrainz.table(
  'l_mood_release',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_mood_release_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_mood_release_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_mood_release_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [moodInMusicbrainz.id],
      name: 'l_mood_release_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'l_mood_release_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_mood_release_edits_pending_check', sql`edits_pending >= 0`),
    check('l_mood_release_link_order_check', sql`link_order >= 0`),
  ],
);

export const lPlacePlaceInMusicbrainz = musicbrainz.table(
  'l_place_place',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_place_place_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_place_place_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_place_place_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'l_place_place_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'l_place_place_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_place_place_edits_pending_check', sql`edits_pending >= 0`),
    check('l_place_place_link_order_check', sql`link_order >= 0`),
    check('non_loop_relationship', sql`entity0 <> entity1`),
  ],
);

export const lPlaceRecordingInMusicbrainz = musicbrainz.table(
  'l_place_recording',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_place_recording_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_place_recording_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_place_recording_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'l_place_recording_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'l_place_recording_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_place_recording_edits_pending_check', sql`edits_pending >= 0`),
    check('l_place_recording_link_order_check', sql`link_order >= 0`),
  ],
);

export const lPlaceReleaseInMusicbrainz = musicbrainz.table(
  'l_place_release',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_place_release_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_place_release_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_place_release_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'l_place_release_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'l_place_release_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_place_release_edits_pending_check', sql`edits_pending >= 0`),
    check('l_place_release_link_order_check', sql`link_order >= 0`),
  ],
);

export const lMoodUrlInMusicbrainz = musicbrainz.table(
  'l_mood_url',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_mood_url_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_mood_url_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_mood_url_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [moodInMusicbrainz.id],
      name: 'l_mood_url_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [urlInMusicbrainz.id],
      name: 'l_mood_url_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_mood_url_edits_pending_check', sql`edits_pending >= 0`),
    check('l_mood_url_link_order_check', sql`link_order >= 0`),
  ],
);

export const lMoodWorkInMusicbrainz = musicbrainz.table(
  'l_mood_work',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_mood_work_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_mood_work_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_mood_work_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [moodInMusicbrainz.id],
      name: 'l_mood_work_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [workInMusicbrainz.id],
      name: 'l_mood_work_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_mood_work_edits_pending_check', sql`edits_pending >= 0`),
    check('l_mood_work_link_order_check', sql`link_order >= 0`),
  ],
);

export const lPlaceReleaseGroupInMusicbrainz = musicbrainz.table(
  'l_place_release_group',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_place_release_group_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_place_release_group_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_place_release_group_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'l_place_release_group_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'l_place_release_group_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_place_release_group_edits_pending_check', sql`edits_pending >= 0`),
    check('l_place_release_group_link_order_check', sql`link_order >= 0`),
  ],
);

export const lPlaceSeriesInMusicbrainz = musicbrainz.table(
  'l_place_series',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_place_series_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_place_series_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_place_series_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'l_place_series_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'l_place_series_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_place_series_edits_pending_check', sql`edits_pending >= 0`),
    check('l_place_series_link_order_check', sql`link_order >= 0`),
  ],
);

export const lPlaceWorkInMusicbrainz = musicbrainz.table(
  'l_place_work',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_place_work_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_place_work_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_place_work_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'l_place_work_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [workInMusicbrainz.id],
      name: 'l_place_work_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_place_work_edits_pending_check', sql`edits_pending >= 0`),
    check('l_place_work_link_order_check', sql`link_order >= 0`),
  ],
);

export const lRecordingRecordingInMusicbrainz = musicbrainz.table(
  'l_recording_recording',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_recording_recording_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_recording_recording_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_recording_recording_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'l_recording_recording_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'l_recording_recording_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_recording_recording_edits_pending_check', sql`edits_pending >= 0`),
    check('l_recording_recording_link_order_check', sql`link_order >= 0`),
    check('non_loop_relationship', sql`entity0 <> entity1`),
  ],
);

export const lRecordingReleaseInMusicbrainz = musicbrainz.table(
  'l_recording_release',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_recording_release_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_recording_release_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_recording_release_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'l_recording_release_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'l_recording_release_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_recording_release_edits_pending_check', sql`edits_pending >= 0`),
    check('l_recording_release_link_order_check', sql`link_order >= 0`),
  ],
);

export const lPlaceUrlInMusicbrainz = musicbrainz.table(
  'l_place_url',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_place_url_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_place_url_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_place_url_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'l_place_url_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [urlInMusicbrainz.id],
      name: 'l_place_url_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_place_url_edits_pending_check', sql`edits_pending >= 0`),
    check('l_place_url_link_order_check', sql`link_order >= 0`),
  ],
);

export const lRecordingReleaseGroupInMusicbrainz = musicbrainz.table(
  'l_recording_release_group',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_recording_release_group_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_recording_release_group_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_recording_release_group_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'l_recording_release_group_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'l_recording_release_group_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_recording_release_group_edits_pending_check', sql`edits_pending >= 0`),
    check('l_recording_release_group_link_order_check', sql`link_order >= 0`),
  ],
);

export const lRecordingSeriesInMusicbrainz = musicbrainz.table(
  'l_recording_series',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_recording_series_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_recording_series_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_recording_series_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'l_recording_series_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'l_recording_series_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_recording_series_edits_pending_check', sql`edits_pending >= 0`),
    check('l_recording_series_link_order_check', sql`link_order >= 0`),
  ],
);

export const lReleaseSeriesInMusicbrainz = musicbrainz.table(
  'l_release_series',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_release_series_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_release_series_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_release_series_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'l_release_series_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'l_release_series_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_release_series_edits_pending_check', sql`edits_pending >= 0`),
    check('l_release_series_link_order_check', sql`link_order >= 0`),
  ],
);

export const lReleaseUrlInMusicbrainz = musicbrainz.table(
  'l_release_url',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_release_url_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_release_url_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_release_url_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'l_release_url_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [urlInMusicbrainz.id],
      name: 'l_release_url_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_release_url_edits_pending_check', sql`edits_pending >= 0`),
    check('l_release_url_link_order_check', sql`link_order >= 0`),
  ],
);

export const lReleaseWorkInMusicbrainz = musicbrainz.table(
  'l_release_work',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_release_work_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_release_work_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_release_work_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'l_release_work_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [workInMusicbrainz.id],
      name: 'l_release_work_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_release_work_edits_pending_check', sql`edits_pending >= 0`),
    check('l_release_work_link_order_check', sql`link_order >= 0`),
  ],
);

export const lReleaseReleaseInMusicbrainz = musicbrainz.table(
  'l_release_release',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_release_release_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_release_release_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_release_release_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'l_release_release_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'l_release_release_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_release_release_edits_pending_check', sql`edits_pending >= 0`),
    check('l_release_release_link_order_check', sql`link_order >= 0`),
    check('non_loop_relationship', sql`entity0 <> entity1`),
  ],
);

export const lReleaseReleaseGroupInMusicbrainz = musicbrainz.table(
  'l_release_release_group',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_release_release_group_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_release_release_group_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_release_release_group_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'l_release_release_group_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'l_release_release_group_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_release_release_group_edits_pending_check', sql`edits_pending >= 0`),
    check('l_release_release_group_link_order_check', sql`link_order >= 0`),
  ],
);

export const lReleaseGroupReleaseGroupInMusicbrainz = musicbrainz.table(
  'l_release_group_release_group',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_release_group_release_group_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_release_group_release_group_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_release_group_release_group_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'l_release_group_release_group_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'l_release_group_release_group_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_release_group_release_group_edits_pending_check', sql`edits_pending >= 0`),
    check('l_release_group_release_group_link_order_check', sql`link_order >= 0`),
    check('non_loop_relationship', sql`entity0 <> entity1`),
  ],
);

export const lReleaseGroupSeriesInMusicbrainz = musicbrainz.table(
  'l_release_group_series',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_release_group_series_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_release_group_series_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_release_group_series_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'l_release_group_series_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'l_release_group_series_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_release_group_series_edits_pending_check', sql`edits_pending >= 0`),
    check('l_release_group_series_link_order_check', sql`link_order >= 0`),
  ],
);

export const lReleaseGroupWorkInMusicbrainz = musicbrainz.table(
  'l_release_group_work',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_release_group_work_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_release_group_work_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_release_group_work_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'l_release_group_work_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [workInMusicbrainz.id],
      name: 'l_release_group_work_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_release_group_work_edits_pending_check', sql`edits_pending >= 0`),
    check('l_release_group_work_link_order_check', sql`link_order >= 0`),
  ],
);

export const lSeriesSeriesInMusicbrainz = musicbrainz.table(
  'l_series_series',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_series_series_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_series_series_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_series_series_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'l_series_series_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'l_series_series_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_series_series_edits_pending_check', sql`edits_pending >= 0`),
    check('l_series_series_link_order_check', sql`link_order >= 0`),
    check('non_loop_relationship', sql`entity0 <> entity1`),
  ],
);

export const lSeriesUrlInMusicbrainz = musicbrainz.table(
  'l_series_url',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_series_url_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_series_url_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_series_url_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'l_series_url_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [urlInMusicbrainz.id],
      name: 'l_series_url_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_series_url_edits_pending_check', sql`edits_pending >= 0`),
    check('l_series_url_link_order_check', sql`link_order >= 0`),
  ],
);

export const lReleaseGroupUrlInMusicbrainz = musicbrainz.table(
  'l_release_group_url',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_release_group_url_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_release_group_url_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_release_group_url_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'l_release_group_url_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [urlInMusicbrainz.id],
      name: 'l_release_group_url_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_release_group_url_edits_pending_check', sql`edits_pending >= 0`),
    check('l_release_group_url_link_order_check', sql`link_order >= 0`),
  ],
);

export const lSeriesWorkInMusicbrainz = musicbrainz.table(
  'l_series_work',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_series_work_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_series_work_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_series_work_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'l_series_work_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [workInMusicbrainz.id],
      name: 'l_series_work_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_series_work_edits_pending_check', sql`edits_pending >= 0`),
    check('l_series_work_link_order_check', sql`link_order >= 0`),
  ],
);

export const lUrlUrlInMusicbrainz = musicbrainz.table(
  'l_url_url',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_url_url_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_url_url_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_url_url_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [urlInMusicbrainz.id],
      name: 'l_url_url_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [urlInMusicbrainz.id],
      name: 'l_url_url_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_url_url_edits_pending_check', sql`edits_pending >= 0`),
    check('l_url_url_link_order_check', sql`link_order >= 0`),
    check('non_loop_relationship', sql`entity0 <> entity1`),
  ],
);

export const labelInMusicbrainz = musicbrainz.table(
  'label',
  {
    id: serial().primaryKey().notNull(),
    gid: uuid().notNull(),
    name: varchar().notNull(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    labelCode: integer('label_code'),
    type: integer(),
    area: integer(),
    comment: varchar({ length: 255 }).default('').notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    ended: boolean().default(false).notNull(),
  },
  (table) => [
    index('label_idx_area').using('btree', table.area.asc().nullsLast().op('int4_ops')),
    uniqueIndex('label_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    index('label_idx_lower_unaccent_name_comment').using(
      'btree',
      sql`lower(musicbrainz.musicbrainz_unaccent((name)::text))`,
      sql`lower(musicbrainz.musicbrainz_unaccent((comment)::text))`,
    ),
    index('label_idx_musicbrainz_collate').using('btree', table.name.asc().nullsLast().op('text_ops')),
    index('label_idx_name').using('btree', table.name.asc().nullsLast().op('text_ops')),
    uniqueIndex('label_idx_null_comment')
      .using('btree', table.name.asc().nullsLast().op('text_ops'))
      .where(sql`(comment IS NULL)`),
    uniqueIndex('label_idx_uniq_name_comment')
      .using('btree', table.name.asc().nullsLast().op('text_ops'), table.comment.asc().nullsLast().op('text_ops'))
      .where(sql`(comment IS NOT NULL)`),
    foreignKey({
      columns: [table.type],
      foreignColumns: [labelTypeInMusicbrainz.id],
      name: 'label_fk_type',
    }),
    foreignKey({
      columns: [table.area],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'label_fk_area',
    }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('label_code_length', sql`(label_code > 0) AND (label_code < 1000000)`),
    check('label_comment_check', sql`CHECK (musicbrainz.controlled_for_whitespace((comment)::text`),
    check('label_edits_pending_check', sql`edits_pending >= 0`),
    check(
      'label_ended_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
    check('only_non_empty', sql`(name)::text <> ''::text`),
  ],
);

export const labelMetaInMusicbrainz = musicbrainz.table(
  'label_meta',
  {
    id: integer().primaryKey().notNull(),
    rating: smallint(),
    ratingCount: integer('rating_count'),
  },
  (table) => [
    foreignKey({
      columns: [table.id],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'label_meta_fk_id',
    }).onDelete('cascade'),
    check('label_meta_rating_check', sql`(rating >= 0) AND (rating <= 100)`),
  ],
);

export const labelAliasTypeInMusicbrainz = musicbrainz.table(
  'label_alias_type',
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('label_alias_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'label_alias_type_fk_parent',
    }),
  ],
);

export const labelAttributeInMusicbrainz = musicbrainz.table(
  'label_attribute',
  {
    id: serial().primaryKey().notNull(),
    label: integer().notNull(),
    labelAttributeType: integer('label_attribute_type').notNull(),
    labelAttributeTypeAllowedValue: integer('label_attribute_type_allowed_value'),
    labelAttributeText: text('label_attribute_text'),
  },
  (table) => [
    index('label_attribute_idx_label').using('btree', table.label.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.label],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'label_attribute_fk_label',
    }),
    foreignKey({
      columns: [table.labelAttributeType],
      foreignColumns: [labelAttributeTypeInMusicbrainz.id],
      name: 'label_attribute_fk_label_attribute_type',
    }),
    foreignKey({
      columns: [table.labelAttributeTypeAllowedValue],
      foreignColumns: [labelAttributeTypeAllowedValueInMusicbrainz.id],
      name: 'label_attribute_fk_label_attribute_type_allowed_value',
    }),
    check(
      'label_attribute_check',
      sql`((label_attribute_type_allowed_value IS NULL) AND (label_attribute_text IS NOT NULL)) OR ((label_attribute_type_allowed_value IS NOT NULL) AND (label_attribute_text IS NULL))`,
    ),
  ],
);

export const labelAttributeTypeInMusicbrainz = musicbrainz.table(
  'label_attribute_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    comment: varchar({ length: 255 }).default('').notNull(),
    freeText: boolean('free_text').notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('label_attribute_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'label_attribute_type_fk_parent',
    }),
  ],
);

export const labelAttributeTypeAllowedValueInMusicbrainz = musicbrainz.table(
  'label_attribute_type_allowed_value',
  {
    id: serial().primaryKey().notNull(),
    labelAttributeType: integer('label_attribute_type').notNull(),
    value: text(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('label_attribute_type_allowed_value_idx_gid').using(
      'btree',
      table.gid.asc().nullsLast().op('uuid_ops'),
    ),
    index('label_attribute_type_allowed_value_idx_name').using(
      'btree',
      table.labelAttributeType.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.labelAttributeType],
      foreignColumns: [labelAttributeTypeInMusicbrainz.id],
      name: 'label_attribute_type_allowed_value_fk_label_attribute_type',
    }),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'label_attribute_type_allowed_value_fk_parent',
    }),
  ],
);

export const labelGidRedirectInMusicbrainz = musicbrainz.table(
  'label_gid_redirect',
  {
    gid: uuid().primaryKey().notNull(),
    newId: integer('new_id').notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('label_gid_redirect_idx_new_id').using('btree', table.newId.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.newId],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'label_gid_redirect_fk_new_id',
    }),
  ],
);

export const labelAliasInMusicbrainz = musicbrainz.table(
  'label_alias',
  {
    id: serial().primaryKey().notNull(),
    label: integer().notNull(),
    name: varchar().notNull(),
    locale: text(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    type: integer(),
    sortName: varchar('sort_name').notNull(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    primaryForLocale: boolean('primary_for_locale').default(false).notNull(),
    ended: boolean().default(false).notNull(),
  },
  (table) => [
    index('label_alias_idx_label').using('btree', table.label.asc().nullsLast().op('int4_ops')),
    index('label_alias_idx_lower_unaccent_name').using(
      'btree',
      sql`lower(musicbrainz.musicbrainz_unaccent((name)::text))`,
    ),
    uniqueIndex('label_alias_idx_primary')
      .using('btree', table.label.asc().nullsLast().op('text_ops'), table.locale.asc().nullsLast().op('int4_ops'))
      .where(sql`((primary_for_locale = true) AND (locale IS NOT NULL))`),
    foreignKey({
      columns: [table.label],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'label_alias_fk_label',
    }),
    foreignKey({
      columns: [table.type],
      foreignColumns: [labelAliasTypeInMusicbrainz.id],
      name: 'label_alias_fk_type',
    }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('control_for_whitespace_sort_name', sql`CHECK (musicbrainz.controlled_for_whitespace((sort_name)::text`),
    check(
      'label_alias_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
    check('label_alias_edits_pending_check', sql`edits_pending >= 0`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
    check('only_non_empty_sort_name', sql`(sort_name)::text <> ''::text`),
    check('primary_check', sql`((locale IS NULL) AND (primary_for_locale IS FALSE)) OR (locale IS NOT NULL)`),
    check(
      'search_hints_are_empty',
      sql`(type <> 2) OR ((type = 2) AND ((sort_name)::text = (name)::text) AND (begin_date_year IS NULL) AND (begin_date_month IS NULL) AND (begin_date_day IS NULL) AND (end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL) AND (primary_for_locale IS FALSE) AND (locale IS NULL))`,
    ),
  ],
);

export const linkCreditableAttributeTypeInMusicbrainz = musicbrainz.table(
  'link_creditable_attribute_type',
  {
    attributeType: integer('attribute_type').primaryKey().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.attributeType],
      foreignColumns: [linkAttributeTypeInMusicbrainz.id],
      name: 'link_creditable_attribute_type_fk_attribute_type',
    }).onDelete('cascade'),
  ],
);

export const labelTypeInMusicbrainz = musicbrainz.table(
  'label_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('label_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'label_type_fk_parent',
    }),
  ],
);

export const linkTextAttributeTypeInMusicbrainz = musicbrainz.table(
  'link_text_attribute_type',
  {
    attributeType: integer('attribute_type').primaryKey().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.attributeType],
      foreignColumns: [linkAttributeTypeInMusicbrainz.id],
      name: 'link_text_attribute_type_fk_attribute_type',
    }).onDelete('cascade'),
  ],
);

export const linkTypeInMusicbrainz = musicbrainz.table(
  'link_type',
  {
    id: serial().primaryKey().notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    gid: uuid().notNull(),
    entityType0: varchar('entity_type0', { length: 50 }).notNull(),
    entityType1: varchar('entity_type1', { length: 50 }).notNull(),
    name: varchar({ length: 255 }).notNull(),
    description: text(),
    linkPhrase: varchar('link_phrase', { length: 255 }).notNull(),
    reverseLinkPhrase: varchar('reverse_link_phrase', { length: 255 }).notNull(),
    longLinkPhrase: varchar('long_link_phrase', { length: 255 }).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    isDeprecated: boolean('is_deprecated').default(false).notNull(),
    hasDates: boolean('has_dates').default(true).notNull(),
    entity0Cardinality: smallint('entity0_cardinality').default(0).notNull(),
    entity1Cardinality: smallint('entity1_cardinality').default(0).notNull(),
  },
  (table) => [
    uniqueIndex('link_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'link_type_fk_parent',
    }),
  ],
);

export const languageInMusicbrainz = musicbrainz.table(
  'language',
  {
    id: serial().primaryKey().notNull(),
    isoCode2T: char('iso_code_2t', { length: 3 }),
    isoCode2B: char('iso_code_2b', { length: 3 }),
    isoCode1: char('iso_code_1', { length: 2 }),
    name: varchar({ length: 100 }).notNull(),
    frequency: smallint().default(0).notNull(),
    isoCode3: char('iso_code_3', { length: 3 }),
  },
  (table) => [
    uniqueIndex('language_idx_iso_code_1').using('btree', table.isoCode1.asc().nullsLast().op('bpchar_ops')),
    uniqueIndex('language_idx_iso_code_2b').using('btree', table.isoCode2B.asc().nullsLast().op('bpchar_ops')),
    uniqueIndex('language_idx_iso_code_2t').using('btree', table.isoCode2T.asc().nullsLast().op('bpchar_ops')),
    uniqueIndex('language_idx_iso_code_3').using('btree', table.isoCode3.asc().nullsLast().op('bpchar_ops')),
    check('iso_code_check', sql`(iso_code_2t IS NOT NULL) OR (iso_code_3 IS NOT NULL)`),
  ],
);

export const editorCollectionInMusicbrainz = musicbrainz.table(
  'editor_collection',
  {
    id: serial().primaryKey().notNull(),
    gid: uuid().notNull(),
    editor: integer().notNull(),
    name: varchar().notNull(),
    public: boolean().default(false).notNull(),
    description: text().default('').notNull(),
    type: integer().notNull(),
  },
  (table) => [
    index('editor_collection_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    uniqueIndex('editor_collection_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'editor_collection_fk_editor',
    }),
    foreignKey({
      columns: [table.type],
      foreignColumns: [editorCollectionTypeInMusicbrainz.id],
      name: 'editor_collection_fk_type',
    }),
  ],
);

export const editorCollectionGidRedirectInMusicbrainz = musicbrainz.table(
  'editor_collection_gid_redirect',
  {
    gid: uuid().primaryKey().notNull(),
    newId: integer('new_id').notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('editor_collection_gid_redirect_idx_new_id').using('btree', table.newId.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.newId],
      foreignColumns: [editorCollectionInMusicbrainz.id],
      name: 'editor_collection_gid_redirect_fk_new_id',
    }),
  ],
);

export const linkInMusicbrainz = musicbrainz.table(
  'link',
  {
    id: serial().primaryKey().notNull(),
    linkType: integer('link_type').notNull(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    attributeCount: integer('attribute_count').default(0).notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
    ended: boolean().default(false).notNull(),
  },
  (table) => [
    index('link_idx_type_attr').using(
      'btree',
      table.linkType.asc().nullsLast().op('int4_ops'),
      table.attributeCount.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.linkType],
      foreignColumns: [linkTypeInMusicbrainz.id],
      name: 'link_fk_link_type',
    }),
    check(
      'link_ended_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
  ],
);

export const linkAttributeTypeInMusicbrainz = musicbrainz.table(
  'link_attribute_type',
  {
    id: serial().primaryKey().notNull(),
    parent: integer(),
    root: integer().notNull(),
    childOrder: integer('child_order').default(0).notNull(),
    gid: uuid().notNull(),
    name: varchar({ length: 255 }).notNull(),
    description: text(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    uniqueIndex('link_attribute_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'link_attribute_type_fk_parent',
    }),
    foreignKey({
      columns: [table.root],
      foreignColumns: [table.id],
      name: 'link_attribute_type_fk_root',
    }),
  ],
);

export const editorCollectionTypeInMusicbrainz = musicbrainz.table(
  'editor_collection_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('editor_collection_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'editor_collection_type_fk_parent',
    }),
    check(
      'allowed_collection_entity_type',
      sql`(entity_type)::text = ANY ((ARRAY['area'::character varying, 'artist'::character varying, 'event'::character varying, 'genre'::character varying, 'instrument'::character varying, 'label'::character varying, 'place'::character varying, 'recording'::character varying, 'release'::character varying, 'release_group'::character varying, 'series'::character varying, 'work'::character varying])::text[])`,
    ),
  ],
);

export const mediumInMusicbrainz = musicbrainz.table(
  'medium',
  {
    id: serial().primaryKey().notNull(),
    release: integer().notNull(),
    position: integer().notNull(),
    format: integer(),
    name: varchar().default('').notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    trackCount: integer('track_count').default(0).notNull(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('medium_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    index('medium_idx_track_count').using('btree', table.trackCount.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.release],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'medium_fk_release',
    }),
    foreignKey({
      columns: [table.format],
      foreignColumns: [mediumFormatInMusicbrainz.id],
      name: 'medium_fk_format',
    }),
    unique('medium_uniq').on(table.position, table.release),
    check('medium_edits_pending_check', sql`edits_pending >= 0`),
    check('medium_name_check', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
  ],
);

export const editorOauthTokenInMusicbrainz = musicbrainz.table(
  'editor_oauth_token',
  {
    id: serial().primaryKey().notNull(),
    editor: integer().notNull(),
    application: integer().notNull(),
    authorizationCode: text('authorization_code'),
    refreshToken: text('refresh_token'),
    accessToken: text('access_token'),
    expireTime: timestamp('expire_time', { withTimezone: true, mode: 'string' }).notNull(),
    scope: integer().default(0).notNull(),
    granted: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    codeChallenge: text('code_challenge'),
    codeChallengeMethod: oauthCodeChallengeMethodInMusicbrainz('code_challenge_method'),
  },
  (table) => [
    uniqueIndex('editor_oauth_token_idx_access_token').using(
      'btree',
      table.accessToken.asc().nullsLast().op('text_ops'),
    ),
    index('editor_oauth_token_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    uniqueIndex('editor_oauth_token_idx_refresh_token').using(
      'btree',
      table.refreshToken.asc().nullsLast().op('text_ops'),
    ),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'editor_oauth_token_fk_editor',
    }),
    foreignKey({
      columns: [table.application],
      foreignColumns: [applicationInMusicbrainz.id],
      name: 'editor_oauth_token_fk_application',
    }),
    check(
      'valid_code_challenge',
      sql`((code_challenge IS NULL) = (code_challenge_method IS NULL)) AND ((code_challenge IS NULL) OR (code_challenge ~ '^[A-Za-z0-9.~_-]{43,128}$'::text))`,
    ),
  ],
);

export const mediumAttributeTypeInMusicbrainz = musicbrainz.table(
  'medium_attribute_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    comment: varchar({ length: 255 }).default('').notNull(),
    freeText: boolean('free_text').notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('medium_attribute_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'medium_attribute_type_fk_parent',
    }),
  ],
);

export const mediumAttributeTypeAllowedValueInMusicbrainz = musicbrainz.table(
  'medium_attribute_type_allowed_value',
  {
    id: serial().primaryKey().notNull(),
    mediumAttributeType: integer('medium_attribute_type').notNull(),
    value: text(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('medium_attribute_type_allowed_value_idx_gid').using(
      'btree',
      table.gid.asc().nullsLast().op('uuid_ops'),
    ),
    index('medium_attribute_type_allowed_value_idx_name').using(
      'btree',
      table.mediumAttributeType.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.mediumAttributeType],
      foreignColumns: [mediumAttributeTypeInMusicbrainz.id],
      name: 'medium_attribute_type_allowed_value_fk_medium_attribute_type',
    }),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'medium_attribute_type_allowed_value_fk_parent',
    }),
  ],
);

export const orderableLinkTypeInMusicbrainz = musicbrainz.table(
  'orderable_link_type',
  {
    linkType: integer('link_type').primaryKey().notNull(),
    direction: smallint().default(1).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.linkType],
      foreignColumns: [linkTypeInMusicbrainz.id],
      name: 'orderable_link_type_fk_link_type',
    }),
    check('orderable_link_type_direction_check', sql`(direction = 1) OR (direction = 2)`),
  ],
);

export const moodInMusicbrainz = musicbrainz.table(
  'mood',
  {
    id: serial().primaryKey().notNull(),
    gid: uuid().notNull(),
    name: varchar().notNull(),
    comment: varchar({ length: 255 }).default('').notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    uniqueIndex('mood_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    uniqueIndex('mood_idx_name').using('btree', sql`lower((name)::text)`),
    check('mood_edits_pending_check', sql`edits_pending >= 0`),
  ],
);

export const placeInMusicbrainz = musicbrainz.table(
  'place',
  {
    id: serial().primaryKey().notNull(),
    gid: uuid().notNull(),
    name: varchar().notNull(),
    type: integer(),
    address: varchar().default('').notNull(),
    area: integer(),
    comment: varchar({ length: 255 }).default('').notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    ended: boolean().default(false).notNull(),
  },
  (table) => [
    index('place_idx_area').using('btree', table.area.asc().nullsLast().op('int4_ops')),
    index('place_idx_geo')
      .using('gist', sql`musicbrainz.ll_to_earth(coordinates[0], coordinates[1])`)
      .where(sql`(coordinates IS NOT NULL)`),
    uniqueIndex('place_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    index('place_idx_lower_unaccent_name_comment').using(
      'btree',
      sql`lower(musicbrainz.musicbrainz_unaccent((name)::text))`,
      sql`lower(musicbrainz.musicbrainz_unaccent((comment)::text))`,
    ),
    index('place_idx_name').using('btree', table.name.asc().nullsLast().op('text_ops')),
    foreignKey({
      columns: [table.type],
      foreignColumns: [placeTypeInMusicbrainz.id],
      name: 'place_fk_type',
    }),
    foreignKey({
      columns: [table.area],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'place_fk_area',
    }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
    check(
      'place_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
    check('place_comment_check', sql`CHECK (musicbrainz.controlled_for_whitespace((comment)::text`),
    check('place_edits_pending_check', sql`edits_pending >= 0`),
  ],
);

export const placeAliasInMusicbrainz = musicbrainz.table(
  'place_alias',
  {
    id: serial().primaryKey().notNull(),
    place: integer().notNull(),
    name: varchar().notNull(),
    locale: text(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    type: integer(),
    sortName: varchar('sort_name').notNull(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    primaryForLocale: boolean('primary_for_locale').default(false).notNull(),
    ended: boolean().default(false).notNull(),
  },
  (table) => [
    index('place_alias_idx_lower_unaccent_name').using(
      'btree',
      sql`lower(musicbrainz.musicbrainz_unaccent((name)::text))`,
    ),
    index('place_alias_idx_place').using('btree', table.place.asc().nullsLast().op('int4_ops')),
    uniqueIndex('place_alias_idx_primary')
      .using('btree', table.place.asc().nullsLast().op('text_ops'), table.locale.asc().nullsLast().op('int4_ops'))
      .where(sql`((primary_for_locale = true) AND (locale IS NOT NULL))`),
    foreignKey({
      columns: [table.place],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'place_alias_fk_place',
    }),
    foreignKey({
      columns: [table.type],
      foreignColumns: [placeAliasTypeInMusicbrainz.id],
      name: 'place_alias_fk_type',
    }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('control_for_whitespace_sort_name', sql`CHECK (musicbrainz.controlled_for_whitespace((sort_name)::text`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
    check('only_non_empty_sort_name', sql`(sort_name)::text <> ''::text`),
    check(
      'place_alias_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
    check('place_alias_edits_pending_check', sql`edits_pending >= 0`),
    check('primary_check', sql`((locale IS NULL) AND (primary_for_locale IS FALSE)) OR (locale IS NOT NULL)`),
    check(
      'search_hints_are_empty',
      sql`(type <> 2) OR ((type = 2) AND ((sort_name)::text = (name)::text) AND (begin_date_year IS NULL) AND (begin_date_month IS NULL) AND (begin_date_day IS NULL) AND (end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL) AND (primary_for_locale IS FALSE) AND (locale IS NULL))`,
    ),
  ],
);

export const mediumFormatInMusicbrainz = musicbrainz.table(
  'medium_format',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 100 }).notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    year: smallint(),
    hasDiscids: boolean('has_discids').default(false).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('medium_format_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'medium_format_fk_parent',
    }),
  ],
);

export const mediumAttributeInMusicbrainz = musicbrainz.table(
  'medium_attribute',
  {
    id: serial().primaryKey().notNull(),
    medium: integer().notNull(),
    mediumAttributeType: integer('medium_attribute_type').notNull(),
    mediumAttributeTypeAllowedValue: integer('medium_attribute_type_allowed_value'),
    mediumAttributeText: text('medium_attribute_text'),
  },
  (table) => [
    index('medium_attribute_idx_medium').using('btree', table.medium.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.medium],
      foreignColumns: [mediumInMusicbrainz.id],
      name: 'medium_attribute_fk_medium',
    }),
    foreignKey({
      columns: [table.mediumAttributeType],
      foreignColumns: [mediumAttributeTypeInMusicbrainz.id],
      name: 'medium_attribute_fk_medium_attribute_type',
    }),
    foreignKey({
      columns: [table.mediumAttributeTypeAllowedValue],
      foreignColumns: [mediumAttributeTypeAllowedValueInMusicbrainz.id],
      name: 'medium_attribute_fk_medium_attribute_type_allowed_value',
    }),
    check(
      'medium_attribute_check',
      sql`((medium_attribute_type_allowed_value IS NULL) AND (medium_attribute_text IS NOT NULL)) OR ((medium_attribute_type_allowed_value IS NOT NULL) AND (medium_attribute_text IS NULL))`,
    ),
  ],
);

export const mediumCdtocInMusicbrainz = musicbrainz.table(
  'medium_cdtoc',
  {
    id: serial().primaryKey().notNull(),
    medium: integer().notNull(),
    cdtoc: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('medium_cdtoc_idx_cdtoc').using('btree', table.cdtoc.asc().nullsLast().op('int4_ops')),
    index('medium_cdtoc_idx_medium').using('btree', table.medium.asc().nullsLast().op('int4_ops')),
    uniqueIndex('medium_cdtoc_idx_uniq').using(
      'btree',
      table.medium.asc().nullsLast().op('int4_ops'),
      table.cdtoc.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.medium],
      foreignColumns: [mediumInMusicbrainz.id],
      name: 'medium_cdtoc_fk_medium',
    }),
    foreignKey({
      columns: [table.cdtoc],
      foreignColumns: [cdtocInMusicbrainz.id],
      name: 'medium_cdtoc_fk_cdtoc',
    }),
    check('medium_cdtoc_edits_pending_check', sql`edits_pending >= 0`),
  ],
);

export const mediumGidRedirectInMusicbrainz = musicbrainz.table(
  'medium_gid_redirect',
  {
    gid: uuid().primaryKey().notNull(),
    newId: integer('new_id').notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('medium_gid_redirect_idx_new_id').using('btree', table.newId.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.newId],
      foreignColumns: [mediumInMusicbrainz.id],
      name: 'medium_gid_redirect_fk_new_id',
    }),
  ],
);

export const moodAliasInMusicbrainz = musicbrainz.table(
  'mood_alias',
  {
    id: serial().primaryKey().notNull(),
    mood: integer().notNull(),
    name: varchar().notNull(),
    locale: text(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    type: integer(),
    sortName: varchar('sort_name').notNull(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    primaryForLocale: boolean('primary_for_locale').default(false).notNull(),
    ended: boolean().default(false).notNull(),
  },
  (table) => [
    index('mood_alias_idx_mood').using('btree', table.mood.asc().nullsLast().op('int4_ops')),
    uniqueIndex('mood_alias_idx_primary')
      .using('btree', table.mood.asc().nullsLast().op('int4_ops'), table.locale.asc().nullsLast().op('int4_ops'))
      .where(sql`((primary_for_locale = true) AND (locale IS NOT NULL))`),
    foreignKey({
      columns: [table.mood],
      foreignColumns: [moodInMusicbrainz.id],
      name: 'mood_alias_fk_mood',
    }),
    foreignKey({
      columns: [table.type],
      foreignColumns: [moodAliasTypeInMusicbrainz.id],
      name: 'mood_alias_fk_type',
    }),
    check(
      'mood_alias_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
    check('mood_alias_edits_pending_check', sql`edits_pending >= 0`),
    check('primary_check', sql`((locale IS NULL) AND (primary_for_locale IS FALSE)) OR (locale IS NOT NULL)`),
    check(
      'search_hints_are_empty',
      sql`(type <> 2) OR ((type = 2) AND ((sort_name)::text = (name)::text) AND (begin_date_year IS NULL) AND (begin_date_month IS NULL) AND (begin_date_day IS NULL) AND (end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL) AND (primary_for_locale IS FALSE) AND (locale IS NULL))`,
    ),
  ],
);

export const moodAliasTypeInMusicbrainz = musicbrainz.table(
  'mood_alias_type',
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('mood_alias_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'mood_alias_type_fk_parent',
    }),
  ],
);

export const placeGidRedirectInMusicbrainz = musicbrainz.table(
  'place_gid_redirect',
  {
    gid: uuid().primaryKey().notNull(),
    newId: integer('new_id').notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('place_gid_redirect_idx_new_id').using('btree', table.newId.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.newId],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'place_gid_redirect_fk_new_id',
    }),
  ],
);

export const placeMetaInMusicbrainz = musicbrainz.table(
  'place_meta',
  {
    id: integer().primaryKey().notNull(),
    rating: smallint(),
    ratingCount: integer('rating_count'),
  },
  (table) => [
    foreignKey({
      columns: [table.id],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'place_meta_fk_id',
    }).onDelete('cascade'),
    check('place_meta_rating_check', sql`(rating >= 0) AND (rating <= 100)`),
  ],
);

export const recordingInMusicbrainz = musicbrainz.table(
  'recording',
  {
    id: serial().primaryKey().notNull(),
    gid: uuid().notNull(),
    name: varchar().notNull(),
    artistCredit: integer('artist_credit').notNull(),
    length: integer(),
    comment: varchar({ length: 255 }).default('').notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    video: boolean().default(false).notNull(),
  },
  (table) => [
    index('recording_idx_artist_credit').using('btree', table.artistCredit.asc().nullsLast().op('int4_ops')),
    uniqueIndex('recording_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    index('recording_idx_musicbrainz_collate').using('btree', table.name.asc().nullsLast().op('text_ops')),
    index('recording_idx_name').using('btree', table.name.asc().nullsLast().op('text_ops')),
    foreignKey({
      columns: [table.artistCredit],
      foreignColumns: [artistCreditInMusicbrainz.id],
      name: 'recording_fk_artist_credit',
    }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
    check('recording_comment_check', sql`CHECK (musicbrainz.controlled_for_whitespace((comment)::text`),
    check('recording_edits_pending_check', sql`edits_pending >= 0`),
    check('recording_length_check', sql`(length IS NULL) OR (length > 0)`),
  ],
);

export const replicationControlInMusicbrainz = musicbrainz.table('replication_control', {
  id: serial().primaryKey().notNull(),
  currentSchemaSequence: integer('current_schema_sequence').notNull(),
  currentReplicationSequence: integer('current_replication_sequence'),
  lastReplicationDate: timestamp('last_replication_date', { withTimezone: true, mode: 'string' }),
});

export const placeTypeInMusicbrainz = musicbrainz.table(
  'place_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('place_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'place_type_fk_parent',
    }),
  ],
);

export const placeAliasTypeInMusicbrainz = musicbrainz.table(
  'place_alias_type',
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('place_alias_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'place_alias_type_fk_parent',
    }),
  ],
);

export const placeAttributeInMusicbrainz = musicbrainz.table(
  'place_attribute',
  {
    id: serial().primaryKey().notNull(),
    place: integer().notNull(),
    placeAttributeType: integer('place_attribute_type').notNull(),
    placeAttributeTypeAllowedValue: integer('place_attribute_type_allowed_value'),
    placeAttributeText: text('place_attribute_text'),
  },
  (table) => [
    index('place_attribute_idx_place').using('btree', table.place.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.place],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'place_attribute_fk_place',
    }),
    foreignKey({
      columns: [table.placeAttributeType],
      foreignColumns: [placeAttributeTypeInMusicbrainz.id],
      name: 'place_attribute_fk_place_attribute_type',
    }),
    foreignKey({
      columns: [table.placeAttributeTypeAllowedValue],
      foreignColumns: [placeAttributeTypeAllowedValueInMusicbrainz.id],
      name: 'place_attribute_fk_place_attribute_type_allowed_value',
    }),
    check(
      'place_attribute_check',
      sql`((place_attribute_type_allowed_value IS NULL) AND (place_attribute_text IS NOT NULL)) OR ((place_attribute_type_allowed_value IS NOT NULL) AND (place_attribute_text IS NULL))`,
    ),
  ],
);

export const placeAttributeTypeInMusicbrainz = musicbrainz.table(
  'place_attribute_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    comment: varchar({ length: 255 }).default('').notNull(),
    freeText: boolean('free_text').notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('place_attribute_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'place_attribute_type_fk_parent',
    }),
  ],
);

export const placeAttributeTypeAllowedValueInMusicbrainz = musicbrainz.table(
  'place_attribute_type_allowed_value',
  {
    id: serial().primaryKey().notNull(),
    placeAttributeType: integer('place_attribute_type').notNull(),
    value: text(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('place_attribute_type_allowed_value_idx_gid').using(
      'btree',
      table.gid.asc().nullsLast().op('uuid_ops'),
    ),
    index('place_attribute_type_allowed_value_idx_name').using(
      'btree',
      table.placeAttributeType.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.placeAttributeType],
      foreignColumns: [placeAttributeTypeInMusicbrainz.id],
      name: 'place_attribute_type_allowed_value_fk_place_attribute_type',
    }),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'place_attribute_type_allowed_value_fk_parent',
    }),
  ],
);

export const recordingMetaInMusicbrainz = musicbrainz.table(
  'recording_meta',
  {
    id: integer().primaryKey().notNull(),
    rating: smallint(),
    ratingCount: integer('rating_count'),
  },
  (table) => [
    foreignKey({
      columns: [table.id],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'recording_meta_fk_id',
    }).onDelete('cascade'),
    check('recording_meta_rating_check', sql`(rating >= 0) AND (rating <= 100)`),
  ],
);

export const releaseInMusicbrainz = musicbrainz.table(
  'release',
  {
    id: serial().primaryKey().notNull(),
    gid: uuid().notNull(),
    name: varchar().notNull(),
    artistCredit: integer('artist_credit').notNull(),
    releaseGroup: integer('release_group').notNull(),
    status: integer(),
    packaging: integer(),
    language: integer(),
    script: integer(),
    barcode: varchar({ length: 255 }),
    comment: varchar({ length: 255 }).default('').notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    quality: smallint().default(sql`'-1'`).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('release_idx_artist_credit').using('btree', table.artistCredit.asc().nullsLast().op('int4_ops')),
    uniqueIndex('release_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    index('release_idx_musicbrainz_collate').using('btree', table.name.asc().nullsLast().op('text_ops')),
    index('release_idx_name').using('btree', table.name.asc().nullsLast().op('text_ops')),
    index('release_idx_release_group').using('btree', table.releaseGroup.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.artistCredit],
      foreignColumns: [artistCreditInMusicbrainz.id],
      name: 'release_fk_artist_credit',
    }),
    foreignKey({
      columns: [table.releaseGroup],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'release_fk_release_group',
    }),
    foreignKey({
      columns: [table.status],
      foreignColumns: [releaseStatusInMusicbrainz.id],
      name: 'release_fk_status',
    }),
    foreignKey({
      columns: [table.packaging],
      foreignColumns: [releasePackagingInMusicbrainz.id],
      name: 'release_fk_packaging',
    }),
    foreignKey({
      columns: [table.language],
      foreignColumns: [languageInMusicbrainz.id],
      name: 'release_fk_language',
    }),
    foreignKey({
      columns: [table.script],
      foreignColumns: [scriptInMusicbrainz.id],
      name: 'release_fk_script',
    }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
    check('release_comment_check', sql`CHECK (musicbrainz.controlled_for_whitespace((comment)::text`),
    check('release_edits_pending_check', sql`edits_pending >= 0`),
  ],
);

export const recordingAliasTypeInMusicbrainz = musicbrainz.table(
  'recording_alias_type',
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('recording_alias_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'recording_alias_type_fk_parent',
    }),
  ],
);

export const releaseAliasTypeInMusicbrainz = musicbrainz.table(
  'release_alias_type',
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'release_alias_type_fk_parent',
    }),
  ],
);

export const recordingAttributeInMusicbrainz = musicbrainz.table(
  'recording_attribute',
  {
    id: serial().primaryKey().notNull(),
    recording: integer().notNull(),
    recordingAttributeType: integer('recording_attribute_type').notNull(),
    recordingAttributeTypeAllowedValue: integer('recording_attribute_type_allowed_value'),
    recordingAttributeText: text('recording_attribute_text'),
  },
  (table) => [
    index('recording_attribute_idx_recording').using('btree', table.recording.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.recording],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'recording_attribute_fk_recording',
    }),
    foreignKey({
      columns: [table.recordingAttributeType],
      foreignColumns: [recordingAttributeTypeInMusicbrainz.id],
      name: 'recording_attribute_fk_recording_attribute_type',
    }),
    foreignKey({
      columns: [table.recordingAttributeTypeAllowedValue],
      foreignColumns: [recordingAttributeTypeAllowedValueInMusicbrainz.id],
      name: 'recording_attribute_fk_recording_attribute_type_allowed_value',
    }),
    check(
      'recording_attribute_check',
      sql`((recording_attribute_type_allowed_value IS NULL) AND (recording_attribute_text IS NOT NULL)) OR ((recording_attribute_type_allowed_value IS NOT NULL) AND (recording_attribute_text IS NULL))`,
    ),
  ],
);

export const recordingAttributeTypeInMusicbrainz = musicbrainz.table(
  'recording_attribute_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    comment: varchar({ length: 255 }).default('').notNull(),
    freeText: boolean('free_text').notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('recording_attribute_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'recording_attribute_type_fk_parent',
    }),
  ],
);

export const recordingAttributeTypeAllowedValueInMusicbrainz = musicbrainz.table(
  'recording_attribute_type_allowed_value',
  {
    id: serial().primaryKey().notNull(),
    recordingAttributeType: integer('recording_attribute_type').notNull(),
    value: text(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('recording_attribute_type_allowed_value_idx_gid').using(
      'btree',
      table.gid.asc().nullsLast().op('uuid_ops'),
    ),
    index('recording_attribute_type_allowed_value_idx_name').using(
      'btree',
      table.recordingAttributeType.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.recordingAttributeType],
      foreignColumns: [recordingAttributeTypeInMusicbrainz.id],
      name: 'recording_attribute_type_allowed_value_fk_recording_attribute_t',
    }),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'recording_attribute_type_allowed_value_fk_parent',
    }),
  ],
);

export const recordingGidRedirectInMusicbrainz = musicbrainz.table(
  'recording_gid_redirect',
  {
    gid: uuid().primaryKey().notNull(),
    newId: integer('new_id').notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('recording_gid_redirect_idx_new_id').using('btree', table.newId.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.newId],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'recording_gid_redirect_fk_new_id',
    }),
  ],
);

export const recordingAliasInMusicbrainz = musicbrainz.table(
  'recording_alias',
  {
    id: serial().primaryKey().notNull(),
    recording: integer().notNull(),
    name: varchar().notNull(),
    locale: text(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    type: integer(),
    sortName: varchar('sort_name').notNull(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    primaryForLocale: boolean('primary_for_locale').default(false).notNull(),
    ended: boolean().default(false).notNull(),
  },
  (table) => [
    uniqueIndex('recording_alias_idx_primary')
      .using('btree', table.recording.asc().nullsLast().op('int4_ops'), table.locale.asc().nullsLast().op('int4_ops'))
      .where(sql`((primary_for_locale = true) AND (locale IS NOT NULL))`),
    index('recording_alias_idx_recording').using('btree', table.recording.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.recording],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'recording_alias_fk_recording',
    }),
    foreignKey({
      columns: [table.type],
      foreignColumns: [recordingAliasTypeInMusicbrainz.id],
      name: 'recording_alias_fk_type',
    }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('control_for_whitespace_sort_name', sql`CHECK (musicbrainz.controlled_for_whitespace((sort_name)::text`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
    check('only_non_empty_sort_name', sql`(sort_name)::text <> ''::text`),
    check('primary_check', sql`((locale IS NULL) AND (primary_for_locale IS FALSE)) OR (locale IS NOT NULL)`),
    check(
      'recording_alias_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
    check('recording_alias_edits_pending_check', sql`edits_pending >= 0`),
  ],
);

export const releaseAttributeTypeAllowedValueInMusicbrainz = musicbrainz.table(
  'release_attribute_type_allowed_value',
  {
    id: serial().primaryKey().notNull(),
    releaseAttributeType: integer('release_attribute_type').notNull(),
    value: text(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('release_attribute_type_allowed_value_idx_gid').using(
      'btree',
      table.gid.asc().nullsLast().op('uuid_ops'),
    ),
    index('release_attribute_type_allowed_value_idx_name').using(
      'btree',
      table.releaseAttributeType.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.releaseAttributeType],
      foreignColumns: [releaseAttributeTypeInMusicbrainz.id],
      name: 'release_attribute_type_allowed_value_fk_release_attribute_type',
    }),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'release_attribute_type_allowed_value_fk_parent',
    }),
  ],
);

export const releaseMetaInMusicbrainz = musicbrainz.table(
  'release_meta',
  {
    id: integer().primaryKey().notNull(),
    dateAdded: timestamp('date_added', { withTimezone: true, mode: 'string' }).defaultNow(),
    infoUrl: varchar('info_url', { length: 255 }),
    amazonAsin: varchar('amazon_asin', { length: 10 }),
    coverArtPresence: coverArtPresenceInMusicbrainz('cover_art_presence').default('absent').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.id],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'release_meta_fk_id',
    }).onDelete('cascade'),
  ],
);

export const releaseRawInMusicbrainz = musicbrainz.table('release_raw', {
  id: serial().primaryKey().notNull(),
  title: varchar({ length: 255 }).notNull(),
  artist: varchar({ length: 255 }),
  added: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  lastModified: timestamp('last_modified', { withTimezone: true, mode: 'string' }).defaultNow(),
  lookupCount: integer('lookup_count').default(0),
  modifyCount: integer('modify_count').default(0),
  source: integer().default(0),
  barcode: varchar({ length: 255 }),
  comment: varchar({ length: 255 }).default('').notNull(),
});

export const releaseAttributeInMusicbrainz = musicbrainz.table(
  'release_attribute',
  {
    id: serial().primaryKey().notNull(),
    release: integer().notNull(),
    releaseAttributeType: integer('release_attribute_type').notNull(),
    releaseAttributeTypeAllowedValue: integer('release_attribute_type_allowed_value'),
    releaseAttributeText: text('release_attribute_text'),
  },
  (table) => [
    index('release_attribute_idx_release').using('btree', table.release.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.release],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'release_attribute_fk_release',
    }),
    foreignKey({
      columns: [table.releaseAttributeType],
      foreignColumns: [releaseAttributeTypeInMusicbrainz.id],
      name: 'release_attribute_fk_release_attribute_type',
    }),
    foreignKey({
      columns: [table.releaseAttributeTypeAllowedValue],
      foreignColumns: [releaseAttributeTypeAllowedValueInMusicbrainz.id],
      name: 'release_attribute_fk_release_attribute_type_allowed_value',
    }),
    check(
      'release_attribute_check',
      sql`((release_attribute_type_allowed_value IS NULL) AND (release_attribute_text IS NOT NULL)) OR ((release_attribute_type_allowed_value IS NOT NULL) AND (release_attribute_text IS NULL))`,
    ),
  ],
);

export const releaseAttributeTypeInMusicbrainz = musicbrainz.table(
  'release_attribute_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    comment: varchar({ length: 255 }).default('').notNull(),
    freeText: boolean('free_text').notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('release_attribute_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'release_attribute_type_fk_parent',
    }),
  ],
);

export const releaseStatusInMusicbrainz = musicbrainz.table(
  'release_status',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('release_status_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'release_status_fk_parent',
    }),
  ],
);

export const releasePackagingInMusicbrainz = musicbrainz.table(
  'release_packaging',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('release_packaging_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'release_packaging_fk_parent',
    }),
  ],
);

export const releaseGidRedirectInMusicbrainz = musicbrainz.table(
  'release_gid_redirect',
  {
    gid: uuid().primaryKey().notNull(),
    newId: integer('new_id').notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('release_gid_redirect_idx_new_id').using('btree', table.newId.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.newId],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'release_gid_redirect_fk_new_id',
    }),
  ],
);

export const releaseAliasInMusicbrainz = musicbrainz.table(
  'release_alias',
  {
    id: serial().primaryKey().notNull(),
    release: integer().notNull(),
    name: varchar().notNull(),
    locale: text(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    type: integer(),
    sortName: varchar('sort_name').notNull(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    primaryForLocale: boolean('primary_for_locale').default(false).notNull(),
    ended: boolean().default(false).notNull(),
  },
  (table) => [
    uniqueIndex('release_alias_idx_primary')
      .using('btree', table.release.asc().nullsLast().op('int4_ops'), table.locale.asc().nullsLast().op('int4_ops'))
      .where(sql`((primary_for_locale = true) AND (locale IS NOT NULL))`),
    index('release_alias_idx_release').using('btree', table.release.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.release],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'release_alias_fk_release',
    }),
    foreignKey({
      columns: [table.type],
      foreignColumns: [releaseAliasTypeInMusicbrainz.id],
      name: 'release_alias_fk_type',
    }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('control_for_whitespace_sort_name', sql`CHECK (musicbrainz.controlled_for_whitespace((sort_name)::text`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
    check('only_non_empty_sort_name', sql`(sort_name)::text <> ''::text`),
    check('primary_check', sql`((locale IS NULL) AND (primary_for_locale IS FALSE)) OR (locale IS NOT NULL)`),
    check(
      'release_alias_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
    check('release_alias_edits_pending_check', sql`edits_pending >= 0`),
  ],
);

export const releaseLabelInMusicbrainz = musicbrainz.table(
  'release_label',
  {
    id: serial().primaryKey().notNull(),
    release: integer().notNull(),
    label: integer(),
    catalogNumber: varchar('catalog_number', { length: 255 }),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('release_label_idx_label').using('btree', table.label.asc().nullsLast().op('int4_ops')),
    index('release_label_idx_release').using('btree', table.release.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.release],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'release_label_fk_release',
    }),
    foreignKey({
      columns: [table.label],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'release_label_fk_label',
    }),
    unique('release_label_uniq').on(table.catalogNumber, table.label, table.release),
    check('no_empty_string_catalog_number', sql`(catalog_number)::text <> ''::text`),
    check(
      'release_label_catalog_number_check',
      sql`CHECK (musicbrainz.controlled_for_whitespace((catalog_number)::text`,
    ),
    check('release_label_check', sql`(catalog_number IS NOT NULL) OR (label IS NOT NULL)`),
  ],
);

export const releaseUnknownCountryInMusicbrainz = musicbrainz.table(
  'release_unknown_country',
  {
    release: integer().primaryKey().notNull(),
    dateYear: smallint('date_year'),
    dateMonth: smallint('date_month'),
    dateDay: smallint('date_day'),
  },
  (table) => [
    foreignKey({
      columns: [table.release],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'release_unknown_country_fk_release',
    }),
    check('non_empty_date', sql`(date_year IS NOT NULL) OR (date_month IS NOT NULL) OR (date_day IS NOT NULL)`),
  ],
);

export const releaseGroupGidRedirectInMusicbrainz = musicbrainz.table(
  'release_group_gid_redirect',
  {
    gid: uuid().primaryKey().notNull(),
    newId: integer('new_id').notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('release_group_gid_redirect_idx_new_id').using('btree', table.newId.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.newId],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'release_group_gid_redirect_fk_new_id',
    }),
  ],
);

export const releaseGroupMetaInMusicbrainz = musicbrainz.table(
  'release_group_meta',
  {
    id: integer().primaryKey().notNull(),
    releaseCount: integer('release_count').default(0).notNull(),
    firstReleaseDateYear: smallint('first_release_date_year'),
    firstReleaseDateMonth: smallint('first_release_date_month'),
    firstReleaseDateDay: smallint('first_release_date_day'),
    rating: smallint(),
    ratingCount: integer('rating_count'),
  },
  (table) => [
    foreignKey({
      columns: [table.id],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'release_group_meta_fk_id',
    }).onDelete('cascade'),
    check('release_group_meta_rating_check', sql`(rating >= 0) AND (rating <= 100)`),
  ],
);

export const releaseGroupPrimaryTypeInMusicbrainz = musicbrainz.table(
  'release_group_primary_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('release_group_primary_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'release_group_primary_type_fk_parent',
    }),
  ],
);

export const releaseGroupInMusicbrainz = musicbrainz.table(
  'release_group',
  {
    id: serial().primaryKey().notNull(),
    gid: uuid().notNull(),
    name: varchar().notNull(),
    artistCredit: integer('artist_credit').notNull(),
    type: integer(),
    comment: varchar({ length: 255 }).default('').notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('release_group_idx_artist_credit').using('btree', table.artistCredit.asc().nullsLast().op('int4_ops')),
    uniqueIndex('release_group_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    index('release_group_idx_musicbrainz_collate').using('btree', table.name.asc().nullsLast().op('text_ops')),
    index('release_group_idx_name').using('btree', table.name.asc().nullsLast().op('text_ops')),
    foreignKey({
      columns: [table.artistCredit],
      foreignColumns: [artistCreditInMusicbrainz.id],
      name: 'release_group_fk_artist_credit',
    }),
    foreignKey({
      columns: [table.type],
      foreignColumns: [releaseGroupPrimaryTypeInMusicbrainz.id],
      name: 'release_group_fk_type',
    }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
    check('release_group_comment_check', sql`CHECK (musicbrainz.controlled_for_whitespace((comment)::text`),
    check('release_group_edits_pending_check', sql`edits_pending >= 0`),
  ],
);

export const releaseGroupAliasTypeInMusicbrainz = musicbrainz.table(
  'release_group_alias_type',
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('release_group_alias_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'release_group_alias_type_fk_parent',
    }),
  ],
);

export const releaseGroupAttributeInMusicbrainz = musicbrainz.table(
  'release_group_attribute',
  {
    id: serial().primaryKey().notNull(),
    releaseGroup: integer('release_group').notNull(),
    releaseGroupAttributeType: integer('release_group_attribute_type').notNull(),
    releaseGroupAttributeTypeAllowedValue: integer('release_group_attribute_type_allowed_value'),
    releaseGroupAttributeText: text('release_group_attribute_text'),
  },
  (table) => [
    index('release_group_attribute_idx_release_group').using(
      'btree',
      table.releaseGroup.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.releaseGroup],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'release_group_attribute_fk_release_group',
    }),
    foreignKey({
      columns: [table.releaseGroupAttributeType],
      foreignColumns: [releaseGroupAttributeTypeInMusicbrainz.id],
      name: 'release_group_attribute_fk_release_group_attribute_type',
    }),
    foreignKey({
      columns: [table.releaseGroupAttributeTypeAllowedValue],
      foreignColumns: [releaseGroupAttributeTypeAllowedValueInMusicbrainz.id],
      name: 'release_group_attribute_fk_release_group_attribute_type_allowed',
    }),
    check(
      'release_group_attribute_check',
      sql`((release_group_attribute_type_allowed_value IS NULL) AND (release_group_attribute_text IS NOT NULL)) OR ((release_group_attribute_type_allowed_value IS NOT NULL) AND (release_group_attribute_text IS NULL))`,
    ),
  ],
);

export const releaseGroupAttributeTypeInMusicbrainz = musicbrainz.table(
  'release_group_attribute_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    comment: varchar({ length: 255 }).default('').notNull(),
    freeText: boolean('free_text').notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('release_group_attribute_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'release_group_attribute_type_fk_parent',
    }),
  ],
);

export const releaseGroupAttributeTypeAllowedValueInMusicbrainz = musicbrainz.table(
  'release_group_attribute_type_allowed_value',
  {
    id: serial().primaryKey().notNull(),
    releaseGroupAttributeType: integer('release_group_attribute_type').notNull(),
    value: text(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('release_group_attribute_type_allowed_value_idx_gid').using(
      'btree',
      table.gid.asc().nullsLast().op('uuid_ops'),
    ),
    index('release_group_attribute_type_allowed_value_idx_name').using(
      'btree',
      table.releaseGroupAttributeType.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.releaseGroupAttributeType],
      foreignColumns: [releaseGroupAttributeTypeInMusicbrainz.id],
      name: 'release_group_attribute_type_allowed_value_fk_release_group_att',
    }),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'release_group_attribute_type_allowed_value_fk_parent',
    }),
  ],
);

export const releaseGroupAliasInMusicbrainz = musicbrainz.table(
  'release_group_alias',
  {
    id: serial().primaryKey().notNull(),
    releaseGroup: integer('release_group').notNull(),
    name: varchar().notNull(),
    locale: text(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    type: integer(),
    sortName: varchar('sort_name').notNull(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    primaryForLocale: boolean('primary_for_locale').default(false).notNull(),
    ended: boolean().default(false).notNull(),
  },
  (table) => [
    uniqueIndex('release_group_alias_idx_primary')
      .using(
        'btree',
        table.releaseGroup.asc().nullsLast().op('int4_ops'),
        table.locale.asc().nullsLast().op('int4_ops'),
      )
      .where(sql`((primary_for_locale = true) AND (locale IS NOT NULL))`),
    index('release_group_alias_idx_release_group').using('btree', table.releaseGroup.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.releaseGroup],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'release_group_alias_fk_release_group',
    }),
    foreignKey({
      columns: [table.type],
      foreignColumns: [releaseGroupAliasTypeInMusicbrainz.id],
      name: 'release_group_alias_fk_type',
    }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('control_for_whitespace_sort_name', sql`CHECK (musicbrainz.controlled_for_whitespace((sort_name)::text`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
    check('only_non_empty_sort_name', sql`(sort_name)::text <> ''::text`),
    check('primary_check', sql`((locale IS NULL) AND (primary_for_locale IS FALSE)) OR (locale IS NOT NULL)`),
    check(
      'release_group_alias_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
    check('release_group_alias_edits_pending_check', sql`edits_pending >= 0`),
  ],
);

export const seriesAliasInMusicbrainz = musicbrainz.table(
  'series_alias',
  {
    id: serial().primaryKey().notNull(),
    series: integer().notNull(),
    name: varchar().notNull(),
    locale: text(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    type: integer(),
    sortName: varchar('sort_name').notNull(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    primaryForLocale: boolean('primary_for_locale').default(false).notNull(),
    ended: boolean().default(false).notNull(),
  },
  (table) => [
    index('series_alias_idx_lower_unaccent_name').using(
      'btree',
      sql`lower(musicbrainz.musicbrainz_unaccent((name)::text))`,
    ),
    uniqueIndex('series_alias_idx_primary')
      .using('btree', table.series.asc().nullsLast().op('int4_ops'), table.locale.asc().nullsLast().op('int4_ops'))
      .where(sql`((primary_for_locale = true) AND (locale IS NOT NULL))`),
    index('series_alias_idx_series').using('btree', table.series.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.series],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'series_alias_fk_series',
    }),
    foreignKey({
      columns: [table.type],
      foreignColumns: [seriesAliasTypeInMusicbrainz.id],
      name: 'series_alias_fk_type',
    }),
    check('primary_check', sql`((locale IS NULL) AND (primary_for_locale IS FALSE)) OR (locale IS NOT NULL)`),
    check(
      'search_hints_are_empty',
      sql`(type <> 2) OR ((type = 2) AND ((sort_name)::text = (name)::text) AND (begin_date_year IS NULL) AND (begin_date_month IS NULL) AND (begin_date_day IS NULL) AND (end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL) AND (primary_for_locale IS FALSE) AND (locale IS NULL))`,
    ),
    check(
      'series_alias_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
    check('series_alias_edits_pending_check', sql`edits_pending >= 0`),
  ],
);

export const scriptInMusicbrainz = musicbrainz.table(
  'script',
  {
    id: serial().primaryKey().notNull(),
    isoCode: char('iso_code', { length: 4 }).notNull(),
    isoNumber: char('iso_number', { length: 3 }).notNull(),
    name: varchar({ length: 100 }).notNull(),
    frequency: smallint().default(0).notNull(),
  },
  (table) => [uniqueIndex('script_idx_iso_code').using('btree', table.isoCode.asc().nullsLast().op('bpchar_ops'))],
);

export const seriesAliasTypeInMusicbrainz = musicbrainz.table(
  'series_alias_type',
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('series_alias_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'series_alias_type_fk_parent',
    }),
  ],
);

export const seriesInMusicbrainz = musicbrainz.table(
  'series',
  {
    id: serial().primaryKey().notNull(),
    gid: uuid().notNull(),
    name: varchar().notNull(),
    comment: varchar({ length: 255 }).default('').notNull(),
    type: integer().notNull(),
    orderingType: integer('ordering_type').notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    uniqueIndex('series_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    index('series_idx_lower_unaccent_name_comment').using(
      'btree',
      sql`lower(musicbrainz.musicbrainz_unaccent((name)::text))`,
      sql`lower(musicbrainz.musicbrainz_unaccent((comment)::text))`,
    ),
    index('series_idx_name').using('btree', table.name.asc().nullsLast().op('text_ops')),
    foreignKey({
      columns: [table.type],
      foreignColumns: [seriesTypeInMusicbrainz.id],
      name: 'series_fk_type',
    }),
    foreignKey({
      columns: [table.orderingType],
      foreignColumns: [seriesOrderingTypeInMusicbrainz.id],
      name: 'series_fk_ordering_type',
    }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
    check('series_comment_check', sql`CHECK (musicbrainz.controlled_for_whitespace((comment)::text`),
    check('series_edits_pending_check', sql`edits_pending >= 0`),
  ],
);

export const seriesTypeInMusicbrainz = musicbrainz.table(
  'series_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('series_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'series_type_fk_parent',
    }),
    check(
      'allowed_series_entity_type',
      sql`(entity_type)::text = ANY ((ARRAY['artist'::character varying, 'event'::character varying, 'recording'::character varying, 'release'::character varying, 'release_group'::character varying, 'series'::character varying, 'work'::character varying])::text[])`,
    ),
  ],
);

export const releaseGroupSecondaryTypeInMusicbrainz = musicbrainz.table(
  'release_group_secondary_type',
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('release_group_secondary_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'release_group_secondary_type_fk_parent',
    }),
  ],
);

export const seriesOrderingTypeInMusicbrainz = musicbrainz.table(
  'series_ordering_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('series_ordering_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'series_ordering_type_fk_parent',
    }),
  ],
);

export const seriesAttributeTypeInMusicbrainz = musicbrainz.table(
  'series_attribute_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    comment: varchar({ length: 255 }).default('').notNull(),
    freeText: boolean('free_text').notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('series_attribute_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'series_attribute_type_fk_parent',
    }),
  ],
);

export const seriesGidRedirectInMusicbrainz = musicbrainz.table(
  'series_gid_redirect',
  {
    gid: uuid().primaryKey().notNull(),
    newId: integer('new_id').notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('series_gid_redirect_idx_new_id').using('btree', table.newId.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.newId],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'series_gid_redirect_fk_new_id',
    }),
  ],
);

export const urlInMusicbrainz = musicbrainz.table(
  'url',
  {
    id: serial().primaryKey().notNull(),
    gid: uuid().notNull(),
    url: text().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    uniqueIndex('url_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    uniqueIndex('url_idx_url').using('btree', table.url.asc().nullsLast().op('text_ops')),
    check('url_edits_pending_check', sql`edits_pending >= 0`),
  ],
);

export const trackGidRedirectInMusicbrainz = musicbrainz.table(
  'track_gid_redirect',
  {
    gid: uuid().primaryKey().notNull(),
    newId: integer('new_id').notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('track_gid_redirect_idx_new_id').using('btree', table.newId.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.newId],
      foreignColumns: [trackInMusicbrainz.id],
      name: 'track_gid_redirect_fk_new_id',
    }),
  ],
);

export const mediumIndexInMusicbrainz = musicbrainz.table(
  'medium_index',
  {
    medium: integer().primaryKey().notNull(),
    toc: cube('toc'),
  },
  (table) => [
    index('medium_index_idx').using('gist', table.toc.asc().nullsLast().op('gist_cube_ops')),
    foreignKey({
      columns: [table.medium],
      foreignColumns: [mediumInMusicbrainz.id],
      name: 'medium_index_fk_medium',
    }).onDelete('cascade'),
  ],
);

export const seriesAttributeInMusicbrainz = musicbrainz.table(
  'series_attribute',
  {
    id: serial().primaryKey().notNull(),
    series: integer().notNull(),
    seriesAttributeType: integer('series_attribute_type').notNull(),
    seriesAttributeTypeAllowedValue: integer('series_attribute_type_allowed_value'),
    seriesAttributeText: text('series_attribute_text'),
  },
  (table) => [
    index('series_attribute_idx_series').using('btree', table.series.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.series],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'series_attribute_fk_series',
    }),
    foreignKey({
      columns: [table.seriesAttributeType],
      foreignColumns: [seriesAttributeTypeInMusicbrainz.id],
      name: 'series_attribute_fk_series_attribute_type',
    }),
    foreignKey({
      columns: [table.seriesAttributeTypeAllowedValue],
      foreignColumns: [seriesAttributeTypeAllowedValueInMusicbrainz.id],
      name: 'series_attribute_fk_series_attribute_type_allowed_value',
    }),
    check(
      'series_attribute_check',
      sql`((series_attribute_type_allowed_value IS NULL) AND (series_attribute_text IS NOT NULL)) OR ((series_attribute_type_allowed_value IS NOT NULL) AND (series_attribute_text IS NULL))`,
    ),
  ],
);

export const seriesAttributeTypeAllowedValueInMusicbrainz = musicbrainz.table(
  'series_attribute_type_allowed_value',
  {
    id: serial().primaryKey().notNull(),
    seriesAttributeType: integer('series_attribute_type').notNull(),
    value: text(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('series_attribute_type_allowed_value_idx_gid').using(
      'btree',
      table.gid.asc().nullsLast().op('uuid_ops'),
    ),
    index('series_attribute_type_allowed_value_idx_name').using(
      'btree',
      table.seriesAttributeType.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.seriesAttributeType],
      foreignColumns: [seriesAttributeTypeInMusicbrainz.id],
      name: 'series_attribute_type_allowed_value_fk_series_attribute_type',
    }),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'series_attribute_type_allowed_value_fk_parent',
    }),
  ],
);

export const trackRawInMusicbrainz = musicbrainz.table(
  'track_raw',
  {
    id: serial().primaryKey().notNull(),
    release: integer().notNull(),
    title: varchar({ length: 255 }).notNull(),
    artist: varchar({ length: 255 }),
    sequence: integer().notNull(),
  },
  (table) => [
    index('track_raw_idx_release').using('btree', table.release.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.release],
      foreignColumns: [releaseRawInMusicbrainz.id],
      name: 'track_raw_fk_release',
    }),
  ],
);

export const urlGidRedirectInMusicbrainz = musicbrainz.table(
  'url_gid_redirect',
  {
    gid: uuid().primaryKey().notNull(),
    newId: integer('new_id').notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('url_gid_redirect_idx_new_id').using('btree', table.newId.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.newId],
      foreignColumns: [urlInMusicbrainz.id],
      name: 'url_gid_redirect_fk_new_id',
    }),
  ],
);

export const voteInMusicbrainz = musicbrainz.table(
  'vote',
  {
    id: serial().primaryKey().notNull(),
    editor: integer().notNull(),
    edit: integer().notNull(),
    vote: smallint().notNull(),
    voteTime: timestamp('vote_time', { withTimezone: true, mode: 'string' }).defaultNow(),
    superseded: boolean().default(false).notNull(),
  },
  (table) => [
    index('vote_idx_edit').using('btree', table.edit.asc().nullsLast().op('int4_ops')),
    index('vote_idx_editor_edit')
      .using('btree', table.editor.asc().nullsLast().op('int4_ops'), table.edit.asc().nullsLast().op('int4_ops'))
      .where(sql`(superseded = false)`),
    index('vote_idx_editor_vote_time').using(
      'btree',
      table.editor.asc().nullsLast().op('int4_ops'),
      table.voteTime.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'vote_fk_editor',
    }),
    foreignKey({
      columns: [table.edit],
      foreignColumns: [editInMusicbrainz.id],
      name: 'vote_fk_edit',
    }),
  ],
);

export const trackInMusicbrainz = musicbrainz.table(
  'track',
  {
    id: serial().primaryKey().notNull(),
    gid: uuid().notNull(),
    recording: integer().notNull(),
    medium: integer().notNull(),
    position: integer().notNull(),
    number: text().notNull(),
    name: varchar().notNull(),
    artistCredit: integer('artist_credit').notNull(),
    length: integer(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    isDataTrack: boolean('is_data_track').default(false).notNull(),
  },
  (table) => [
    index('track_idx_artist_credit').using('btree', table.artistCredit.asc().nullsLast().op('int4_ops')),
    uniqueIndex('track_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    index('track_idx_recording').using('btree', table.recording.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.recording],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'track_fk_recording',
    }),
    foreignKey({
      columns: [table.medium],
      foreignColumns: [mediumInMusicbrainz.id],
      name: 'track_fk_medium',
    }),
    foreignKey({
      columns: [table.artistCredit],
      foreignColumns: [artistCreditInMusicbrainz.id],
      name: 'track_fk_artist_credit',
    }),
    unique('track_uniq_medium_position').on(table.medium, table.position),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
    check('track_edits_pending_check', sql`edits_pending >= 0`),
    check('track_length_check', sql`(length IS NULL) OR (length > 0)`),
    check('track_number_check', sql`CHECK (musicbrainz.controlled_for_whitespace(number`),
  ],
);

export const tagInMusicbrainz = musicbrainz.table(
  'tag',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    refCount: integer('ref_count').default(0).notNull(),
  },
  (table) => [
    uniqueIndex('tag_idx_name').using('btree', table.name.asc().nullsLast().op('text_ops')),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
  ],
);

export const workMetaInMusicbrainz = musicbrainz.table(
  'work_meta',
  {
    id: integer().primaryKey().notNull(),
    rating: smallint(),
    ratingCount: integer('rating_count'),
  },
  (table) => [
    foreignKey({
      columns: [table.id],
      foreignColumns: [workInMusicbrainz.id],
      name: 'work_meta_fk_id',
    }).onDelete('cascade'),
    check('work_meta_rating_check', sql`(rating >= 0) AND (rating <= 100)`),
  ],
);

export const workAliasTypeInMusicbrainz = musicbrainz.table(
  'work_alias_type',
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('work_alias_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'work_alias_type_fk_parent',
    }),
  ],
);

export const workAttributeTypeAllowedValueInMusicbrainz = musicbrainz.table(
  'work_attribute_type_allowed_value',
  {
    id: serial().primaryKey().notNull(),
    workAttributeType: integer('work_attribute_type').notNull(),
    value: text(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('work_attribute_type_allowed_value_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    index('work_attribute_type_allowed_value_idx_name').using(
      'btree',
      table.workAttributeType.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.workAttributeType],
      foreignColumns: [workAttributeTypeInMusicbrainz.id],
      name: 'work_attribute_type_allowed_value_fk_work_attribute_type',
    }),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'work_attribute_type_allowed_value_fk_parent',
    }),
  ],
);

export const workGidRedirectInMusicbrainz = musicbrainz.table(
  'work_gid_redirect',
  {
    gid: uuid().primaryKey().notNull(),
    newId: integer('new_id').notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('work_gid_redirect_idx_new_id').using('btree', table.newId.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.newId],
      foreignColumns: [workInMusicbrainz.id],
      name: 'work_gid_redirect_fk_new_id',
    }),
  ],
);

export const workAttributeTypeInMusicbrainz = musicbrainz.table(
  'work_attribute_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    comment: varchar({ length: 255 }).default('').notNull(),
    freeText: boolean('free_text').notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('work_attribute_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'work_attribute_type_fk_parent',
    }),
  ],
);

export const workTypeInMusicbrainz = musicbrainz.table(
  'work_type',
  {
    id: serial().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('work_type_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'work_type_fk_parent',
    }),
  ],
);

export const workAttributeInMusicbrainz = musicbrainz.table(
  'work_attribute',
  {
    id: serial().primaryKey().notNull(),
    work: integer().notNull(),
    workAttributeType: integer('work_attribute_type').notNull(),
    workAttributeTypeAllowedValue: integer('work_attribute_type_allowed_value'),
    workAttributeText: text('work_attribute_text'),
  },
  (table) => [
    index('work_attribute_idx_work').using('btree', table.work.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.work],
      foreignColumns: [workInMusicbrainz.id],
      name: 'work_attribute_fk_work',
    }),
    foreignKey({
      columns: [table.workAttributeType],
      foreignColumns: [workAttributeTypeInMusicbrainz.id],
      name: 'work_attribute_fk_work_attribute_type',
    }),
    foreignKey({
      columns: [table.workAttributeTypeAllowedValue],
      foreignColumns: [workAttributeTypeAllowedValueInMusicbrainz.id],
      name: 'work_attribute_fk_work_attribute_type_allowed_value',
    }),
    check(
      'work_attribute_check',
      sql`((work_attribute_type_allowed_value IS NULL) AND (work_attribute_text IS NOT NULL)) OR ((work_attribute_type_allowed_value IS NOT NULL) AND (work_attribute_text IS NULL))`,
    ),
  ],
);

export const artistAttributeTypeAllowedValueInMusicbrainz = musicbrainz.table(
  'artist_attribute_type_allowed_value',
  {
    id: serial().primaryKey().notNull(),
    artistAttributeType: integer('artist_attribute_type').notNull(),
    value: text(),
    parent: integer(),
    childOrder: integer('child_order').default(0).notNull(),
    description: text(),
    gid: uuid().notNull(),
  },
  (table) => [
    uniqueIndex('artist_attribute_type_allowed_value_idx_gid').using(
      'btree',
      table.gid.asc().nullsLast().op('uuid_ops'),
    ),
    index('artist_attribute_type_allowed_value_idx_name').using(
      'btree',
      table.artistAttributeType.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.artistAttributeType],
      foreignColumns: [artistAttributeTypeInMusicbrainz.id],
      name: 'artist_attribute_type_allowed_value_fk_artist_attribute_type',
    }),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [table.id],
      name: 'artist_attribute_type_allowed_value_fk_parent',
    }),
  ],
);

export const areaAliasInMusicbrainz = musicbrainz.table(
  'area_alias',
  {
    id: serial().primaryKey().notNull(),
    area: integer().notNull(),
    name: varchar().notNull(),
    locale: text(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    type: integer(),
    sortName: varchar('sort_name').notNull(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    primaryForLocale: boolean('primary_for_locale').default(false).notNull(),
    ended: boolean().default(false).notNull(),
  },
  (table) => [
    index('area_alias_idx_area').using('btree', table.area.asc().nullsLast().op('int4_ops')),
    uniqueIndex('area_alias_idx_primary')
      .using('btree', table.area.asc().nullsLast().op('int4_ops'), table.locale.asc().nullsLast().op('int4_ops'))
      .where(sql`((primary_for_locale = true) AND (locale IS NOT NULL))`),
    foreignKey({
      columns: [table.area],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'area_alias_fk_area',
    }),
    foreignKey({
      columns: [table.type],
      foreignColumns: [areaAliasTypeInMusicbrainz.id],
      name: 'area_alias_fk_type',
    }),
    check(
      'area_alias_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
    check('area_alias_edits_pending_check', sql`edits_pending >= 0`),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('control_for_whitespace_sort_name', sql`CHECK (musicbrainz.controlled_for_whitespace((sort_name)::text`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
    check('only_non_empty_sort_name', sql`(sort_name)::text <> ''::text`),
    check('primary_check', sql`((locale IS NULL) AND (primary_for_locale IS FALSE)) OR (locale IS NOT NULL)`),
  ],
);

export const artistAliasInMusicbrainz = musicbrainz.table(
  'artist_alias',
  {
    id: serial().primaryKey().notNull(),
    artist: integer().notNull(),
    name: varchar().notNull(),
    locale: text(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    type: integer(),
    sortName: varchar('sort_name').notNull(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    primaryForLocale: boolean('primary_for_locale').default(false).notNull(),
    ended: boolean().default(false).notNull(),
  },
  (table) => [
    index('artist_alias_idx_artist').using('btree', table.artist.asc().nullsLast().op('int4_ops')),
    index('artist_alias_idx_lower_unaccent_name').using(
      'btree',
      sql`lower(musicbrainz.musicbrainz_unaccent((name)::text))`,
    ),
    uniqueIndex('artist_alias_idx_primary')
      .using('btree', table.artist.asc().nullsLast().op('text_ops'), table.locale.asc().nullsLast().op('int4_ops'))
      .where(sql`((primary_for_locale = true) AND (locale IS NOT NULL))`),
    foreignKey({
      columns: [table.artist],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'artist_alias_fk_artist',
    }),
    foreignKey({
      columns: [table.type],
      foreignColumns: [artistAliasTypeInMusicbrainz.id],
      name: 'artist_alias_fk_type',
    }),
    check(
      'artist_alias_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
    check('artist_alias_edits_pending_check', sql`edits_pending >= 0`),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('control_for_whitespace_sort_name', sql`CHECK (musicbrainz.controlled_for_whitespace((sort_name)::text`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
    check('only_non_empty_sort_name', sql`(sort_name)::text <> ''::text`),
    check('primary_check', sql`((locale IS NULL) AND (primary_for_locale IS FALSE)) OR (locale IS NOT NULL)`),
    check(
      'search_hints_are_empty',
      sql`(type <> 3) OR ((type = 3) AND ((sort_name)::text = (name)::text) AND (begin_date_year IS NULL) AND (begin_date_month IS NULL) AND (begin_date_day IS NULL) AND (end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL) AND (primary_for_locale IS FALSE) AND (locale IS NULL))`,
    ),
  ],
);

export const workInMusicbrainz = musicbrainz.table(
  'work',
  {
    id: serial().primaryKey().notNull(),
    gid: uuid().notNull(),
    name: varchar().notNull(),
    type: integer(),
    comment: varchar({ length: 255 }).default('').notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    uniqueIndex('work_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    index('work_idx_musicbrainz_collate').using('btree', table.name.asc().nullsLast().op('text_ops')),
    index('work_idx_name').using('btree', table.name.asc().nullsLast().op('text_ops')),
    foreignKey({
      columns: [table.type],
      foreignColumns: [workTypeInMusicbrainz.id],
      name: 'work_fk_type',
    }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
    check('work_comment_check', sql`CHECK (musicbrainz.controlled_for_whitespace((comment)::text`),
    check('work_edits_pending_check', sql`edits_pending >= 0`),
  ],
);

export const workAliasInMusicbrainz = musicbrainz.table(
  'work_alias',
  {
    id: serial().primaryKey().notNull(),
    work: integer().notNull(),
    name: varchar().notNull(),
    locale: text(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    type: integer(),
    sortName: varchar('sort_name').notNull(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    primaryForLocale: boolean('primary_for_locale').default(false).notNull(),
    ended: boolean().default(false).notNull(),
  },
  (table) => [
    uniqueIndex('work_alias_idx_primary')
      .using('btree', table.work.asc().nullsLast().op('int4_ops'), table.locale.asc().nullsLast().op('int4_ops'))
      .where(sql`((primary_for_locale = true) AND (locale IS NOT NULL))`),
    index('work_alias_idx_work').using('btree', table.work.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.work],
      foreignColumns: [workInMusicbrainz.id],
      name: 'work_alias_fk_work',
    }),
    foreignKey({
      columns: [table.type],
      foreignColumns: [workAliasTypeInMusicbrainz.id],
      name: 'work_alias_fk_type',
    }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('control_for_whitespace_sort_name', sql`CHECK (musicbrainz.controlled_for_whitespace((sort_name)::text`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
    check('only_non_empty_sort_name', sql`(sort_name)::text <> ''::text`),
    check('primary_check', sql`((locale IS NULL) AND (primary_for_locale IS FALSE)) OR (locale IS NOT NULL)`),
    check(
      'search_hints_are_empty',
      sql`(type <> 2) OR ((type = 2) AND ((sort_name)::text = (name)::text) AND (begin_date_year IS NULL) AND (begin_date_month IS NULL) AND (begin_date_day IS NULL) AND (end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL) AND (primary_for_locale IS FALSE) AND (locale IS NULL))`,
    ),
    check(
      'work_alias_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
    check('work_alias_edits_pending_check', sql`edits_pending >= 0`),
  ],
);

export const artistInMusicbrainz = musicbrainz.table(
  'artist',
  {
    id: serial().primaryKey().notNull(),
    gid: uuid().notNull(),
    name: varchar().notNull(),
    sortName: varchar('sort_name').notNull(),
    beginDateYear: smallint('begin_date_year'),
    beginDateMonth: smallint('begin_date_month'),
    beginDateDay: smallint('begin_date_day'),
    endDateYear: smallint('end_date_year'),
    endDateMonth: smallint('end_date_month'),
    endDateDay: smallint('end_date_day'),
    type: integer(),
    area: integer(),
    gender: integer(),
    comment: varchar({ length: 255 }).default('').notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    ended: boolean().default(false).notNull(),
    beginArea: integer('begin_area'),
    endArea: integer('end_area'),
  },
  (table) => [
    index('artist_idx_area').using('btree', table.area.asc().nullsLast().op('int4_ops')),
    index('artist_idx_begin_area').using('btree', table.beginArea.asc().nullsLast().op('int4_ops')),
    index('artist_idx_end_area').using('btree', table.endArea.asc().nullsLast().op('int4_ops')),
    uniqueIndex('artist_idx_gid').using('btree', table.gid.asc().nullsLast().op('uuid_ops')),
    index('artist_idx_lower_unaccent_name_comment').using(
      'btree',
      sql`lower(musicbrainz.musicbrainz_unaccent((name)::text))`,
      sql`lower(musicbrainz.musicbrainz_unaccent((comment)::text))`,
    ),
    index('artist_idx_musicbrainz_collate').using('btree', table.name.asc().nullsLast().op('text_ops')),
    index('artist_idx_name').using('btree', table.name.asc().nullsLast().op('text_ops')),
    uniqueIndex('artist_idx_null_comment')
      .using('btree', table.name.asc().nullsLast().op('text_ops'))
      .where(sql`(comment IS NULL)`),
    index('artist_idx_sort_name').using('btree', table.sortName.asc().nullsLast().op('text_ops')),
    uniqueIndex('artist_idx_uniq_name_comment')
      .using('btree', table.name.asc().nullsLast().op('text_ops'), table.comment.asc().nullsLast().op('text_ops'))
      .where(sql`(comment IS NOT NULL)`),
    foreignKey({
      columns: [table.type],
      foreignColumns: [artistTypeInMusicbrainz.id],
      name: 'artist_fk_type',
    }),
    foreignKey({
      columns: [table.area],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'artist_fk_area',
    }),
    foreignKey({
      columns: [table.gender],
      foreignColumns: [genderInMusicbrainz.id],
      name: 'artist_fk_gender',
    }),
    foreignKey({
      columns: [table.beginArea],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'artist_fk_begin_area',
    }),
    foreignKey({
      columns: [table.endArea],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'artist_fk_end_area',
    }),
    check('artist_comment_check', sql`CHECK (musicbrainz.controlled_for_whitespace((comment)::text`),
    check('artist_edits_pending_check', sql`edits_pending >= 0`),
    check(
      'artist_ended_check',
      sql`(((end_date_year IS NOT NULL) OR (end_date_month IS NOT NULL) OR (end_date_day IS NOT NULL)) AND (ended = true)) OR ((end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
    check(
      'artist_va_check',
      sql`(id <> 1) OR ((type = 3) AND (gender IS NULL) AND (area IS NULL) AND (begin_area IS NULL) AND (end_area IS NULL) AND (begin_date_year IS NULL) AND (begin_date_month IS NULL) AND (begin_date_day IS NULL) AND (end_date_year IS NULL) AND (end_date_month IS NULL) AND (end_date_day IS NULL))`,
    ),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('control_for_whitespace_sort_name', sql`CHECK (musicbrainz.controlled_for_whitespace((sort_name)::text`),
    check(
      'group_type_implies_null_gender',
      sql`((gender IS NULL) AND (type = ANY (ARRAY[2, 5, 6]))) OR (type <> ALL (ARRAY[2, 5, 6])) OR (type IS NULL)`,
    ),
    check('only_non_empty', sql`(name)::text <> ''::text`),
    check('only_non_empty_sort_name', sql`(sort_name)::text <> ''::text`),
  ],
);

export const lArtistArtistInMusicbrainz = musicbrainz.table(
  'l_artist_artist',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_artist_artist_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_artist_artist_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_artist_artist_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'l_artist_artist_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'l_artist_artist_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_artist_artist_edits_pending_check', sql`edits_pending >= 0`),
    check('l_artist_artist_link_order_check', sql`link_order >= 0`),
    check('non_loop_relationship', sql`entity0 <> entity1`),
  ],
);

export const lEventGenreInMusicbrainz = musicbrainz.table(
  'l_event_genre',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_event_genre_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_event_genre_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_event_genre_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'l_event_genre_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'l_event_genre_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_event_genre_edits_pending_check', sql`edits_pending >= 0`),
    check('l_event_genre_link_order_check', sql`link_order >= 0`),
  ],
);

export const lEventInstrumentInMusicbrainz = musicbrainz.table(
  'l_event_instrument',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_event_instrument_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_event_instrument_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_event_instrument_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'l_event_instrument_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'l_event_instrument_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_event_instrument_edits_pending_check', sql`edits_pending >= 0`),
    check('l_event_instrument_link_order_check', sql`link_order >= 0`),
  ],
);

export const lGenrePlaceInMusicbrainz = musicbrainz.table(
  'l_genre_place',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_genre_place_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_genre_place_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_genre_place_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'l_genre_place_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'l_genre_place_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_genre_place_edits_pending_check', sql`edits_pending >= 0`),
    check('l_genre_place_link_order_check', sql`link_order >= 0`),
  ],
);

export const lInstrumentUrlInMusicbrainz = musicbrainz.table(
  'l_instrument_url',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_instrument_url_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_instrument_url_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_instrument_url_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'l_instrument_url_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [urlInMusicbrainz.id],
      name: 'l_instrument_url_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_instrument_url_edits_pending_check', sql`edits_pending >= 0`),
    check('l_instrument_url_link_order_check', sql`link_order >= 0`),
  ],
);

export const lLabelLabelInMusicbrainz = musicbrainz.table(
  'l_label_label',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_label_label_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_label_label_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_label_label_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'l_label_label_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'l_label_label_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_label_label_edits_pending_check', sql`edits_pending >= 0`),
    check('l_label_label_link_order_check', sql`link_order >= 0`),
    check('non_loop_relationship', sql`entity0 <> entity1`),
  ],
);

export const lMoodReleaseGroupInMusicbrainz = musicbrainz.table(
  'l_mood_release_group',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_mood_release_group_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_mood_release_group_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_mood_release_group_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [moodInMusicbrainz.id],
      name: 'l_mood_release_group_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'l_mood_release_group_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_mood_release_group_edits_pending_check', sql`edits_pending >= 0`),
    check('l_mood_release_group_link_order_check', sql`link_order >= 0`),
  ],
);

export const lMoodSeriesInMusicbrainz = musicbrainz.table(
  'l_mood_series',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_mood_series_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_mood_series_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_mood_series_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [moodInMusicbrainz.id],
      name: 'l_mood_series_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'l_mood_series_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_mood_series_edits_pending_check', sql`edits_pending >= 0`),
    check('l_mood_series_link_order_check', sql`link_order >= 0`),
  ],
);

export const lRecordingUrlInMusicbrainz = musicbrainz.table(
  'l_recording_url',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_recording_url_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_recording_url_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_recording_url_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'l_recording_url_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [urlInMusicbrainz.id],
      name: 'l_recording_url_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_recording_url_edits_pending_check', sql`edits_pending >= 0`),
    check('l_recording_url_link_order_check', sql`link_order >= 0`),
  ],
);

export const lRecordingWorkInMusicbrainz = musicbrainz.table(
  'l_recording_work',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_recording_work_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_recording_work_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_recording_work_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'l_recording_work_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [workInMusicbrainz.id],
      name: 'l_recording_work_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_recording_work_edits_pending_check', sql`edits_pending >= 0`),
    check('l_recording_work_link_order_check', sql`link_order >= 0`),
  ],
);

export const lUrlWorkInMusicbrainz = musicbrainz.table(
  'l_url_work',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_url_work_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_url_work_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_url_work_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [urlInMusicbrainz.id],
      name: 'l_url_work_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [workInMusicbrainz.id],
      name: 'l_url_work_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_url_work_edits_pending_check', sql`edits_pending >= 0`),
    check('l_url_work_link_order_check', sql`link_order >= 0`),
  ],
);

export const lWorkWorkInMusicbrainz = musicbrainz.table(
  'l_work_work',
  {
    id: serial().primaryKey().notNull(),
    link: integer().notNull(),
    entity0: integer().notNull(),
    entity1: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
    linkOrder: integer('link_order').default(0).notNull(),
    entity0Credit: text('entity0_credit').default('').notNull(),
    entity1Credit: text('entity1_credit').default('').notNull(),
  },
  (table) => [
    index('l_work_work_idx_entity1').using('btree', table.entity1.asc().nullsLast().op('int4_ops')),
    uniqueIndex('l_work_work_idx_uniq').using(
      'btree',
      table.entity0.asc().nullsLast().op('int4_ops'),
      table.entity1.asc().nullsLast().op('int4_ops'),
      table.link.asc().nullsLast().op('int4_ops'),
      table.linkOrder.asc().nullsLast().op('int4_ops'),
    ),
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'l_work_work_fk_link',
    }),
    foreignKey({
      columns: [table.entity0],
      foreignColumns: [workInMusicbrainz.id],
      name: 'l_work_work_fk_entity0',
    }),
    foreignKey({
      columns: [table.entity1],
      foreignColumns: [workInMusicbrainz.id],
      name: 'l_work_work_fk_entity1',
    }),
    check('control_for_whitespace_entity0_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity0_credit`),
    check('control_for_whitespace_entity1_credit', sql`CHECK (musicbrainz.controlled_for_whitespace(entity1_credit`),
    check('l_work_work_edits_pending_check', sql`edits_pending >= 0`),
    check('l_work_work_link_order_check', sql`link_order >= 0`),
    check('non_loop_relationship', sql`entity0 <> entity1`),
  ],
);

export const areaAnnotationInMusicbrainz = musicbrainz.table(
  'area_annotation',
  {
    area: integer().notNull(),
    annotation: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.area],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'area_annotation_fk_area',
    }),
    foreignKey({
      columns: [table.annotation],
      foreignColumns: [annotationInMusicbrainz.id],
      name: 'area_annotation_fk_annotation',
    }),
    primaryKey({ columns: [table.annotation, table.area], name: 'area_annotation_pkey' }),
  ],
);

export const artistAnnotationInMusicbrainz = musicbrainz.table(
  'artist_annotation',
  {
    artist: integer().notNull(),
    annotation: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.artist],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'artist_annotation_fk_artist',
    }),
    foreignKey({
      columns: [table.annotation],
      foreignColumns: [annotationInMusicbrainz.id],
      name: 'artist_annotation_fk_annotation',
    }),
    primaryKey({ columns: [table.annotation, table.artist], name: 'artist_annotation_pkey' }),
  ],
);

export const editEventInMusicbrainz = musicbrainz.table(
  'edit_event',
  {
    edit: integer().notNull(),
    event: integer().notNull(),
  },
  (table) => [
    index('edit_event_idx').using('btree', table.event.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.edit],
      foreignColumns: [editInMusicbrainz.id],
      name: 'edit_event_fk_edit',
    }),
    foreignKey({
      columns: [table.event],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'edit_event_fk_event',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.edit, table.event], name: 'edit_event_pkey' }),
  ],
);

export const editNoteRecipientInMusicbrainz = musicbrainz.table(
  'edit_note_recipient',
  {
    recipient: integer().notNull(),
    editNote: integer('edit_note').notNull(),
  },
  (table) => [
    index('edit_note_recipient_idx_recipient').using('btree', table.recipient.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.recipient],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'edit_note_recipient_fk_recipient',
    }),
    foreignKey({
      columns: [table.editNote],
      foreignColumns: [editNoteInMusicbrainz.id],
      name: 'edit_note_recipient_fk_edit_note',
    }),
    primaryKey({ columns: [table.editNote, table.recipient], name: 'edit_note_recipient_pkey' }),
  ],
);

export const editAreaInMusicbrainz = musicbrainz.table(
  'edit_area',
  {
    edit: integer().notNull(),
    area: integer().notNull(),
  },
  (table) => [
    index('edit_area_idx').using('btree', table.area.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.edit],
      foreignColumns: [editInMusicbrainz.id],
      name: 'edit_area_fk_edit',
    }),
    foreignKey({
      columns: [table.area],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'edit_area_fk_area',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.area, table.edit], name: 'edit_area_pkey' }),
  ],
);

export const editGenreInMusicbrainz = musicbrainz.table(
  'edit_genre',
  {
    edit: integer().notNull(),
    genre: integer().notNull(),
  },
  (table) => [
    index('edit_genre_idx').using('btree', table.genre.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.edit],
      foreignColumns: [editInMusicbrainz.id],
      name: 'edit_genre_fk_edit',
    }),
    foreignKey({
      columns: [table.genre],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'edit_genre_fk_genre',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.edit, table.genre], name: 'edit_genre_pkey' }),
  ],
);

export const editInstrumentInMusicbrainz = musicbrainz.table(
  'edit_instrument',
  {
    edit: integer().notNull(),
    instrument: integer().notNull(),
  },
  (table) => [
    index('edit_instrument_idx').using('btree', table.instrument.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.edit],
      foreignColumns: [editInMusicbrainz.id],
      name: 'edit_instrument_fk_edit',
    }),
    foreignKey({
      columns: [table.instrument],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'edit_instrument_fk_instrument',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.edit, table.instrument], name: 'edit_instrument_pkey' }),
  ],
);

export const editMoodInMusicbrainz = musicbrainz.table(
  'edit_mood',
  {
    edit: integer().notNull(),
    mood: integer().notNull(),
  },
  (table) => [
    index('edit_mood_idx').using('btree', table.mood.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.edit],
      foreignColumns: [editInMusicbrainz.id],
      name: 'edit_mood_fk_edit',
    }),
    foreignKey({
      columns: [table.mood],
      foreignColumns: [moodInMusicbrainz.id],
      name: 'edit_mood_fk_mood',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.edit, table.mood], name: 'edit_mood_pkey' }),
  ],
);

export const editPlaceInMusicbrainz = musicbrainz.table(
  'edit_place',
  {
    edit: integer().notNull(),
    place: integer().notNull(),
  },
  (table) => [
    index('edit_place_idx').using('btree', table.place.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.edit],
      foreignColumns: [editInMusicbrainz.id],
      name: 'edit_place_fk_edit',
    }),
    foreignKey({
      columns: [table.place],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'edit_place_fk_place',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.edit, table.place], name: 'edit_place_pkey' }),
  ],
);

export const editRecordingInMusicbrainz = musicbrainz.table(
  'edit_recording',
  {
    edit: integer().notNull(),
    recording: integer().notNull(),
  },
  (table) => [
    index('edit_recording_idx').using('btree', table.recording.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.edit],
      foreignColumns: [editInMusicbrainz.id],
      name: 'edit_recording_fk_edit',
    }),
    foreignKey({
      columns: [table.recording],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'edit_recording_fk_recording',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.edit, table.recording], name: 'edit_recording_pkey' }),
  ],
);

export const editReleaseInMusicbrainz = musicbrainz.table(
  'edit_release',
  {
    edit: integer().notNull(),
    release: integer().notNull(),
  },
  (table) => [
    index('edit_release_idx').using('btree', table.release.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.edit],
      foreignColumns: [editInMusicbrainz.id],
      name: 'edit_release_fk_edit',
    }),
    foreignKey({
      columns: [table.release],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'edit_release_fk_release',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.edit, table.release], name: 'edit_release_pkey' }),
  ],
);

export const editReleaseGroupInMusicbrainz = musicbrainz.table(
  'edit_release_group',
  {
    edit: integer().notNull(),
    releaseGroup: integer('release_group').notNull(),
  },
  (table) => [
    index('edit_release_group_idx').using('btree', table.releaseGroup.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.edit],
      foreignColumns: [editInMusicbrainz.id],
      name: 'edit_release_group_fk_edit',
    }),
    foreignKey({
      columns: [table.releaseGroup],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'edit_release_group_fk_release_group',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.edit, table.releaseGroup], name: 'edit_release_group_pkey' }),
  ],
);

export const editSeriesInMusicbrainz = musicbrainz.table(
  'edit_series',
  {
    edit: integer().notNull(),
    series: integer().notNull(),
  },
  (table) => [
    index('edit_series_idx').using('btree', table.series.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.edit],
      foreignColumns: [editInMusicbrainz.id],
      name: 'edit_series_fk_edit',
    }),
    foreignKey({
      columns: [table.series],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'edit_series_fk_series',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.edit, table.series], name: 'edit_series_pkey' }),
  ],
);

export const editUrlInMusicbrainz = musicbrainz.table(
  'edit_url',
  {
    edit: integer().notNull(),
    url: integer().notNull(),
  },
  (table) => [
    index('edit_url_idx').using('btree', table.url.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.edit],
      foreignColumns: [editInMusicbrainz.id],
      name: 'edit_url_fk_edit',
    }),
    foreignKey({
      columns: [table.url],
      foreignColumns: [urlInMusicbrainz.id],
      name: 'edit_url_fk_url',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.edit, table.url], name: 'edit_url_pkey' }),
  ],
);

export const editWorkInMusicbrainz = musicbrainz.table(
  'edit_work',
  {
    edit: integer().notNull(),
    work: integer().notNull(),
  },
  (table) => [
    index('edit_work_idx').using('btree', table.work.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.edit],
      foreignColumns: [editInMusicbrainz.id],
      name: 'edit_work_fk_edit',
    }),
    foreignKey({
      columns: [table.work],
      foreignColumns: [workInMusicbrainz.id],
      name: 'edit_work_fk_work',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.edit, table.work], name: 'edit_work_pkey' }),
  ],
);

export const eventAnnotationInMusicbrainz = musicbrainz.table(
  'event_annotation',
  {
    event: integer().notNull(),
    annotation: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.event],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'event_annotation_fk_event',
    }),
    foreignKey({
      columns: [table.annotation],
      foreignColumns: [annotationInMusicbrainz.id],
      name: 'event_annotation_fk_annotation',
    }),
    primaryKey({ columns: [table.annotation, table.event], name: 'event_annotation_pkey' }),
  ],
);

export const genreAnnotationInMusicbrainz = musicbrainz.table(
  'genre_annotation',
  {
    genre: integer().notNull(),
    annotation: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.genre],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'genre_annotation_fk_genre',
    }),
    foreignKey({
      columns: [table.annotation],
      foreignColumns: [annotationInMusicbrainz.id],
      name: 'genre_annotation_fk_annotation',
    }),
    primaryKey({ columns: [table.annotation, table.genre], name: 'genre_annotation_pkey' }),
  ],
);

export const instrumentAnnotationInMusicbrainz = musicbrainz.table(
  'instrument_annotation',
  {
    instrument: integer().notNull(),
    annotation: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.instrument],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'instrument_annotation_fk_instrument',
    }),
    foreignKey({
      columns: [table.annotation],
      foreignColumns: [annotationInMusicbrainz.id],
      name: 'instrument_annotation_fk_annotation',
    }),
    primaryKey({ columns: [table.annotation, table.instrument], name: 'instrument_annotation_pkey' }),
  ],
);

export const labelAnnotationInMusicbrainz = musicbrainz.table(
  'label_annotation',
  {
    label: integer().notNull(),
    annotation: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.label],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'label_annotation_fk_label',
    }),
    foreignKey({
      columns: [table.annotation],
      foreignColumns: [annotationInMusicbrainz.id],
      name: 'label_annotation_fk_annotation',
    }),
    primaryKey({ columns: [table.annotation, table.label], name: 'label_annotation_pkey' }),
  ],
);

export const editorCollectionCollaboratorInMusicbrainz = musicbrainz.table(
  'editor_collection_collaborator',
  {
    collection: integer().notNull(),
    editor: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.collection],
      foreignColumns: [editorCollectionInMusicbrainz.id],
      name: 'editor_collection_collaborator_fk_collection',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'editor_collection_collaborator_fk_editor',
    }),
    primaryKey({ columns: [table.collection, table.editor], name: 'editor_collection_collaborator_pkey' }),
  ],
);

export const mediumAttributeTypeAllowedFormatInMusicbrainz = musicbrainz.table(
  'medium_attribute_type_allowed_format',
  {
    mediumFormat: integer('medium_format').notNull(),
    mediumAttributeType: integer('medium_attribute_type').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.mediumFormat],
      foreignColumns: [mediumFormatInMusicbrainz.id],
      name: 'medium_attribute_type_allowed_format_fk_medium_format',
    }),
    foreignKey({
      columns: [table.mediumAttributeType],
      foreignColumns: [mediumAttributeTypeInMusicbrainz.id],
      name: 'medium_attribute_type_allowed_format_fk_medium_attribute_type',
    }),
    primaryKey({
      columns: [table.mediumAttributeType, table.mediumFormat],
      name: 'medium_attribute_type_allowed_format_pkey',
    }),
  ],
);

export const mediumAttributeTypeAllowedValueAllowedFormatInMusicbrainz = musicbrainz.table(
  'medium_attribute_type_allowed_value_allowed_format',
  {
    mediumFormat: integer('medium_format').notNull(),
    mediumAttributeTypeAllowedValue: integer('medium_attribute_type_allowed_value').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.mediumFormat],
      foreignColumns: [mediumFormatInMusicbrainz.id],
      name: 'medium_attribute_type_allowed_value_allowed_format_fk_medium_fo',
    }),
    foreignKey({
      columns: [table.mediumAttributeTypeAllowedValue],
      foreignColumns: [mediumAttributeTypeAllowedValueInMusicbrainz.id],
      name: 'medium_attribute_type_allowed_value_allowed_format_fk_medium_at',
    }),
    primaryKey({
      columns: [table.mediumAttributeTypeAllowedValue, table.mediumFormat],
      name: 'medium_attribute_type_allowed_value_allowed_format_pkey',
    }),
  ],
);

export const moodAnnotationInMusicbrainz = musicbrainz.table(
  'mood_annotation',
  {
    mood: integer().notNull(),
    annotation: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.mood],
      foreignColumns: [moodInMusicbrainz.id],
      name: 'mood_annotation_fk_mood',
    }),
    foreignKey({
      columns: [table.annotation],
      foreignColumns: [annotationInMusicbrainz.id],
      name: 'mood_annotation_fk_annotation',
    }),
    primaryKey({ columns: [table.annotation, table.mood], name: 'mood_annotation_pkey' }),
  ],
);

export const placeAnnotationInMusicbrainz = musicbrainz.table(
  'place_annotation',
  {
    place: integer().notNull(),
    annotation: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.place],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'place_annotation_fk_place',
    }),
    foreignKey({
      columns: [table.annotation],
      foreignColumns: [annotationInMusicbrainz.id],
      name: 'place_annotation_fk_annotation',
    }),
    primaryKey({ columns: [table.annotation, table.place], name: 'place_annotation_pkey' }),
  ],
);

export const recordingAnnotationInMusicbrainz = musicbrainz.table(
  'recording_annotation',
  {
    recording: integer().notNull(),
    annotation: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.recording],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'recording_annotation_fk_recording',
    }),
    foreignKey({
      columns: [table.annotation],
      foreignColumns: [annotationInMusicbrainz.id],
      name: 'recording_annotation_fk_annotation',
    }),
    primaryKey({ columns: [table.annotation, table.recording], name: 'recording_annotation_pkey' }),
  ],
);

export const releaseAnnotationInMusicbrainz = musicbrainz.table(
  'release_annotation',
  {
    release: integer().notNull(),
    annotation: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.release],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'release_annotation_fk_release',
    }),
    foreignKey({
      columns: [table.annotation],
      foreignColumns: [annotationInMusicbrainz.id],
      name: 'release_annotation_fk_annotation',
    }),
    primaryKey({ columns: [table.annotation, table.release], name: 'release_annotation_pkey' }),
  ],
);

export const releaseGroupAnnotationInMusicbrainz = musicbrainz.table(
  'release_group_annotation',
  {
    releaseGroup: integer('release_group').notNull(),
    annotation: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.releaseGroup],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'release_group_annotation_fk_release_group',
    }),
    foreignKey({
      columns: [table.annotation],
      foreignColumns: [annotationInMusicbrainz.id],
      name: 'release_group_annotation_fk_annotation',
    }),
    primaryKey({ columns: [table.annotation, table.releaseGroup], name: 'release_group_annotation_pkey' }),
  ],
);

export const seriesAnnotationInMusicbrainz = musicbrainz.table(
  'series_annotation',
  {
    series: integer().notNull(),
    annotation: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.series],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'series_annotation_fk_series',
    }),
    foreignKey({
      columns: [table.annotation],
      foreignColumns: [annotationInMusicbrainz.id],
      name: 'series_annotation_fk_annotation',
    }),
    primaryKey({ columns: [table.annotation, table.series], name: 'series_annotation_pkey' }),
  ],
);

export const workAnnotationInMusicbrainz = musicbrainz.table(
  'work_annotation',
  {
    work: integer().notNull(),
    annotation: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.work],
      foreignColumns: [workInMusicbrainz.id],
      name: 'work_annotation_fk_work',
    }),
    foreignKey({
      columns: [table.annotation],
      foreignColumns: [annotationInMusicbrainz.id],
      name: 'work_annotation_fk_annotation',
    }),
    primaryKey({ columns: [table.annotation, table.work], name: 'work_annotation_pkey' }),
  ],
);

export const alternativeMediumTrackInMusicbrainz = musicbrainz.table(
  'alternative_medium_track',
  {
    alternativeMedium: integer('alternative_medium').notNull(),
    track: integer().notNull(),
    alternativeTrack: integer('alternative_track').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.alternativeMedium],
      foreignColumns: [alternativeMediumInMusicbrainz.id],
      name: 'alternative_medium_track_fk_alternative_medium',
    }),
    foreignKey({
      columns: [table.track],
      foreignColumns: [trackInMusicbrainz.id],
      name: 'alternative_medium_track_fk_track',
    }),
    foreignKey({
      columns: [table.alternativeTrack],
      foreignColumns: [alternativeTrackInMusicbrainz.id],
      name: 'alternative_medium_track_fk_alternative_track',
    }),
    primaryKey({ columns: [table.alternativeMedium, table.track], name: 'alternative_medium_track_pkey' }),
  ],
);

export const areaContainmentInMusicbrainz = musicbrainz.table(
  'area_containment',
  {
    descendant: integer().notNull(),
    parent: integer().notNull(),
    depth: smallint().notNull(),
  },
  (table) => [
    index('area_containment_idx_parent').using('btree', table.parent.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.descendant],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'area_containment_fk_descendant',
    }),
    foreignKey({
      columns: [table.parent],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'area_containment_fk_parent',
    }),
    primaryKey({ columns: [table.descendant, table.parent], name: 'area_containment_pkey' }),
  ],
);

export const artistRatingRawInMusicbrainz = musicbrainz.table(
  'artist_rating_raw',
  {
    artist: integer().notNull(),
    editor: integer().notNull(),
    rating: smallint().notNull(),
  },
  (table) => [
    index('artist_rating_raw_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.artist],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'artist_rating_raw_fk_artist',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'artist_rating_raw_fk_editor',
    }),
    primaryKey({ columns: [table.artist, table.editor], name: 'artist_rating_raw_pkey' }),
    check('artist_rating_raw_rating_check', sql`(rating >= 0) AND (rating <= 100)`),
  ],
);

export const editorLanguageInMusicbrainz = musicbrainz.table(
  'editor_language',
  {
    editor: integer().notNull(),
    language: integer().notNull(),
    fluency: fluencyInMusicbrainz().notNull(),
  },
  (table) => [
    index('editor_language_idx_language').using('btree', table.language.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'editor_language_fk_editor',
    }),
    foreignKey({
      columns: [table.language],
      foreignColumns: [languageInMusicbrainz.id],
      name: 'editor_language_fk_language',
    }),
    primaryKey({ columns: [table.editor, table.language], name: 'editor_language_pkey' }),
  ],
);

export const editArtistInMusicbrainz = musicbrainz.table(
  'edit_artist',
  {
    edit: integer().notNull(),
    artist: integer().notNull(),
    status: smallint().notNull(),
  },
  (table) => [
    index('edit_artist_idx').using('btree', table.artist.asc().nullsLast().op('int4_ops')),
    index('edit_artist_idx_status').using('btree', table.status.asc().nullsLast().op('int2_ops')),
    foreignKey({
      columns: [table.edit],
      foreignColumns: [editInMusicbrainz.id],
      name: 'edit_artist_fk_edit',
    }),
    foreignKey({
      columns: [table.artist],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'edit_artist_fk_artist',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.artist, table.edit], name: 'edit_artist_pkey' }),
  ],
);

export const editLabelInMusicbrainz = musicbrainz.table(
  'edit_label',
  {
    edit: integer().notNull(),
    label: integer().notNull(),
    status: smallint().notNull(),
  },
  (table) => [
    index('edit_label_idx').using('btree', table.label.asc().nullsLast().op('int4_ops')),
    index('edit_label_idx_status').using('btree', table.status.asc().nullsLast().op('int2_ops')),
    foreignKey({
      columns: [table.edit],
      foreignColumns: [editInMusicbrainz.id],
      name: 'edit_label_fk_edit',
    }),
    foreignKey({
      columns: [table.label],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'edit_label_fk_label',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.edit, table.label], name: 'edit_label_pkey' }),
  ],
);

export const editorSubscribeArtistDeletedInMusicbrainz = musicbrainz.table(
  'editor_subscribe_artist_deleted',
  {
    editor: integer().notNull(),
    gid: uuid().notNull(),
    deletedBy: integer('deleted_by').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'editor_subscribe_artist_deleted_fk_editor',
    }),
    foreignKey({
      columns: [table.gid],
      foreignColumns: [deletedEntityInMusicbrainz.gid],
      name: 'editor_subscribe_artist_deleted_fk_gid',
    }),
    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [editInMusicbrainz.id],
      name: 'editor_subscribe_artist_deleted_fk_deleted_by',
    }),
    primaryKey({ columns: [table.editor, table.gid], name: 'editor_subscribe_artist_deleted_pkey' }),
  ],
);

export const editorSubscribeLabelDeletedInMusicbrainz = musicbrainz.table(
  'editor_subscribe_label_deleted',
  {
    editor: integer().notNull(),
    gid: uuid().notNull(),
    deletedBy: integer('deleted_by').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'editor_subscribe_label_deleted_fk_editor',
    }),
    foreignKey({
      columns: [table.gid],
      foreignColumns: [deletedEntityInMusicbrainz.gid],
      name: 'editor_subscribe_label_deleted_fk_gid',
    }),
    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [editInMusicbrainz.id],
      name: 'editor_subscribe_label_deleted_fk_deleted_by',
    }),
    primaryKey({ columns: [table.editor, table.gid], name: 'editor_subscribe_label_deleted_pkey' }),
  ],
);

export const editorSubscribeSeriesDeletedInMusicbrainz = musicbrainz.table(
  'editor_subscribe_series_deleted',
  {
    editor: integer().notNull(),
    gid: uuid().notNull(),
    deletedBy: integer('deleted_by').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'editor_subscribe_series_deleted_fk_editor',
    }),
    foreignKey({
      columns: [table.gid],
      foreignColumns: [deletedEntityInMusicbrainz.gid],
      name: 'editor_subscribe_series_deleted_fk_gid',
    }),
    foreignKey({
      columns: [table.deletedBy],
      foreignColumns: [editInMusicbrainz.id],
      name: 'editor_subscribe_series_deleted_fk_deleted_by',
    }),
    primaryKey({ columns: [table.editor, table.gid], name: 'editor_subscribe_series_deleted_pkey' }),
  ],
);

export const eventRatingRawInMusicbrainz = musicbrainz.table(
  'event_rating_raw',
  {
    event: integer().notNull(),
    editor: integer().notNull(),
    rating: smallint().notNull(),
  },
  (table) => [
    index('event_rating_raw_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.event],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'event_rating_raw_fk_event',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'event_rating_raw_fk_editor',
    }),
    primaryKey({ columns: [table.editor, table.event], name: 'event_rating_raw_pkey' }),
    check('event_rating_raw_rating_check', sql`(rating >= 0) AND (rating <= 100)`),
  ],
);

export const labelRatingRawInMusicbrainz = musicbrainz.table(
  'label_rating_raw',
  {
    label: integer().notNull(),
    editor: integer().notNull(),
    rating: smallint().notNull(),
  },
  (table) => [
    index('label_rating_raw_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.label],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'label_rating_raw_fk_label',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'label_rating_raw_fk_editor',
    }),
    primaryKey({ columns: [table.editor, table.label], name: 'label_rating_raw_pkey' }),
    check('label_rating_raw_rating_check', sql`(rating >= 0) AND (rating <= 100)`),
  ],
);

export const linkAttributeTextValueInMusicbrainz = musicbrainz.table(
  'link_attribute_text_value',
  {
    link: integer().notNull(),
    attributeType: integer('attribute_type').notNull(),
    textValue: text('text_value').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'link_attribute_text_value_fk_link',
    }),
    foreignKey({
      columns: [table.attributeType],
      foreignColumns: [linkTextAttributeTypeInMusicbrainz.attributeType],
      name: 'link_attribute_text_value_fk_attribute_type',
    }),
    primaryKey({ columns: [table.attributeType, table.link], name: 'link_attribute_text_value_pkey' }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace(text_value`),
    check('only_non_empty', sql`text_value <> ''::text`),
  ],
);

export const linkAttributeInMusicbrainz = musicbrainz.table(
  'link_attribute',
  {
    link: integer().notNull(),
    attributeType: integer('attribute_type').notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'link_attribute_fk_link',
    }),
    foreignKey({
      columns: [table.attributeType],
      foreignColumns: [linkAttributeTypeInMusicbrainz.id],
      name: 'link_attribute_fk_attribute_type',
    }),
    primaryKey({ columns: [table.attributeType, table.link], name: 'link_attribute_pkey' }),
  ],
);

export const linkAttributeCreditInMusicbrainz = musicbrainz.table(
  'link_attribute_credit',
  {
    link: integer().notNull(),
    attributeType: integer('attribute_type').notNull(),
    creditedAs: text('credited_as').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.link],
      foreignColumns: [linkInMusicbrainz.id],
      name: 'link_attribute_credit_fk_link',
    }),
    foreignKey({
      columns: [table.attributeType],
      foreignColumns: [linkCreditableAttributeTypeInMusicbrainz.attributeType],
      name: 'link_attribute_credit_fk_attribute_type',
    }),
    primaryKey({ columns: [table.attributeType, table.link], name: 'link_attribute_credit_pkey' }),
  ],
);

export const placeRatingRawInMusicbrainz = musicbrainz.table(
  'place_rating_raw',
  {
    place: integer().notNull(),
    editor: integer().notNull(),
    rating: smallint().notNull(),
  },
  (table) => [
    index('place_rating_raw_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.place],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'place_rating_raw_fk_place',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'place_rating_raw_fk_editor',
    }),
    primaryKey({ columns: [table.editor, table.place], name: 'place_rating_raw_pkey' }),
    check('place_rating_raw_rating_check', sql`(rating >= 0) AND (rating <= 100)`),
  ],
);

export const recordingRatingRawInMusicbrainz = musicbrainz.table(
  'recording_rating_raw',
  {
    recording: integer().notNull(),
    editor: integer().notNull(),
    rating: smallint().notNull(),
  },
  (table) => [
    index('recording_rating_raw_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.recording],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'recording_rating_raw_fk_recording',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'recording_rating_raw_fk_editor',
    }),
    primaryKey({ columns: [table.editor, table.recording], name: 'recording_rating_raw_pkey' }),
    check('recording_rating_raw_rating_check', sql`(rating >= 0) AND (rating <= 100)`),
  ],
);

export const releaseGroupRatingRawInMusicbrainz = musicbrainz.table(
  'release_group_rating_raw',
  {
    releaseGroup: integer('release_group').notNull(),
    editor: integer().notNull(),
    rating: smallint().notNull(),
  },
  (table) => [
    index('release_group_rating_raw_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.releaseGroup],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'release_group_rating_raw_fk_release_group',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'release_group_rating_raw_fk_editor',
    }),
    primaryKey({ columns: [table.editor, table.releaseGroup], name: 'release_group_rating_raw_pkey' }),
    check('release_group_rating_raw_rating_check', sql`(rating >= 0) AND (rating <= 100)`),
  ],
);

export const releaseGroupSecondaryTypeJoinInMusicbrainz = musicbrainz.table(
  'release_group_secondary_type_join',
  {
    releaseGroup: integer('release_group').notNull(),
    secondaryType: integer('secondary_type').notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.releaseGroup],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'release_group_secondary_type_join_fk_release_group',
    }),
    foreignKey({
      columns: [table.secondaryType],
      foreignColumns: [releaseGroupSecondaryTypeInMusicbrainz.id],
      name: 'release_group_secondary_type_join_fk_secondary_type',
    }),
    primaryKey({ columns: [table.releaseGroup, table.secondaryType], name: 'release_group_secondary_type_join_pkey' }),
  ],
);

export const unreferencedRowLogInMusicbrainz = musicbrainz.table(
  'unreferenced_row_log',
  {
    tableName: varchar('table_name').notNull(),
    rowId: integer('row_id').notNull(),
    inserted: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('unreferenced_row_log_idx_inserted').using(
      'brin',
      table.inserted.asc().nullsLast().op('timestamptz_minmax_ops'),
    ),
    primaryKey({ columns: [table.rowId, table.tableName], name: 'unreferenced_row_log_pkey' }),
  ],
);

export const workRatingRawInMusicbrainz = musicbrainz.table(
  'work_rating_raw',
  {
    work: integer().notNull(),
    editor: integer().notNull(),
    rating: smallint().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.work],
      foreignColumns: [workInMusicbrainz.id],
      name: 'work_rating_raw_fk_work',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'work_rating_raw_fk_editor',
    }),
    primaryKey({ columns: [table.editor, table.work], name: 'work_rating_raw_pkey' }),
    check('work_rating_raw_rating_check', sql`(rating >= 0) AND (rating <= 100)`),
  ],
);

export const areaTagInMusicbrainz = musicbrainz.table(
  'area_tag',
  {
    area: integer().notNull(),
    tag: integer().notNull(),
    count: integer().notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('area_tag_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.area],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'area_tag_fk_area',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'area_tag_fk_tag',
    }),
    primaryKey({ columns: [table.area, table.tag], name: 'area_tag_pkey' }),
  ],
);

export const areaTagRawInMusicbrainz = musicbrainz.table(
  'area_tag_raw',
  {
    area: integer().notNull(),
    editor: integer().notNull(),
    tag: integer().notNull(),
    isUpvote: boolean('is_upvote').default(true).notNull(),
  },
  (table) => [
    index('area_tag_raw_idx_area').using('btree', table.area.asc().nullsLast().op('int4_ops')),
    index('area_tag_raw_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    index('area_tag_raw_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.area],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'area_tag_raw_fk_area',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'area_tag_raw_fk_editor',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'area_tag_raw_fk_tag',
    }),
    primaryKey({ columns: [table.area, table.editor, table.tag], name: 'area_tag_raw_pkey' }),
  ],
);

export const artistTagInMusicbrainz = musicbrainz.table(
  'artist_tag',
  {
    artist: integer().notNull(),
    tag: integer().notNull(),
    count: integer().notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('artist_tag_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.artist],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'artist_tag_fk_artist',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'artist_tag_fk_tag',
    }),
    primaryKey({ columns: [table.artist, table.tag], name: 'artist_tag_pkey' }),
  ],
);

export const artistTagRawInMusicbrainz = musicbrainz.table(
  'artist_tag_raw',
  {
    artist: integer().notNull(),
    editor: integer().notNull(),
    tag: integer().notNull(),
    isUpvote: boolean('is_upvote').default(true).notNull(),
  },
  (table) => [
    index('artist_tag_raw_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    index('artist_tag_raw_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.artist],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'artist_tag_raw_fk_artist',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'artist_tag_raw_fk_editor',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'artist_tag_raw_fk_tag',
    }),
    primaryKey({ columns: [table.artist, table.editor, table.tag], name: 'artist_tag_raw_pkey' }),
  ],
);

export const artistIpiInMusicbrainz = musicbrainz.table(
  'artist_ipi',
  {
    artist: integer().notNull(),
    ipi: char({ length: 11 }).notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.artist],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'artist_ipi_fk_artist',
    }),
    primaryKey({ columns: [table.artist, table.ipi], name: 'artist_ipi_pkey' }),
    check('artist_ipi_edits_pending_check', sql`edits_pending >= 0`),
    check('artist_ipi_ipi_check', sql`ipi ~ '^\d{11}$'::text`),
  ],
);

export const artistIsniInMusicbrainz = musicbrainz.table(
  'artist_isni',
  {
    artist: integer().notNull(),
    isni: char({ length: 16 }).notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.artist],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'artist_isni_fk_artist',
    }),
    primaryKey({ columns: [table.artist, table.isni], name: 'artist_isni_pkey' }),
    check('artist_isni_edits_pending_check', sql`edits_pending >= 0`),
    check('artist_isni_isni_check', sql`isni ~ '^\d{15}[\dX]$'::text`),
  ],
);

export const eventTagRawInMusicbrainz = musicbrainz.table(
  'event_tag_raw',
  {
    event: integer().notNull(),
    editor: integer().notNull(),
    tag: integer().notNull(),
    isUpvote: boolean('is_upvote').default(true).notNull(),
  },
  (table) => [
    index('event_tag_raw_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    index('event_tag_raw_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.event],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'event_tag_raw_fk_event',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'event_tag_raw_fk_editor',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'event_tag_raw_fk_tag',
    }),
    primaryKey({ columns: [table.editor, table.event, table.tag], name: 'event_tag_raw_pkey' }),
  ],
);

export const eventTagInMusicbrainz = musicbrainz.table(
  'event_tag',
  {
    event: integer().notNull(),
    tag: integer().notNull(),
    count: integer().notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('event_tag_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.event],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'event_tag_fk_event',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'event_tag_fk_tag',
    }),
    primaryKey({ columns: [table.event, table.tag], name: 'event_tag_pkey' }),
  ],
);

export const instrumentTagInMusicbrainz = musicbrainz.table(
  'instrument_tag',
  {
    instrument: integer().notNull(),
    tag: integer().notNull(),
    count: integer().notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('instrument_tag_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.instrument],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'instrument_tag_fk_instrument',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'instrument_tag_fk_tag',
    }),
    primaryKey({ columns: [table.instrument, table.tag], name: 'instrument_tag_pkey' }),
  ],
);

export const instrumentTagRawInMusicbrainz = musicbrainz.table(
  'instrument_tag_raw',
  {
    instrument: integer().notNull(),
    editor: integer().notNull(),
    tag: integer().notNull(),
    isUpvote: boolean('is_upvote').default(true).notNull(),
  },
  (table) => [
    index('instrument_tag_raw_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    index('instrument_tag_raw_idx_instrument').using('btree', table.instrument.asc().nullsLast().op('int4_ops')),
    index('instrument_tag_raw_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.instrument],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'instrument_tag_raw_fk_instrument',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'instrument_tag_raw_fk_editor',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'instrument_tag_raw_fk_tag',
    }),
    primaryKey({ columns: [table.editor, table.instrument, table.tag], name: 'instrument_tag_raw_pkey' }),
  ],
);

export const labelIsniInMusicbrainz = musicbrainz.table(
  'label_isni',
  {
    label: integer().notNull(),
    isni: char({ length: 16 }).notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.label],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'label_isni_fk_label',
    }),
    primaryKey({ columns: [table.isni, table.label], name: 'label_isni_pkey' }),
    check('label_isni_edits_pending_check', sql`edits_pending >= 0`),
    check('label_isni_isni_check', sql`isni ~ '^\d{15}[\dX]$'::text`),
  ],
);

export const labelTagInMusicbrainz = musicbrainz.table(
  'label_tag',
  {
    label: integer().notNull(),
    tag: integer().notNull(),
    count: integer().notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('label_tag_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.label],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'label_tag_fk_label',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'label_tag_fk_tag',
    }),
    primaryKey({ columns: [table.label, table.tag], name: 'label_tag_pkey' }),
  ],
);

export const labelTagRawInMusicbrainz = musicbrainz.table(
  'label_tag_raw',
  {
    label: integer().notNull(),
    editor: integer().notNull(),
    tag: integer().notNull(),
    isUpvote: boolean('is_upvote').default(true).notNull(),
  },
  (table) => [
    index('label_tag_raw_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    index('label_tag_raw_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.label],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'label_tag_raw_fk_label',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'label_tag_raw_fk_editor',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'label_tag_raw_fk_tag',
    }),
    primaryKey({ columns: [table.editor, table.label, table.tag], name: 'label_tag_raw_pkey' }),
  ],
);

export const labelIpiInMusicbrainz = musicbrainz.table(
  'label_ipi',
  {
    label: integer().notNull(),
    ipi: char({ length: 11 }).notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.label],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'label_ipi_fk_label',
    }),
    primaryKey({ columns: [table.ipi, table.label], name: 'label_ipi_pkey' }),
    check('label_ipi_edits_pending_check', sql`edits_pending >= 0`),
    check('label_ipi_ipi_check', sql`ipi ~ '^\d{11}$'::text`),
  ],
);

export const placeTagInMusicbrainz = musicbrainz.table(
  'place_tag',
  {
    place: integer().notNull(),
    tag: integer().notNull(),
    count: integer().notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('place_tag_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.place],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'place_tag_fk_place',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'place_tag_fk_tag',
    }),
    primaryKey({ columns: [table.place, table.tag], name: 'place_tag_pkey' }),
  ],
);

export const placeTagRawInMusicbrainz = musicbrainz.table(
  'place_tag_raw',
  {
    place: integer().notNull(),
    editor: integer().notNull(),
    tag: integer().notNull(),
    isUpvote: boolean('is_upvote').default(true).notNull(),
  },
  (table) => [
    index('place_tag_raw_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    index('place_tag_raw_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.place],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'place_tag_raw_fk_place',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'place_tag_raw_fk_editor',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'place_tag_raw_fk_tag',
    }),
    primaryKey({ columns: [table.editor, table.place, table.tag], name: 'place_tag_raw_pkey' }),
  ],
);

export const recordingTagInMusicbrainz = musicbrainz.table(
  'recording_tag',
  {
    recording: integer().notNull(),
    tag: integer().notNull(),
    count: integer().notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('recording_tag_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.recording],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'recording_tag_fk_recording',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'recording_tag_fk_tag',
    }),
    primaryKey({ columns: [table.recording, table.tag], name: 'recording_tag_pkey' }),
  ],
);

export const recordingTagRawInMusicbrainz = musicbrainz.table(
  'recording_tag_raw',
  {
    recording: integer().notNull(),
    editor: integer().notNull(),
    tag: integer().notNull(),
    isUpvote: boolean('is_upvote').default(true).notNull(),
  },
  (table) => [
    index('recording_tag_raw_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    index('recording_tag_raw_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    index('recording_tag_raw_idx_track').using('btree', table.recording.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.recording],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'recording_tag_raw_fk_recording',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'recording_tag_raw_fk_editor',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'recording_tag_raw_fk_tag',
    }),
    primaryKey({ columns: [table.editor, table.recording, table.tag], name: 'recording_tag_raw_pkey' }),
  ],
);

export const releaseTagInMusicbrainz = musicbrainz.table(
  'release_tag',
  {
    release: integer().notNull(),
    tag: integer().notNull(),
    count: integer().notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('release_tag_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.release],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'release_tag_fk_release',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'release_tag_fk_tag',
    }),
    primaryKey({ columns: [table.release, table.tag], name: 'release_tag_pkey' }),
  ],
);

export const releaseTagRawInMusicbrainz = musicbrainz.table(
  'release_tag_raw',
  {
    release: integer().notNull(),
    editor: integer().notNull(),
    tag: integer().notNull(),
    isUpvote: boolean('is_upvote').default(true).notNull(),
  },
  (table) => [
    index('release_tag_raw_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    index('release_tag_raw_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.release],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'release_tag_raw_fk_release',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'release_tag_raw_fk_editor',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'release_tag_raw_fk_tag',
    }),
    primaryKey({ columns: [table.editor, table.release, table.tag], name: 'release_tag_raw_pkey' }),
  ],
);

export const releaseGroupTagInMusicbrainz = musicbrainz.table(
  'release_group_tag',
  {
    releaseGroup: integer('release_group').notNull(),
    tag: integer().notNull(),
    count: integer().notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('release_group_tag_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.releaseGroup],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'release_group_tag_fk_release_group',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'release_group_tag_fk_tag',
    }),
    primaryKey({ columns: [table.releaseGroup, table.tag], name: 'release_group_tag_pkey' }),
  ],
);

export const releaseGroupTagRawInMusicbrainz = musicbrainz.table(
  'release_group_tag_raw',
  {
    releaseGroup: integer('release_group').notNull(),
    editor: integer().notNull(),
    tag: integer().notNull(),
    isUpvote: boolean('is_upvote').default(true).notNull(),
  },
  (table) => [
    index('release_group_tag_raw_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    index('release_group_tag_raw_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.releaseGroup],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'release_group_tag_raw_fk_release_group',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'release_group_tag_raw_fk_editor',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'release_group_tag_raw_fk_tag',
    }),
    primaryKey({ columns: [table.editor, table.releaseGroup, table.tag], name: 'release_group_tag_raw_pkey' }),
  ],
);

export const seriesTagRawInMusicbrainz = musicbrainz.table(
  'series_tag_raw',
  {
    series: integer().notNull(),
    editor: integer().notNull(),
    tag: integer().notNull(),
    isUpvote: boolean('is_upvote').default(true).notNull(),
  },
  (table) => [
    index('series_tag_raw_idx_editor').using('btree', table.editor.asc().nullsLast().op('int4_ops')),
    index('series_tag_raw_idx_series').using('btree', table.series.asc().nullsLast().op('int4_ops')),
    index('series_tag_raw_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.series],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'series_tag_raw_fk_series',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'series_tag_raw_fk_editor',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'series_tag_raw_fk_tag',
    }),
    primaryKey({ columns: [table.editor, table.series, table.tag], name: 'series_tag_raw_pkey' }),
  ],
);

export const tagRelationInMusicbrainz = musicbrainz.table(
  'tag_relation',
  {
    tag1: integer().notNull(),
    tag2: integer().notNull(),
    weight: integer().notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.tag1],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'tag_relation_fk_tag1',
    }),
    foreignKey({
      columns: [table.tag2],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'tag_relation_fk_tag2',
    }),
    primaryKey({ columns: [table.tag1, table.tag2], name: 'tag_relation_pkey' }),
    check('tag_relation_check', sql`tag1 < tag2`),
  ],
);

export const seriesTagInMusicbrainz = musicbrainz.table(
  'series_tag',
  {
    series: integer().notNull(),
    tag: integer().notNull(),
    count: integer().notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('series_tag_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.series],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'series_tag_fk_series',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'series_tag_fk_tag',
    }),
    primaryKey({ columns: [table.series, table.tag], name: 'series_tag_pkey' }),
  ],
);

export const workTagInMusicbrainz = musicbrainz.table(
  'work_tag',
  {
    work: integer().notNull(),
    tag: integer().notNull(),
    count: integer().notNull(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('work_tag_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.work],
      foreignColumns: [workInMusicbrainz.id],
      name: 'work_tag_fk_work',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'work_tag_fk_tag',
    }),
    primaryKey({ columns: [table.tag, table.work], name: 'work_tag_pkey' }),
  ],
);

export const workLanguageInMusicbrainz = musicbrainz.table(
  'work_language',
  {
    work: integer().notNull(),
    language: integer().notNull(),
    editsPending: integer('edits_pending').default(0).notNull(),
    created: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.work],
      foreignColumns: [workInMusicbrainz.id],
      name: 'work_language_fk_work',
    }),
    foreignKey({
      columns: [table.language],
      foreignColumns: [languageInMusicbrainz.id],
      name: 'work_language_fk_language',
    }),
    primaryKey({ columns: [table.language, table.work], name: 'work_language_pkey' }),
    check('work_language_edits_pending_check', sql`edits_pending >= 0`),
  ],
);

export const workTagRawInMusicbrainz = musicbrainz.table(
  'work_tag_raw',
  {
    work: integer().notNull(),
    editor: integer().notNull(),
    tag: integer().notNull(),
    isUpvote: boolean('is_upvote').default(true).notNull(),
  },
  (table) => [
    index('work_tag_raw_idx_tag').using('btree', table.tag.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.work],
      foreignColumns: [workInMusicbrainz.id],
      name: 'work_tag_raw_fk_work',
    }),
    foreignKey({
      columns: [table.editor],
      foreignColumns: [editorInMusicbrainz.id],
      name: 'work_tag_raw_fk_editor',
    }),
    foreignKey({
      columns: [table.tag],
      foreignColumns: [tagInMusicbrainz.id],
      name: 'work_tag_raw_fk_tag',
    }),
    primaryKey({ columns: [table.editor, table.tag, table.work], name: 'work_tag_raw_pkey' }),
  ],
);

export const artistCreditNameInMusicbrainz = musicbrainz.table(
  'artist_credit_name',
  {
    artistCredit: integer('artist_credit').notNull(),
    position: smallint().notNull(),
    artist: integer().notNull(),
    name: varchar().notNull(),
    joinPhrase: text('join_phrase').default('').notNull(),
  },
  (table) => [
    index('artist_credit_name_idx_artist').using('btree', table.artist.asc().nullsLast().op('int4_ops')),
    index('artist_credit_name_idx_musicbrainz_collate').using('btree', table.name.asc().nullsLast().op('text_ops')),
    foreignKey({
      columns: [table.artistCredit],
      foreignColumns: [artistCreditInMusicbrainz.id],
      name: 'artist_credit_name_fk_artist_credit',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.artist],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'artist_credit_name_fk_artist',
    }).onDelete('cascade'),
    primaryKey({ columns: [table.artistCredit, table.position], name: 'artist_credit_name_pkey' }),
    check('control_for_whitespace', sql`CHECK (musicbrainz.controlled_for_whitespace((name)::text`),
    check('only_non_empty', sql`(name)::text <> ''::text`),
  ],
);

export const linkTypeAttributeTypeInMusicbrainz = musicbrainz.table(
  'link_type_attribute_type',
  {
    linkType: integer('link_type').notNull(),
    attributeType: integer('attribute_type').notNull(),
    min: smallint(),
    max: smallint(),
    lastUpdated: timestamp('last_updated', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.linkType],
      foreignColumns: [linkTypeInMusicbrainz.id],
      name: 'link_type_attribute_type_fk_link_type',
    }),
    foreignKey({
      columns: [table.attributeType],
      foreignColumns: [linkAttributeTypeInMusicbrainz.id],
      name: 'link_type_attribute_type_fk_attribute_type',
    }),
    primaryKey({ columns: [table.attributeType, table.linkType], name: 'link_type_attribute_type_pkey' }),
  ],
);

export const editorCollectionAreaInMusicbrainz = musicbrainz.table(
  'editor_collection_area',
  {
    collection: integer().notNull(),
    area: integer().notNull(),
    added: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
    position: integer().default(0).notNull(),
    comment: text().default('').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.collection],
      foreignColumns: [editorCollectionInMusicbrainz.id],
      name: 'editor_collection_area_fk_collection',
    }),
    foreignKey({
      columns: [table.area],
      foreignColumns: [areaInMusicbrainz.id],
      name: 'editor_collection_area_fk_area',
    }),
    primaryKey({ columns: [table.area, table.collection], name: 'editor_collection_area_pkey' }),
    check('editor_collection_area_position_check', sql`"position" >= 0`),
  ],
);

export const editorCollectionArtistInMusicbrainz = musicbrainz.table(
  'editor_collection_artist',
  {
    collection: integer().notNull(),
    artist: integer().notNull(),
    added: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
    position: integer().default(0).notNull(),
    comment: text().default('').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.collection],
      foreignColumns: [editorCollectionInMusicbrainz.id],
      name: 'editor_collection_artist_fk_collection',
    }),
    foreignKey({
      columns: [table.artist],
      foreignColumns: [artistInMusicbrainz.id],
      name: 'editor_collection_artist_fk_artist',
    }),
    primaryKey({ columns: [table.artist, table.collection], name: 'editor_collection_artist_pkey' }),
    check('editor_collection_artist_position_check', sql`"position" >= 0`),
  ],
);

export const editorCollectionEventInMusicbrainz = musicbrainz.table(
  'editor_collection_event',
  {
    collection: integer().notNull(),
    event: integer().notNull(),
    added: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
    position: integer().default(0).notNull(),
    comment: text().default('').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.collection],
      foreignColumns: [editorCollectionInMusicbrainz.id],
      name: 'editor_collection_event_fk_collection',
    }),
    foreignKey({
      columns: [table.event],
      foreignColumns: [eventInMusicbrainz.id],
      name: 'editor_collection_event_fk_event',
    }),
    primaryKey({ columns: [table.collection, table.event], name: 'editor_collection_event_pkey' }),
    check('editor_collection_event_position_check', sql`"position" >= 0`),
  ],
);

export const editorCollectionGenreInMusicbrainz = musicbrainz.table(
  'editor_collection_genre',
  {
    collection: integer().notNull(),
    genre: integer().notNull(),
    added: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
    position: integer().default(0).notNull(),
    comment: text().default('').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.collection],
      foreignColumns: [editorCollectionInMusicbrainz.id],
      name: 'editor_collection_genre_fk_collection',
    }),
    foreignKey({
      columns: [table.genre],
      foreignColumns: [genreInMusicbrainz.id],
      name: 'editor_collection_genre_fk_genre',
    }),
    primaryKey({ columns: [table.collection, table.genre], name: 'editor_collection_genre_pkey' }),
    check('editor_collection_genre_position_check', sql`"position" >= 0`),
  ],
);

export const editorCollectionInstrumentInMusicbrainz = musicbrainz.table(
  'editor_collection_instrument',
  {
    collection: integer().notNull(),
    instrument: integer().notNull(),
    added: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
    position: integer().default(0).notNull(),
    comment: text().default('').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.collection],
      foreignColumns: [editorCollectionInMusicbrainz.id],
      name: 'editor_collection_instrument_fk_collection',
    }),
    foreignKey({
      columns: [table.instrument],
      foreignColumns: [instrumentInMusicbrainz.id],
      name: 'editor_collection_instrument_fk_instrument',
    }),
    primaryKey({ columns: [table.collection, table.instrument], name: 'editor_collection_instrument_pkey' }),
    check('editor_collection_instrument_position_check', sql`"position" >= 0`),
  ],
);

export const editorCollectionLabelInMusicbrainz = musicbrainz.table(
  'editor_collection_label',
  {
    collection: integer().notNull(),
    label: integer().notNull(),
    added: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
    position: integer().default(0).notNull(),
    comment: text().default('').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.collection],
      foreignColumns: [editorCollectionInMusicbrainz.id],
      name: 'editor_collection_label_fk_collection',
    }),
    foreignKey({
      columns: [table.label],
      foreignColumns: [labelInMusicbrainz.id],
      name: 'editor_collection_label_fk_label',
    }),
    primaryKey({ columns: [table.collection, table.label], name: 'editor_collection_label_pkey' }),
    check('editor_collection_label_position_check', sql`"position" >= 0`),
  ],
);

export const editorCollectionPlaceInMusicbrainz = musicbrainz.table(
  'editor_collection_place',
  {
    collection: integer().notNull(),
    place: integer().notNull(),
    added: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
    position: integer().default(0).notNull(),
    comment: text().default('').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.collection],
      foreignColumns: [editorCollectionInMusicbrainz.id],
      name: 'editor_collection_place_fk_collection',
    }),
    foreignKey({
      columns: [table.place],
      foreignColumns: [placeInMusicbrainz.id],
      name: 'editor_collection_place_fk_place',
    }),
    primaryKey({ columns: [table.collection, table.place], name: 'editor_collection_place_pkey' }),
    check('editor_collection_place_position_check', sql`"position" >= 0`),
  ],
);

export const editorCollectionRecordingInMusicbrainz = musicbrainz.table(
  'editor_collection_recording',
  {
    collection: integer().notNull(),
    recording: integer().notNull(),
    added: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
    position: integer().default(0).notNull(),
    comment: text().default('').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.collection],
      foreignColumns: [editorCollectionInMusicbrainz.id],
      name: 'editor_collection_recording_fk_collection',
    }),
    foreignKey({
      columns: [table.recording],
      foreignColumns: [recordingInMusicbrainz.id],
      name: 'editor_collection_recording_fk_recording',
    }),
    primaryKey({ columns: [table.collection, table.recording], name: 'editor_collection_recording_pkey' }),
    check('editor_collection_recording_position_check', sql`"position" >= 0`),
  ],
);

export const editorCollectionReleaseInMusicbrainz = musicbrainz.table(
  'editor_collection_release',
  {
    collection: integer().notNull(),
    release: integer().notNull(),
    added: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
    position: integer().default(0).notNull(),
    comment: text().default('').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.collection],
      foreignColumns: [editorCollectionInMusicbrainz.id],
      name: 'editor_collection_release_fk_collection',
    }),
    foreignKey({
      columns: [table.release],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'editor_collection_release_fk_release',
    }),
    primaryKey({ columns: [table.collection, table.release], name: 'editor_collection_release_pkey' }),
    check('editor_collection_release_position_check', sql`"position" >= 0`),
  ],
);

export const editorCollectionDeletedEntityInMusicbrainz = musicbrainz.table(
  'editor_collection_deleted_entity',
  {
    collection: integer().notNull(),
    gid: uuid().notNull(),
    added: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
    position: integer().default(0).notNull(),
    comment: text().default('').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.collection],
      foreignColumns: [editorCollectionInMusicbrainz.id],
      name: 'editor_collection_deleted_entity_fk_collection',
    }),
    foreignKey({
      columns: [table.gid],
      foreignColumns: [deletedEntityInMusicbrainz.gid],
      name: 'editor_collection_deleted_entity_fk_gid',
    }),
    primaryKey({ columns: [table.collection, table.gid], name: 'editor_collection_deleted_entity_pkey' }),
    check('editor_collection_deleted_entity_position_check', sql`"position" >= 0`),
  ],
);

export const editorCollectionReleaseGroupInMusicbrainz = musicbrainz.table(
  'editor_collection_release_group',
  {
    collection: integer().notNull(),
    releaseGroup: integer('release_group').notNull(),
    added: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
    position: integer().default(0).notNull(),
    comment: text().default('').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.collection],
      foreignColumns: [editorCollectionInMusicbrainz.id],
      name: 'editor_collection_release_group_fk_collection',
    }),
    foreignKey({
      columns: [table.releaseGroup],
      foreignColumns: [releaseGroupInMusicbrainz.id],
      name: 'editor_collection_release_group_fk_release_group',
    }),
    primaryKey({ columns: [table.collection, table.releaseGroup], name: 'editor_collection_release_group_pkey' }),
    check('editor_collection_release_group_position_check', sql`"position" >= 0`),
  ],
);

export const editorCollectionSeriesInMusicbrainz = musicbrainz.table(
  'editor_collection_series',
  {
    collection: integer().notNull(),
    series: integer().notNull(),
    added: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
    position: integer().default(0).notNull(),
    comment: text().default('').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.collection],
      foreignColumns: [editorCollectionInMusicbrainz.id],
      name: 'editor_collection_series_fk_collection',
    }),
    foreignKey({
      columns: [table.series],
      foreignColumns: [seriesInMusicbrainz.id],
      name: 'editor_collection_series_fk_series',
    }),
    primaryKey({ columns: [table.collection, table.series], name: 'editor_collection_series_pkey' }),
    check('editor_collection_series_position_check', sql`"position" >= 0`),
  ],
);

export const editorCollectionWorkInMusicbrainz = musicbrainz.table(
  'editor_collection_work',
  {
    collection: integer().notNull(),
    work: integer().notNull(),
    added: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
    position: integer().default(0).notNull(),
    comment: text().default('').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.collection],
      foreignColumns: [editorCollectionInMusicbrainz.id],
      name: 'editor_collection_work_fk_collection',
    }),
    foreignKey({
      columns: [table.work],
      foreignColumns: [workInMusicbrainz.id],
      name: 'editor_collection_work_fk_work',
    }),
    primaryKey({ columns: [table.collection, table.work], name: 'editor_collection_work_pkey' }),
    check('editor_collection_work_position_check', sql`"position" >= 0`),
  ],
);

export const releaseCountryInMusicbrainz = musicbrainz.table(
  'release_country',
  {
    release: integer().notNull(),
    country: integer().notNull(),
    dateYear: smallint('date_year'),
    dateMonth: smallint('date_month'),
    dateDay: smallint('date_day'),
  },
  (table) => [
    index('release_country_idx_country').using('btree', table.country.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.release],
      foreignColumns: [releaseInMusicbrainz.id],
      name: 'release_country_fk_release',
    }),
    foreignKey({
      columns: [table.country],
      foreignColumns: [countryAreaInMusicbrainz.area],
      name: 'release_country_fk_country',
    }),
    primaryKey({ columns: [table.country, table.release], name: 'release_country_pkey' }),
  ],
);
