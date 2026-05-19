#!/usr/bin/env node
/**
 * Discord Channel Setup Script for gen2-tony
 *
 * This script automatically creates the Discord server structure for your council system.
 * Run this ONCE after creating your Discord server and inviting the bot.
 *
 * Usage:
 *   DISCORD_BOT_TOKEN="your_token" DISCORD_SERVER_ID="your_server_id" node setup-discord-channels.js
 */

import { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } from 'discord.js';

// Configuration
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const SERVER_ID = process.env.DISCORD_SERVER_ID;

if (!BOT_TOKEN) {
  console.error('❌ Error: DISCORD_BOT_TOKEN environment variable is required');
  console.error('Usage: DISCORD_BOT_TOKEN="your_token" DISCORD_SERVER_ID="your_server_id" node setup-discord-channels.js');
  process.exit(1);
}

if (!SERVER_ID) {
  console.error('❌ Error: DISCORD_SERVER_ID environment variable is required');
  console.error('Get it by: Right-click server name → Copy Server ID (Developer Mode must be enabled)');
  process.exit(1);
}

// Channel structure definition
const CHANNEL_STRUCTURE = [
  {
    category: '📋 CAPTURE',
    channels: [
      { name: 'quick-capture', description: 'Fast voice/text notes - captured to gen2-tony inbox' },
      { name: 'inbox-processing', description: 'Review processed observations from board routing' }
    ]
  },
  {
    category: '🏛️ COUNCIL',
    channels: [
      { name: 'council-main', description: 'Ask council questions here - triggers deliberation' },
      { name: 'cfo-perspective', description: 'CFO outputs (financial lens) - auto-posted by bot' },
      { name: 'cmo-perspective', description: 'CMO outputs (marketing lens) - auto-posted by bot' },
      { name: 'cso-perspective', description: 'CSO outputs (strategic/vision lens) - auto-posted by bot' },
      { name: 'coo-perspective', description: 'COO outputs (operations lens) - auto-posted by bot' },
      { name: 'chair-synthesis', description: "Chair's final decisions - auto-posted by bot" }
    ]
  },
  {
    category: '📊 REPORTS',
    channels: [
      { name: 'daily-review', description: 'Morning review outputs (tasks, meetings, coach question)' },
      { name: 'weekly-review', description: 'Wednesday 5 A\'s review (vision alignment check)' },
      { name: 'financial-reports', description: 'MYOB weekly reports from /finance-report' }
    ]
  },
  {
    category: '🐄 FARM',
    channels: [
      { name: 'cattle-notes', description: 'Cattle observations → individual cattle files' },
      { name: 'paddock-status', description: 'Paddock updates → paddock management files' }
    ]
  },
  {
    category: '🍯 L36 BUSINESS',
    channels: [
      { name: 'product-ideas', description: 'Product brainstorming → Products/Ideas/' },
      { name: 'recipe-development', description: 'Recipe testing notes → Recipes/[Category]/' }
    ]
  }
];

// Create client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

async function setupChannels() {
  console.log('🔄 Logging in to Discord...');

  await client.login(BOT_TOKEN);

  console.log('✅ Logged in successfully');

  // Get the guild
  const guild = await client.guilds.fetch(SERVER_ID);

  if (!guild) {
    console.error('❌ Error: Could not find server with ID:', SERVER_ID);
    console.error('Make sure the bot has been invited to the server');
    process.exit(1);
  }

  console.log(`\n✅ Found server: ${guild.name}\n`);

  // Store created channel IDs for output
  const channelIds = {};

  // Create categories and channels
  for (const section of CHANNEL_STRUCTURE) {
    console.log(`\n📁 Creating category: ${section.category}`);

    // Create category
    const category = await guild.channels.create({
      name: section.category,
      type: ChannelType.GuildCategory
    });

    console.log(`   ✅ Category created: ${category.name} (${category.id})`);

    // Create channels in this category
    for (const channelDef of section.channels) {
      console.log(`   📝 Creating channel: #${channelDef.name}`);

      const channel = await guild.channels.create({
        name: channelDef.name,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: channelDef.description
      });

      console.log(`      ✅ Channel created: ${channel.id}`);

      // Store channel ID for later reference
      const channelKey = channelDef.name.replace(/-/g, '_');
      channelIds[channelKey] = channel.id;

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Output summary
  console.log('\n' + '='.repeat(70));
  console.log('✨ DISCORD SETUP COMPLETE!');
  console.log('='.repeat(70));
  console.log('\n📋 Channel IDs (save these for Clawdbot config):\n');

  // Format for easy copying
  console.log('Copy this into ~/.clawdbot/channel-ids.json:\n');
  console.log(JSON.stringify(channelIds, null, 2));

  console.log('\n' + '-'.repeat(70));
  console.log('\n🔧 Next Steps:\n');
  console.log('1. Copy the channel IDs above');
  console.log('2. Add Discord config to ~/.clawdbot/clawdbot.json (see setup guide Part 3.1)');
  console.log('3. Restart Clawdbot gateway');
  console.log('4. Test by sending a message in #quick-capture');
  console.log('\n' + '='.repeat(70) + '\n');

  client.destroy();
  process.exit(0);
}

// Handle errors
client.on('error', (error) => {
  console.error('❌ Discord client error:', error);
  process.exit(1);
});

// Run setup
setupChannels().catch((error) => {
  console.error('❌ Setup failed:', error);
  process.exit(1);
});
