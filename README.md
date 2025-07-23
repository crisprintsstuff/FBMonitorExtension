# Facebook Groups Monitor Chrome Extension

A powerful Chrome extension that monitors Facebook groups for new posts and sends real-time notifications to your webhooks. Perfect for community management, social media monitoring, and staying updated with important group activities.

## 🚀 Features

### Core Functionality
- **🔄 Real-time Monitoring**: Automatically checks Facebook groups at customizable intervals
- **📬 Webhook Integration**: Sends new posts to Discord, Slack, or any webhook endpoint
- **🎯 User-Specific Monitoring**: Monitor posts from specific group members only
- **⚡ Background Operation**: Runs continuously even when browser windows are closed
- **🔧 Easy Management**: Simple popup interface for adding, editing, and managing groups

### Advanced Features
- **🎨 Smart Webhook Formatting**: Auto-detects Discord/Slack and formats messages accordingly
- **📊 Post Tracking**: Keeps count of posts and last check times
- **🧪 Testing Tools**: Built-in webhook and post testing functionality
- **🔒 Privacy-Focused**: Uses your existing Facebook login, no credentials stored
- **⏰ Flexible Scheduling**: Set different check intervals for each group (1-60 minutes)

## 📋 Requirements

- Google Chrome browser
- Active Facebook account
- Membership in the Facebook groups you want to monitor
- Webhook endpoint (Discord, Slack, webhook.site, Zapier, etc.)

## 🛠️ Installation

### Step 1: Download Extension Files
1. Download or clone this repository
2. Create a folder called `facebook-groups-monitor`
3. Save all the following files in this folder:
   - `manifest.json`
   - `popup.html`
   - `popup.js`
   - `background.js`
   - `content.js`
   - `injected.js`

### Step 2: Install in Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the `facebook-groups-monitor` folder
5. The extension should appear in your extensions list

### Step 3: Pin Extension
1. Click the puzzle piece icon (🧩) in Chrome toolbar
2. Find "Facebook Groups Monitor" and click the pin icon
3. Extension icon will now appear in your toolbar

## 🚀 Getting Started

### Basic Setup

1. **Click the extension icon** in your toolbar
2. **Add your first group**:
   - **Group Name**: Friendly name for identification
   - **Facebook Group URL**: Full URL (e.g., `https://www.facebook.com/groups/yourgroup`)
   - **Webhook URL**: Your Discord/Slack/webhook endpoint  
   - **Check Interval**: How often to check (5-30 minutes recommended)
3. **Test your setup**:
   - Click "Test Webhook" to verify webhook works
   - Click "Test Latest Post" to fetch and send latest post
4. **Start monitoring**: Click "Start Monitoring"

### User-Specific Monitoring

To monitor posts from specific group members only:

1. **Check "Monitor specific user only"**
2. **Enter exact Facebook name** (e.g., "John Smith")
3. **Add group** as normal

The extension will only send posts from that specific user to your webhook.

## 🎯 Webhook Setup

### Discord Webhook
1. Go to your Discord server settings
2. Navigate to **Integrations** → **Webhooks**
3. Click **"New Webhook"**
4. Copy the webhook URL
5. Paste into extension

**Result**: Rich embedded messages with colors and formatting

### Slack Webhook  
1. Go to your Slack workspace
2. Navigate to **Apps** → **Incoming Webhooks**
3. Create new webhook for your channel
4. Copy the webhook URL
5. Paste into extension

**Result**: Formatted attachments with fields and colors

### Generic Webhooks
Use with webhook.site, Zapier, n8n, or any service accepting JSON POST requests.

**Result**: Clean JSON data with all post information

## 📊 Webhook Data Format

### Discord/Slack
Rich formatted messages with:
- Post author and content
- Group name and link
- Timestamp and post count
- User-specific indicators (when applicable)

### Generic JSON
```json
{
  "message": "New posts from Group Name",
  "group": {
    "name": "Group Name",
    "url": "https://facebook.com/groups/...",
    "id": "group_id",
    "specificUserMode": false,
    "specificUser": null
  },
  "posts": [
    {
      "id": "post_id",
      "content": "Post content...",
      "author": "Author Name",
      "timestamp": "2025-07-23T10:30:00Z",
      "url": "https://facebook.com/...",
      "type": "post"
    }
  ],
  "timestamp": "2025-07-23T10:30:00Z",
  "postCount": 1,
  "source": "Facebook Groups Monitor Extension",
  "userSpecific": false,
  "targetUser": null
}
```

## ⚙️ Configuration Options

### Group Settings
- **Name**: Display name for the group
- **URL**: Facebook group URL
- **Webhook**: Endpoint for notifications
- **Interval**: Check frequency (1-60 minutes)
- **Status**: Active/Inactive toggle
- **User Mode**: Monitor all posts vs specific user

### Global Settings
- **Monitoring Status**: Start/Stop all monitoring
- **Group Management**: Add, remove, edit groups
- **Testing Tools**: Test webhooks and post fetching

## 🔧 Troubleshooting

### Common Issues

**"Group not found" error:**
- Ensure you're logged into Facebook
- Verify you're a member of the group
- Check the group URL is correct
- Reload the extension

**"No posts found":**
- Confirm group has recent posts
- Check Facebook login status
- Try a more active group for testing
- Verify group membership

**Webhook not receiving data:**
- Test webhook URL manually
- Verify webhook accepts POST requests
- Check webhook service logs
- Use webhook.site for testing

**Extension not working:**
- Reload extension at `chrome://extensions/`
- Check browser console for errors
- Ensure all permissions are granted
- Try disabling/enabling extension

### Debug Mode

1. **Open extension console**:
   - Go to `chrome://extensions/`
   - Click "Inspect views: background page"
   - Monitor console for detailed logs

2. **Check content script**:
   - Visit Facebook group manually
   - Open browser Developer Tools (F12)
   - Look for "Content script:" messages

## 🔒 Privacy & Security

### Data Handling
- **No credentials stored**: Uses your existing Facebook login
- **Local data only**: All settings stored locally in Chrome
- **No external servers**: Direct communication between your browser and webhooks
- **Minimal permissions**: Only requests necessary Chrome permissions

### What the Extension Accesses
- ✅ Facebook group pages you're a member of
- ✅ Your existing Facebook cookies for authentication
- ✅ Chrome storage for settings
- ❌ Your Facebook password or personal data
- ❌ Private messages or non-group content

## 🤝 Contributing

### Reporting Issues
- Use GitHub Issues for bug reports
- Include Chrome version and error messages
- Provide steps to reproduce the issue

### Feature Requests
- Suggest new features via GitHub Issues
- Describe the use case and expected behavior

### Development
- Fork the repository
- Make your changes
- Test thoroughly
- Submit a pull request

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

### Legal Compliance
- Only use with groups you're legitimately a member of
- Respect Facebook's Terms of Service
- Don't use for spam or unauthorized data collection
- Be mindful of privacy when sharing post data

### Limitations
- Requires Chrome browser to be running
- Dependent on Facebook's page structure
- May need updates if Facebook changes their interface
- Rate limited by Facebook's anti-bot measures

## 🔗 Support

### Getting Help
- Check this README for common solutions
- Review GitHub Issues for similar problems
- Open new issue for unresolved problems

### Best Practices
- Start with longer intervals (10+ minutes) to avoid rate limiting
- Test with less active groups first
- Use webhook.site for initial testing
- Monitor Chrome console for debugging

---

**Made with ❤️ for community managers and social media enthusiasts**

*This extension is not affiliated with Meta/Facebook. Facebook is a trademark of Meta Platforms, Inc.*
