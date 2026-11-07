import { relations } from "drizzle-orm"
import { boolean, index, pgEnum, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { createInsertSchema, createSelectSchema } from "drizzle-zod"
import { nanoid } from "nanoid"

export const bots = pgTable(
  "bots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    avatar: text("avatar")
      .notNull()
      .$defaultFn(() => nanoid()),
    job: text("job").notNull(),
    instructions: text("instructions"),
    sandboxId: text("sandbox_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("bots_user_id_idx").on(table.userId),
  ]
)

export const chatKindEnum = pgEnum("chat_kind", ["direct", "group"])

export const chats = pgTable(
  "chats",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(),
    kind: chatKindEnum("kind").notNull().default("direct"),
    name: text("name"),
    lastMessagePreview: text("last_message_preview"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("chats_user_id_idx").on(table.userId),
  ]
)

export const chatMembers = pgTable(
  "chat_members",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.botId] }),
    index("chat_members_bot_id_idx").on(table.botId),
  ]
)

export const botsRelations = relations(bots, ({ many }) => ({
  memberships: many(chatMembers),
  startupLeads: many(startupLeads),
}))

export const chatsRelations = relations(chats, ({ many }) => ({
  members: many(chatMembers),
}))

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  chat: one(chats, {
    fields: [chatMembers.chatId],
    references: [chats.id],
  }),
  bot: one(bots, {
    fields: [chatMembers.botId],
    references: [bots.id],
  }),
}))

export type Bot = typeof bots.$inferSelect
export type NewBot = typeof bots.$inferInsert

export const insertBotSchema = createInsertSchema(bots)
export const insertBotsSchema = insertBotSchema
export const selectBotSchema = createSelectSchema(bots)
export const selectBotsSchema = selectBotSchema

export type Chat = typeof chats.$inferSelect
export type NewChat = typeof chats.$inferInsert

export const insertChatSchema = createInsertSchema(chats)
export const selectChatSchema = createSelectSchema(chats)

export type ChatMember = typeof chatMembers.$inferSelect
export type NewChatMember = typeof chatMembers.$inferInsert

export const insertChatMemberSchema = createInsertSchema(chatMembers)
export const selectChatMemberSchema = createSelectSchema(chatMembers)

export const startupLeads = pgTable(
  "startup_leads",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    startupName: text("startup_name").notNull(),
    domain: text("domain").notNull(),
    fundingRound: text("funding_round").notNull(),
    fundingAmount: text("funding_amount").notNull(),
    founderName: text("founder_name").notNull(),
    founderRole: text("founder_role").notNull(),
    verifiedEmail: text("verified_email").notNull(),
    mxVerified: boolean("mx_verified").default(false).notNull(),
    linkedinXrayUrl: text("linkedin_xray_url").notNull(),
    linkedinNote: text("linkedin_note").notNull(),
    emailSubject: text("email_subject").notNull(),
    emailBody: text("email_body").notNull(),
    announcedDate: text("announced_date"),
    productSummary: text("product_summary"),
    sourceArticleUrl: text("source_article_url"),
    isRumoured: boolean("is_rumoured").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("startup_leads_user_id_idx").on(table.userId),
    index("startup_leads_bot_id_idx").on(table.botId),
  ]
)

export const startupLeadsRelations = relations(startupLeads, ({ one }) => ({
  bot: one(bots, {
    fields: [startupLeads.botId],
    references: [bots.id],
  }),
}))

export const insertStartupLeadSchema = createInsertSchema(startupLeads)
export const selectStartupLeadSchema = createSelectSchema(startupLeads)
export type StartupLead = typeof startupLeads.$inferSelect
export type NewStartupLead = typeof startupLeads.$inferInsert
