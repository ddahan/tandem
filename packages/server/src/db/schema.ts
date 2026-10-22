// Structured data that doesn't belong in the Markdown files. The files are the source of truth
// for content and tree shape; these tables add identity, order, tags, history and authorship,
// and hold the databases and bookmarks (a note only has a block naming one).
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

/**
 * Databases, shown in their page by a `database` block. Not tied to `nodes` by a foreign key:
 * a page in the trash has no row there, and its databases wait for it (deleted with it).
 */
export const databases = sqliteTable(
  'databases',
  {
    id: text('id').primaryKey(),
    nodeId: text('node_id').notNull(),
    title: text('title').notNull().default(''),
    /** JSON `DatabaseColumn[]`. */
    columns: text('columns').notNull(),
    /** JSON `DatabaseSort`, or null. */
    sort: text('sort'),
    /** JSON `DatabaseFilter[]`. */
    filters: text('filters').notNull().default('[]'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('databases_node').on(table.nodeId)],
)

export const databaseRows = sqliteTable(
  'database_rows',
  {
    id: text('id').primaryKey(),
    databaseId: text('database_id')
      .notNull()
      .references(() => databases.id, { onDelete: 'cascade' }),
    /** Order in the table when nothing sorts it (ascending). */
    position: real('position').notNull(),
    /** JSON: column id → value (`CellValue`). */
    cells: text('cells').notNull().default('{}'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('database_rows_order').on(table.databaseId, table.position)],
)

/** Bookmarks and their folders (shared/bookmarks.ts); a note shows one with a `bookmark` block. */
export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['folder', 'bookmark'] }).notNull(),
    /** A folder's id, or null at the top. Deleting a folder deletes its contents (the store). */
    parentId: text('parent_id'),
    title: text('title').notNull(),
    /** Empty for a folder. */
    url: text('url').notNull().default(''),
    /** `urlKey(url)`: two bookmarks of one page are duplicates. Empty for a folder. */
    urlKey: text('url_key').notNull().default(''),
    description: text('description').notNull().default(''),
    /** The favicon: `image:<file>` in `<data>/.tandem/icons/`, or null. */
    icon: text('icon'),
    /** Order among siblings (ascending). */
    position: real('position').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('bookmarks_parent').on(table.parentId, table.position),
    index('bookmarks_url_key').on(table.urlKey),
  ],
)

/** The bookmarks each page shows (its `bookmark` blocks), as `links` for wiki links. */
export const bookmarkRefs = sqliteTable(
  'bookmark_refs',
  {
    nodeId: text('node_id')
      .notNull()
      .references(() => nodes.id, { onDelete: 'cascade' }),
    bookmarkId: text('bookmark_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.nodeId, table.bookmarkId] }),
    index('bookmark_refs_bookmark').on(table.bookmarkId),
  ],
)
