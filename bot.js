// ─── Discord Key Bot ────────────────────────────────────────────────────────
// Commands:
//   /getkey duration:<30m|2h|7d|permanent>  — get a key
//   /mykey                                  — see your key & expiry
//   /revokekey @user                        — (Admin) revoke a key
//   /addkey @user duration:<...>            — (Admin) give someone a key + ping them
//   /listkeys                               — (Admin) list active keys
//   /keyinfo @user                          — (Admin) see a user's key details
//   /resetkey @user                         — (Admin) wipe & reissue a fresh key
//   /stats                                  — (Admin) show bot stats
//   /ping                                   — check bot latency
//   /help                                   — list all commands
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config();
const {
  Client, GatewayIntentBits, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
} = require("discord.js");
const { v4: uuidv4 } = require("uuid");
const fs   = require("fs");
const path = require("path");
const http = require("http");

// ── JSON "database" ───────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, "keys.json");

function loadDB() {
  if (!fs.existsSync(DB_PATH))
    fs.writeFileSync(DB_PATH, JSON.stringify({ keys: {}, userMap: {} }, null, 2));
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateKey() {
  const seg = () => uuidv4().replace(/-/g, "").toUpperCase().slice(0, 4);
  return `RBXG-${seg()}-${seg()}-${seg()}-${seg()}`;
}

function calcExpiry(duration) {
  if (!duration || duration.toLowerCase() === "permanent") return null;
  const match = duration.match(/^(\d+)(m|h|d)$/i);
  if (!match) return null;
  const amount = parseInt(match[1]);
  const unit   = match[2].toLowerCase();
  const ms = unit === "m" ? amount * 60 * 1000
           : unit === "h" ? amount * 60 * 60 * 1000
           :                amount * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

function isExpired(keyData) {
  if (!keyData.expiresAt) return false;
  return Date.now() > new Date(keyData.expiresAt).getTime();
}

function durationLabel(duration) {
  if (!duration || duration.toLowerCase() === "permanent") return "Permanent ♾️";
  const match = duration.match(/^(\d+)(m|h|d)$/i);
  if (!match) return duration;
  const amount = parseInt(match[1]);
  const unit   = match[2].toLowerCase();
  const labels = { m: "minute", h: "hour", d: "day" };
  return `${amount} ${labels[unit]}${amount !== 1 ? "s" : ""}`;
}

function validDuration(d) {
  return !d || d.toLowerCase() === "permanent" || /^\d+(m|h|d)$/i.test(d);
}

// ── Discord client ────────────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", () => {
  console.log(`✅ Key bot ready as ${client.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user } = interaction;
  const db = loadDB();

  // ── /ping ────────────────────────────────────────────────────────────────────
  if (commandName === "ping") {
    const latency = Date.now() - interaction.createdTimestamp;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle("🏓 Pong!")
          .addFields(
            { name: "Bot Latency", value: `${latency}ms`, inline: true },
            { name: "API Latency", value: `${Math.round(client.ws.ping)}ms`, inline: true }
          )
      ],
      ephemeral: true,
    });
  }

  // ── /help ────────────────────────────────────────────────────────────────────
  else if (commandName === "help") {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle("📋 Key Bot Commands")
          .addFields(
            { name: "🔑 /getkey [duration]", value: "Get your access key. Duration examples: `30m` `2h` `7d` `permanent`" },
            { name: "🪪 /mykey", value: "View your current key and its status" },
            { name: "🛡️ /addkey @user [duration]", value: "(Admin) Give a key to someone and ping them" },
            { name: "🔍 /keyinfo @user", value: "(Admin) See full key details for a user" },
            { name: "🚫 /revokekey @user", value: "(Admin) Revoke a user's key instantly" },
            { name: "🔄 /resetkey @user [duration]", value: "(Admin) Wipe and reissue a fresh key" },
            { name: "📋 /listkeys", value: "(Admin) List all active keys" },
            { name: "📊 /stats", value: "(Admin) Show bot statistics" },
            { name: "🏓 /ping", value: "Check bot latency" }
          )
          .setFooter({ text: "Duration format: 30m • 2h • 7d • permanent" })
      ],
      ephemeral: true,
    });
  }

  // ── /getkey ──────────────────────────────────────────────────────────────────
  else if (commandName === "getkey") {
    const duration = interaction.options.getString("duration") || "permanent";

    if (!validDuration(duration)) {
      await interaction.reply({ content: "❌ Invalid duration. Use `30m`, `2h`, `7d`, or `permanent`.", ephemeral: true });
      return;
    }

    if (db.userMap[user.id]) {
      const keyData = db.keys[db.userMap[user.id]];
      if (!isExpired(keyData) && !keyData.revoked) {
        await interaction.reply({ content: "You already have an active key! Use `/mykey` to see it.", ephemeral: true });
        return;
      }
      delete db.userMap[user.id];
    }

    const newKey    = generateKey();
    const expiresAt = calcExpiry(duration);
    db.keys[newKey] = { userId: user.id, username: user.tag, createdAt: new Date().toISOString(), expiresAt, hwid: null, revoked: false };
    db.userMap[user.id] = newKey;
    saveDB(db);

    const expiryLine = expiresAt
      ? `⏳ **Expires:** <t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:R>`
      : `♾️ **Duration:** Permanent`;

    const dmMsg =
      `🔑 **Your Roblox Gift Extension Key**\n\`\`\`\n${newKey}\n\`\`\`\n` +
      `${expiryLine}\nPaste this into the extension popup to unlock it.\n` +
      `⚠️ **Do not share this key.** It is tied to your Discord account.`;

    try {
      await user.send(dmMsg);
      await interaction.reply({ content: "✅ Your key has been sent to your DMs!", ephemeral: true });
    } catch {
      await interaction.reply({
        content: `✅ Here is your key (only you can see this):\n\`\`\`\n${newKey}\n\`\`\`\n${expiryLine}\n⚠️ Do not share it.`,
        ephemeral: true,
      });
    }
  }

  // ── /mykey ───────────────────────────────────────────────────────────────────
  else if (commandName === "mykey") {
    const key = db.userMap[user.id];
    if (!key) {
      await interaction.reply({ content: "You don't have a key yet. Use `/getkey` to get one.", ephemeral: true });
      return;
    }
    const keyData = db.keys[key];
    const expired = isExpired(keyData);
    const status  = keyData.revoked ? "🔴 Revoked" : expired ? "🟡 Expired" : "🟢 Active";
    const expiryLine = keyData.expiresAt
      ? `<t:${Math.floor(new Date(keyData.expiresAt).getTime() / 1000)}:F> (<t:${Math.floor(new Date(keyData.expiresAt).getTime() / 1000)}:R>)`
      : "Never (Permanent ♾️)";

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(keyData.revoked || expired ? 0xED4245 : 0x57F287)
          .setTitle("🔑 Your Key")
          .addFields(
            { name: "Key", value: `\`${key}\`` },
            { name: "Status", value: status, inline: true },
            { name: "HWID Locked", value: keyData.hwid ? "✅ Yes" : "⏳ Not yet (binds on first use)", inline: true },
            { name: "Expires", value: expiryLine },
            { name: "Issued", value: `<t:${Math.floor(new Date(keyData.createdAt).getTime() / 1000)}:R>`, inline: true }
          )
      ],
      ephemeral: true,
    });
  }

  // ── /revokekey (admin) ───────────────────────────────────────────────────────
  else if (commandName === "revokekey") {
    const targetUser = interaction.options.getUser("user");
    const key        = db.userMap[targetUser.id];
    if (!key) {
      await interaction.reply({ content: `${targetUser.tag} doesn't have a key.`, ephemeral: true });
      return;
    }
    db.keys[key].revoked = true;
    delete db.userMap[targetUser.id];
    saveDB(db);

    // Notify the user their key was revoked
    try { await targetUser.send(`🔴 Your Roblox Gift Extension key has been **revoked** by an admin.`); } catch {}

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle("🚫 Key Revoked")
          .setDescription(`Key for **${targetUser.tag}** has been revoked and they have been notified.`)
      ],
    });
  }

  // ── /addkey (admin) ──────────────────────────────────────────────────────────
  else if (commandName === "addkey") {
    const targetUser = interaction.options.getUser("user");
    const duration   = interaction.options.getString("duration") || "permanent";

    if (!validDuration(duration)) {
      await interaction.reply({ content: "❌ Invalid duration. Use `30m`, `2h`, `7d`, or `permanent`.", ephemeral: true });
      return;
    }

    if (db.userMap[targetUser.id]) {
      const existing = db.keys[db.userMap[targetUser.id]];
      if (!isExpired(existing) && !existing.revoked) {
        await interaction.reply({
          content: `${targetUser.tag} already has an active key: \`${db.userMap[targetUser.id]}\``,
          ephemeral: true,
        });
        return;
      }
      delete db.userMap[targetUser.id];
    }

    const newKey    = generateKey();
    const expiresAt = calcExpiry(duration);
    db.keys[newKey] = { userId: targetUser.id, username: targetUser.tag, createdAt: new Date().toISOString(), expiresAt, hwid: null, revoked: false };
    db.userMap[targetUser.id] = newKey;
    saveDB(db);

    const expiryLine = expiresAt
      ? `⏳ Expires: <t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:R>`
      : `♾️ Duration: Permanent`;

    // DM the key to the user
    try {
      await targetUser.send(
        `🔑 **Your Roblox Gift Extension Key**\n\`\`\`\n${newKey}\n\`\`\`\n${expiryLine}\nPaste this into the extension popup.`
      );
    } catch {}

    // Public ping in the channel so they see it
    await interaction.reply({
      content: `📬 ${targetUser} — **${user.username}** has sent you an access key! Check your DMs 🔑`,
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle("✅ Key Issued")
          .addFields(
            { name: "User", value: targetUser.tag, inline: true },
            { name: "Duration", value: durationLabel(duration), inline: true },
            { name: "Key", value: `\`${newKey}\`` }
          )
          .setFooter({ text: "Key has been DM'd to the user" })
      ],
    });
  }

  // ── /keyinfo (admin) ─────────────────────────────────────────────────────────
  else if (commandName === "keyinfo") {
    const targetUser = interaction.options.getUser("user");
    const key        = db.userMap[targetUser.id];

    if (!key) {
      await interaction.reply({ content: `${targetUser.tag} doesn't have a key.`, ephemeral: true });
      return;
    }

    const keyData = db.keys[key];
    const expired = isExpired(keyData);
    const status  = keyData.revoked ? "🔴 Revoked" : expired ? "🟡 Expired" : "🟢 Active";
    const expiryLine = keyData.expiresAt
      ? `<t:${Math.floor(new Date(keyData.expiresAt).getTime() / 1000)}:F>`
      : "Never (Permanent)";

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`🔍 Key Info — ${targetUser.tag}`)
          .addFields(
            { name: "Key", value: `\`${key}\`` },
            { name: "Status", value: status, inline: true },
            { name: "HWID Locked", value: keyData.hwid ? "✅ Yes" : "⏳ Not yet", inline: true },
            { name: "HWID", value: keyData.hwid ? `\`${keyData.hwid}\`` : "None" },
            { name: "Expires", value: expiryLine, inline: true },
            { name: "Issued", value: `<t:${Math.floor(new Date(keyData.createdAt).getTime() / 1000)}:F>`, inline: true }
          )
      ],
      ephemeral: true,
    });
  }

  // ── /resetkey (admin) ────────────────────────────────────────────────────────
  else if (commandName === "resetkey") {
    const targetUser = interaction.options.getUser("user");
    const duration   = interaction.options.getString("duration") || "permanent";

    if (!validDuration(duration)) {
      await interaction.reply({ content: "❌ Invalid duration. Use `30m`, `2h`, `7d`, or `permanent`.", ephemeral: true });
      return;
    }

    // Revoke old key if exists
    if (db.userMap[targetUser.id]) {
      db.keys[db.userMap[targetUser.id]].revoked = true;
      delete db.userMap[targetUser.id];
    }

    const newKey    = generateKey();
    const expiresAt = calcExpiry(duration);
    db.keys[newKey] = { userId: targetUser.id, username: targetUser.tag, createdAt: new Date().toISOString(), expiresAt, hwid: null, revoked: false };
    db.userMap[targetUser.id] = newKey;
    saveDB(db);

    const expiryLine = expiresAt
      ? `⏳ Expires: <t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:R>`
      : `♾️ Duration: Permanent`;

    try {
      await targetUser.send(
        `🔄 **Your key has been reset!**\n\`\`\`\n${newKey}\n\`\`\`\n${expiryLine}\nYour old key has been revoked. Use this new one in the extension.`
      );
    } catch {}

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle("🔄 Key Reset")
          .setDescription(`Fresh key issued for **${targetUser.tag}** and sent to their DMs.`)
          .addFields(
            { name: "New Key", value: `\`${newKey}\`` },
            { name: "Duration", value: durationLabel(duration), inline: true }
          )
      ],
      ephemeral: true,
    });
  }

  // ── /stats (admin) ───────────────────────────────────────────────────────────
  else if (commandName === "stats") {
    const allKeys    = Object.values(db.keys);
    const active     = allKeys.filter((k) => !k.revoked && !isExpired(k)).length;
    const expired    = allKeys.filter((k) => !k.revoked && isExpired(k)).length;
    const revoked    = allKeys.filter((k) => k.revoked).length;
    const hwidBound  = allKeys.filter((k) => k.hwid).length;
    const permanent  = allKeys.filter((k) => !k.expiresAt && !k.revoked).length;

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle("📊 Bot Statistics")
          .addFields(
            { name: "🟢 Active Keys",     value: `${active}`,    inline: true },
            { name: "🟡 Expired Keys",    value: `${expired}`,   inline: true },
            { name: "🔴 Revoked Keys",    value: `${revoked}`,   inline: true },
            { name: "🔒 HWID Bound",      value: `${hwidBound}`, inline: true },
            { name: "♾️ Permanent Keys",  value: `${permanent}`, inline: true },
            { name: "📦 Total Keys Ever", value: `${allKeys.length}`, inline: true },
            { name: "🏓 Bot Latency",     value: `${Math.round(client.ws.ping)}ms`, inline: true }
          )
          .setTimestamp()
      ],
      ephemeral: true,
    });
  }

  // ── /listkeys (admin) ────────────────────────────────────────────────────────
  else if (commandName === "listkeys") {
    const activeKeys = Object.entries(db.keys).filter(([, v]) => !v.revoked && !isExpired(v));
    if (activeKeys.length === 0) {
      await interaction.reply({ content: "No active keys.", ephemeral: true });
      return;
    }
    const lines = activeKeys.map(([k, v]) => {
      const expiry = v.expiresAt
        ? `expires <t:${Math.floor(new Date(v.expiresAt).getTime() / 1000)}:R>`
        : "permanent";
      return `\`${k}\` — ${v.username} — ${expiry}`;
    });
    const chunks = [];
    for (let i = 0; i < lines.length; i += 10) chunks.push(lines.slice(i, i + 10).join("\n"));
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`📋 Active Keys (${activeKeys.length})`)
          .setDescription(chunks[0])
      ],
      ephemeral: true,
    });
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({ content: chunks[i], ephemeral: true });
    }
  }
});

