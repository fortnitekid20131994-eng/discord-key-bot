require("dotenv").config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("getkey")
    .setDescription("Get your extension access key (sent to your DMs)")
    .addStringOption((o) =>
      o.setName("duration").setDescription("How long: 30m, 2h, 7d, permanent (default: permanent)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("mykey")
    .setDescription("View your current access key and its status"),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency"),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("List all available commands"),

  new SlashCommandBuilder()
    .setName("revokekey")
    .setDescription("(Admin) Revoke a user's access key")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName("user").setDescription("User whose key to revoke").setRequired(true)),

  new SlashCommandBuilder()
    .setName("addkey")
    .setDescription("(Admin) Generate and assign a key to a user, pings them in channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName("user").setDescription("User to give the key to").setRequired(true))
    .addStringOption((o) =>
      o.setName("duration").setDescription("How long: 30m, 2h, 7d, permanent (default: permanent)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("keyinfo")
    .setDescription("(Admin) See full key details for a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName("user").setDescription("User to look up").setRequired(true)),

  new SlashCommandBuilder()
    .setName("resetkey")
    .setDescription("(Admin) Wipe and reissue a fresh key for a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName("user").setDescription("User to reset").setRequired(true))
    .addStringOption((o) =>
      o.setName("duration").setDescription("How long: 30m, 2h, 7d, permanent (default: permanent)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("listkeys")
    .setDescription("(Admin) List all active keys")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("(Admin) Show bot statistics")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
    console.log("✅ Commands registered!");
  } catch (err) {
    console.error(err);
  }
})();
