// documents.id is varchar(255), and document_chunks.document_id, which references it, is
// varchar(30). PostgreSQL allows a foreign key between columns of different widths and only
// complains when a value that fits the parent is copied into the narrower child, which is what
// happens the moment either table is populated. The application never hits it because its own ids
// are short, so nothing in the schema records the real bound.
//
// A seeder makes latent mismatches like this visible: the library generates a parent value the
// parent's own type allows, copies it into the child as a foreign key must, and the database
// rejects it. The remedy is to generate the parent within the narrowest bound anything references
// it by.
import { randomWords } from 'drizzle-super-seed';

const NARROWEST_REFERENCE = 30;

export const narrowReferenceRules: Record<string, Record<string, unknown>> = {
  documents: { id: randomWords({ minLength: 8, maxLength: NARROWEST_REFERENCE }) },
};