// ── Key validation HTTP API ───────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "POST" && req.url === "/api/public/keys/validate") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { key, hwid } = JSON.parse(body);
        if (key === "__ping__") { res.writeHead(200); res.end(JSON.stringify({ valid: true })); return; }

        const db            = loadDB();
        const normalizedKey = (key || "").trim().toUpperCase();
        const keyData       = db.keys[normalizedKey];

        if (!keyData || keyData.revoked) {
          res.writeHead(200);
          res.end(JSON.stringify({ valid: false, reason: keyData?.revoked ? "revoked" : "not_found" }));
          return;
        }
        if (isExpired(keyData)) {
          keyData.revoked = true;
          if (db.userMap[keyData.userId] === normalizedKey) delete db.userMap[keyData.userId];
          saveDB(db);
          res.writeHead(200);
          res.end(JSON.stringify({ valid: false, reason: "expired" }));
          return;
        }
        if (!keyData.hwid && hwid && hwid !== "__ping__") {
          keyData.hwid = hwid;
          saveDB(db);
        } else if (keyData.hwid && hwid && keyData.hwid !== hwid) {
          res.writeHead(200);
          res.end(JSON.stringify({ valid: false, reason: "hwid_mismatch" }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify({ valid: true }));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ valid: false, reason: "bad_request" }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "not found" }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🌐 Key API listening on port ${PORT}`));

client.login(process.env.DISCORD_TOKEN);
