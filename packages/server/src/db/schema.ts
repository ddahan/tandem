// Structured data that doesn't belong in the Markdown files. The files are the source of truth
// for content and tree shape; these tables add identity, order, tags, history and authorship.
// The full-text index (`notes_fts`) is a raw FTS5 table, created in the migrations.
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Pages and folders. A folder row exists only for a folder without a same-named page. */
export const nodes = sqliteTable(
  'nodes',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['page', 'folder'] }).notNull(),
    /** Relative to the data folder, with `/`. Pages end with `.md`. */
    path: text('path').notNull().unique(),
    /** Order among siblings (ascending). */
    position: real('position').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    /**
     * Pages: the content as last read or written, its hash, and the file's mtime and size then.
     * Keeping the content lets an external edit be diffed (authorship) and snapshotted (history)
     * against what the file contained before.
     */
    content: text('content'),
    hash: text('hash'),
    mtime: real('mtime'),
    size: integer('size'),
    /** Pages: author and time of the last save, for editing sessions (history). */
    lastAuthor: text('last_author'),
    lastSaveAt: integer('last_save_at'),
    /** True when the current content is not in a history snapshot yet. */
    pendingSnapshot: integer('pending_snapshot', { mode: 'boolean' }).notNull().default(false),
    /** Pages: line authorship, JSON `[count, author, at][]` runs over the current lines. */
    blame: text('blame'),
    /** Custom icon: `emoji:<emoji>`, or `image:<file>` in `<data>/.tandem/icons/`. */
    icon: text('icon'),
  },
  (table) => [index('nodes_hash').on(table.hash)],
)

export const tags = sqliteTable(
  'tags',
  {
    nodeId: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (table) => [primaryKey({ columns: [table.nodeId, table.tag] }), index('tags_tag').on(table.tag)],
)

/** Wiki links found in each page; `target` is the normalized link key (`linkKey`). */
export const links = sqliteTable(
  'links',
  {
    sourceId: text('source_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    target: text('target').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceId, table.target] }),
    index('links_target').on(table.target),
  ],
)

/** Snapshots of pages; the content is in `<data>/.tandem/history/<file>`. */
export const versions = sqliteTable(
  'versions',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id').notNull(),
    createdAt: integer('created_at').notNull(),
    author: text('author').notNull(),
    file: text('file').notNull(),
    hash: text('hash').notNull(),
    size: integer('size').notNull(),
  },
  (table) => [index('versions_node').on(table.nodeId, table.createdAt)],
)

/** Deleted items; their files are in `<data>/.tandem/trash/<id>/`. */
export const trash = sqliteTable('trash', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  kind: text('kind', { enum: ['page', 'folder'] }).notNull(),
  originalPath: text('original_path').notNull(),
  deletedAt: integer('deleted_at').notNull(),
  /** JSON of the rows removed with it (nodes, tags), to restore them. */
  payload: text('payload').notNull(),
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})
