// Background script for Facebook Groups Monitor Extension

let monitoredGroups = [];
let isMonitoring = false;

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
    console.log('Facebook Groups Monitor extension installed');
    
    try {
        // Initialize storage
        const result = await chrome.storage.sync.get(['monitoredGroups', 'monitoringActive']);
        monitoredGroups = result.monitoredGroups || [];
        isMonitoring = result.monitoringActive || false;
        
        console.log(`Initialized with ${monitoredGroups.length} groups, monitoring: ${isMonitoring}`);
        
        if (isMonitoring && monitoredGroups.length > 0) {
            startMonitoring();
        }
    } catch (error) {
        console.error('Error during initialization:', error);
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background: Received message:', message.action);
    
    try {
        switch (message.action) {
            case 'startMonitoring':
                startMonitoring();
                sendResponse({ success: true });
                break;
                
            case 'stopMonitoring':
                stopMonitoring();
                sendResponse({ success: true });
                break;
                
            case 'updateGroups':
                updateGroupsHandler(message.groups, sendResponse);
                return true; // Keep message channel open for async response
                
            case 'fetchLatestPost':
                handleFetchLatestPost(message.groupId, sendResponse);
                return true; // Keep message channel open for async response
                
            case 'testWebhook':
                handleTestWebhook(message.webhook, sendResponse);
                return true; // Keep message channel open for async response
                
            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    } catch (error) {
        console.error('Error handling message:', error);
        sendResponse({ success: false, error: error.message });
    }
});

function startMonitoring() {
    console.log('Starting monitoring...');
    isMonitoring = true;
    chrome.storage.sync.set({ monitoringActive: true });
    setupPeriodicChecks();
}

function stopMonitoring() {
    console.log('Stopping monitoring...');
    isMonitoring = false;
    chrome.storage.sync.set({ monitoringActive: false });
    chrome.alarms.clearAll();
}

function restartMonitoring() {
    if (isMonitoring) {
        console.log('Restarting monitoring...');
        stopMonitoring();
        setTimeout(startMonitoring, 1000);
    }
}

function setupPeriodicChecks() {
    chrome.alarms.clearAll();
    
    monitoredGroups.forEach(group => {
        if (group.active) {
            const alarmName = `check_${group.id}`;
            chrome.alarms.create(alarmName, {
                delayInMinutes: 0.1,
                periodInMinutes: group.interval || 5
            });
            console.log(`Created alarm for group: ${group.name} (${group.interval} min)`);
        }
    });
}

// Handle alarm events
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name.startsWith('check_')) {
        const groupId = alarm.name.replace('check_', '');
        console.log(`Alarm triggered for group ID: ${groupId}`);
        checkSingleGroup(groupId);
    }
});

async function updateGroupsHandler(groups, sendResponse) {
    try {
        monitoredGroups = groups || [];
        console.log(`Updated groups list: ${monitoredGroups.length} groups`);
        
        // Also save to storage immediately
        await chrome.storage.sync.set({ monitoredGroups: monitoredGroups });
        console.log('Groups saved to storage');
        
        if (isMonitoring) {
            restartMonitoring();
        }
        sendResponse({ success: true });
    } catch (error) {
        console.error('Error updating groups:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleFetchLatestPost(groupId, sendResponse) {
    try {
        console.log(`Fetching latest post for group ID: ${groupId}`);
        
        // Always reload groups from storage to ensure we have the latest data
        const result = await chrome.storage.sync.get(['monitoredGroups']);
        monitoredGroups = result.monitoredGroups || [];
        console.log(`Reloaded ${monitoredGroups.length} groups from storage`);
        
        const group = monitoredGroups.find(g => g.id === groupId);
        if (!group) {
            console.error(`Group not found! Available groups:`, monitoredGroups.map(g => ({id: g.id, name: g.name})));
            throw new Error(`Group with ID ${groupId} not found. Available groups: ${monitoredGroups.length}`);
        }
        
        console.log(`Found group: ${group.name} (${group.url})`);
        
        const posts = await scrapeGroupPosts(group);
        
        if (posts && posts.length > 0) {
            // Filter posts by specific user if enabled
            let filteredPosts = posts;
            if (group.specificUserMode && group.specificUser) {
                filteredPosts = posts.filter(post => {
                    const postAuthor = (post.author || '').toLowerCase().trim();
                    const targetUser = group.specificUser.toLowerCase().trim();
                    
                    // Exact match or contains match
                    return postAuthor === targetUser || postAuthor.includes(targetUser);
                });
                
                console.log(`Filtered to ${filteredPosts.length} posts from user "${group.specificUser}" out of ${posts.length} total posts`);
            }
            
            if (filteredPosts.length > 0) {
                const latestPost = filteredPosts[0];
                console.log(`Found latest post by ${latestPost.author}: ${latestPost.content.substring(0, 100)}...`);
                console.log('Full post data:', latestPost);
                
                const webhookResult = await sendWebhook(group, [latestPost]);
                console.log('Webhook result:', webhookResult);
                
                // Update group info and save back to storage
                group.lastChecked = Date.now();
                group.postCount = (group.postCount || 0) + 1;
                
                // Update the group in the array and save
                const groupIndex = monitoredGroups.findIndex(g => g.id === groupId);
                if (groupIndex >= 0) {
                    monitoredGroups[groupIndex] = group;
                    await chrome.storage.sync.set({ monitoredGroups: monitoredGroups });
                    console.log(`Updated group ${group.name} in storage`);
                }
                
                if (webhookResult && webhookResult.success) {
                    sendResponse({ success: true, postFound: true, webhookSent: true });
                } else {
                    const errorMsg = webhookResult?.error || webhookResult?.statusText || 'Unknown webhook error';
                    const statusCode = webhookResult?.status || 'No status';
                    const responseBody = webhookResult?.body || 'No response body';
                    
                    console.error('Detailed webhook failure:');
                    console.error('- Error:', errorMsg);
                    console.error('- Status:', statusCode);
                    console.error('- Response body:', responseBody);
                    
                    sendResponse({ 
                        success: false, 
                        postFound: true, 
                        webhookSent: false,
                        error: `Webhook failed - Status: ${statusCode}, Error: ${errorMsg}, Response: ${responseBody}` 
                    });
                }
            } else {
                const reasonMsg = group.specificUserMode 
                    ? `No posts found from user "${group.specificUser}". Found ${posts.length} total posts from other users.`
                    : 'No posts found.';
                
                console.log(reasonMsg);
                
                // Still update the last checked time even if no posts found
                group.lastChecked = Date.now();
                const groupIndex = monitoredGroups.findIndex(g => g.id === groupId);
                if (groupIndex >= 0) {
                    monitoredGroups[groupIndex] = group;
                    await chrome.storage.sync.set({ monitoredGroups: monitoredGroups });
                }
                
                sendResponse({ 
                    success: false, 
                    error: reasonMsg + ' Check console for details and ensure you are logged into Facebook and are a member of this group.'
                });
            }
        } else {
            console.log('No posts found - this could mean:');
            console.log('1. You are not logged into Facebook');
            console.log('2. You are not a member of this group');
            console.log('3. The group has no recent posts');
            console.log('4. Facebook changed their HTML structure');
            console.log('5. The group page failed to load properly');
            
            // Still update the last checked time even if no posts found
            group.lastChecked = Date.now();
            const groupIndex = monitoredGroups.findIndex(g => g.id === groupId);
            if (groupIndex >= 0) {
                monitoredGroups[groupIndex] = group;
                await chrome.storage.sync.set({ monitoredGroups: monitoredGroups });
            }
            
            sendResponse({ 
                success: false, 
                error: 'No posts found. Check console for details and ensure you are logged into Facebook and are a member of this group.' 
            });
        }
        
    } catch (error) {
        console.error('Error fetching latest post:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleTestWebhook(webhookUrl, sendResponse) {
    try {
        console.log(`Testing webhook: ${webhookUrl}`);
        
        // Detect webhook type for test payload
        const isDiscord = webhookUrl.includes('discord.com/api/webhooks');
        const isSlack = webhookUrl.includes('hooks.slack.com');
        
        let testPayload;
        
        if (isDiscord) {
            // Discord test format
            testPayload = {
                username: "Facebook Groups Monitor",
                avatar_url: "https://static.xx.fbcdn.net/rsrc.php/v3/ys/r/TbNJQd_5E8B.png",
                embeds: [{
                    title: "🧪 Webhook Test",
                    description: "This is a test message from Facebook Groups Monitor Extension to verify your Discord webhook is working correctly.",
                    color: 0x00ff00, // Green for test
                    fields: [
                        {
                            name: "Status",
                            value: "✅ Test Successful",
                            inline: true
                        },
                        {
                            name: "Timestamp",
                            value: new Date().toLocaleString(),
                            inline: true
                        }
                    ],
                    footer: {
                        text: "Facebook Groups Monitor Extension - Test Mode"
                    }
                }]
            };
        } else if (isSlack) {
            // Slack test format
            testPayload = {
                text: "🧪 Webhook Test",
                attachments: [{
                    color: "#00ff00",
                    fields: [
                        {
                            title: "Test Message",
                            value: "This is a test message from Facebook Groups Monitor Extension to verify your Slack webhook is working correctly.",
                            short: false
                        },
                        {
                            title: "Status",
                            value: "✅ Test Successful",
                            short: true
                        },
                        {
                            title: "Timestamp",
                            value: new Date().toLocaleString(),
                            short: true
                        }
                    ],
                    footer: "Facebook Groups Monitor - Test Mode",
                    ts: Math.floor(Date.now() / 1000)
                }]
            };
        } else {
            // Generic test format
            testPayload = {
                test: true,
                message: "This is a test webhook from Facebook Groups Monitor Extension",
                timestamp: new Date().toISOString(),
                group: {
                    name: "Test Group",
                    url: "https://facebook.com/groups/test",
                    id: "test_group_id"
                },
                posts: [{
                    id: "test_post_id",
                    content: "This is a test post to verify your webhook is working correctly.",
                    author: "Test User",
                    timestamp: new Date().toISOString(),
                    url: "https://facebook.com/test",
                    type: "test"
                }],
                postCount: 1,
                source: "Facebook Groups Monitor Extension"
            };
        }
        
        console.log(`Sending ${isDiscord ? 'Discord' : isSlack ? 'Slack' : 'generic'} test webhook payload...`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Facebook-Groups-Monitor-Extension/1.0-Test',
                'Accept': 'application/json, text/plain, */*'
            },
            body: JSON.stringify(testPayload),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        console.log(`📡 Test webhook response:`);
        console.log(`- Status: ${response.status} ${response.statusText}`);
        console.log(`- OK: ${response.ok}`);
        console.log(`- Headers:`, Object.fromEntries(response.headers.entries()));
        
        let responseText = '';
        try {
            responseText = await response.text();
            console.log(`- Response body: ${responseText}`);
        } catch (e) {
            console.log('- Could not read test webhook response body:', e.message);
            responseText = `Error reading body: ${e.message}`;
        }
        
        if (response.ok) {
            console.log('✅ Test webhook successful');
            sendResponse({ 
                success: true, 
                status: response.status,
                statusText: response.statusText,
                body: responseText
            });
        } else {
            console.error('❌ Test webhook failed');
            sendResponse({ 
                success: false, 
                error: `HTTP ${response.status}: ${response.statusText}`,
                status: response.status,
                statusText: response.statusText,
                body: responseText
            });
        }
        
    } catch (error) {
        console.error('Test webhook error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function checkSingleGroup(groupId) {
    // Always reload groups from storage before checking
    const result = await chrome.storage.sync.get(['monitoredGroups']);
    monitoredGroups = result.monitoredGroups || [];
    
    const group = monitoredGroups.find(g => g.id === groupId);
    if (!group || !group.active) {
        console.log(`Group ${groupId} not found or inactive. Available groups:`, monitoredGroups.map(g => ({id: g.id, name: g.name, active: g.active})));
        return;
    }
    
    console.log(`Checking group: ${group.name}`);
    
    try {
        const posts = await scrapeGroupPosts(group);
        
        if (posts && posts.length > 0) {
            // Filter for new posts since last check
            const lastCheck = group.lastChecked || 0;
            let newPosts = posts.filter(post => {
                const postTime = new Date(post.timestamp).getTime();
                return postTime > lastCheck;
            });
            
            // Further filter by specific user if enabled
            if (group.specificUserMode && group.specificUser && newPosts.length > 0) {
                const userFilteredPosts = newPosts.filter(post => {
                    const postAuthor = (post.author || '').toLowerCase().trim();
                    const targetUser = group.specificUser.toLowerCase().trim();
                    
                    // Exact match or contains match
                    return postAuthor === targetUser || postAuthor.includes(targetUser);
                });
                
                console.log(`Filtered ${newPosts.length} new posts to ${userFilteredPosts.length} posts from user "${group.specificUser}"`);
                newPosts = userFilteredPosts;
            }
            
            if (newPosts.length > 0) {
                console.log(`Found ${newPosts.length} new posts for ${group.name}${group.specificUserMode ? ` from ${group.specificUser}` : ''}`);
                await sendWebhook(group, newPosts);
                group.postCount = (group.postCount || 0) + newPosts.length;
            } else if (group.specificUserMode && group.specificUser) {
                console.log(`No new posts found from user "${group.specificUser}" in group ${group.name}`);
            }
        }
        
        // Update last checked time and save to storage
        group.lastChecked = Date.now();
        const groupIndex = monitoredGroups.findIndex(g => g.id === groupId);
        if (groupIndex >= 0) {
            monitoredGroups[groupIndex] = group;
            await chrome.storage.sync.set({ monitoredGroups: monitoredGroups });
        }
        
    } catch (error) {
        console.error(`Error checking group ${group.name}:`, error);
    }
}

async function scrapeGroupPosts(group) {
    console.log(`Opening tab for: ${group.url}`);
    
    try {
        // Create tab
        const tab = await chrome.tabs.create({
            url: group.url,
            active: false
        });
        
        console.log(`Created tab ${tab.id} for ${group.name}`);
        
        return new Promise((resolve, reject) => {
            let resolved = false;
            const timeoutMs = 30000; // 30 seconds
            
            // Listen for posts data
            const messageListener = (message, sender) => {
                if (resolved) return;
                
                if (sender.tab && sender.tab.id === tab.id && message.action === 'postsData') {
                    resolved = true;
                    chrome.runtime.onMessage.removeListener(messageListener);
                    
                    console.log(`Received ${message.posts?.length || 0} posts from tab ${tab.id}`);
                    
                    // Close tab
                    chrome.tabs.remove(tab.id).catch(err => 
                        console.error('Error closing tab:', err)
                    );
                    
                    resolve(message.posts || []);
                }
            };
            
            chrome.runtime.onMessage.addListener(messageListener);
            
            // Wait for tab to load, then trigger content script
            const checkAndTrigger = async () => {
                try {
                    const tabInfo = await chrome.tabs.get(tab.id);
                    
                    if (tabInfo.status === 'complete') {
                        console.log(`Tab ${tab.id} loaded, URL: ${tabInfo.url}`);
                        
                        // Check if we're actually on a Facebook group page
                        if (!tabInfo.url.includes('facebook.com/groups/')) {
                            throw new Error('Tab did not navigate to a Facebook group page');
                        }
                        
                        // Wait a bit for Facebook to fully load
                        setTimeout(async () => {
                            try {
                                await chrome.tabs.sendMessage(tab.id, { 
                                    action: 'triggerScraping' 
                                });
                                console.log(`Trigger message sent to tab ${tab.id}`);
                            } catch (msgError) {
                                console.error('Error sending message to content script:', msgError);
                                console.log('This might be normal - content script may auto-trigger');
                            }
                        }, 5000); // Increased wait time
                        
                    } else {
                        // Tab still loading, check again
                        setTimeout(checkAndTrigger, 1000);
                    }
                } catch (tabError) {
                    if (!resolved) {
                        resolved = true;
                        chrome.runtime.onMessage.removeListener(messageListener);
                        chrome.tabs.remove(tab.id).catch(console.error);
                        reject(new Error(`Tab error: ${tabError.message}`));
                    }
                }
            };
            
            // Start checking after a short delay
            setTimeout(checkAndTrigger, 2000);
            
            // Timeout
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    chrome.runtime.onMessage.removeListener(messageListener);
                    chrome.tabs.remove(tab.id).catch(console.error);
                    reject(new Error(`Timeout after ${timeoutMs}ms`));
                }
            }, timeoutMs);
        });
        
    } catch (error) {
        console.error('Error creating tab:', error);
        throw error;
    }
}

async function sendWebhook(group, posts) {
    if (!group.webhook) {
        console.error('No webhook URL configured for group:', group.name);
        return { success: false, error: 'No webhook URL configured' };
    }
    
    // Validate webhook URL
    try {
        new URL(group.webhook);
    } catch (urlError) {
        console.error('Invalid webhook URL:', group.webhook);
        return { success: false, error: 'Invalid webhook URL format' };
    }
    
    // Detect webhook type and format payload accordingly
    const isDiscord = group.webhook.includes('discord.com/api/webhooks');
    const isSlack = group.webhook.includes('hooks.slack.com');
    
    let payload;
    
    if (isDiscord) {
        // Discord webhook format
        const postText = posts.map(post => 
            `**${post.author || 'Unknown User'}**\n${post.content || 'No content'}\n${post.url ? `[View Post](${post.url})` : ''}\n`
        ).join('\n');
        
        const groupTitle = group.specificUserMode 
            ? `📢 New Posts from ${group.specificUser} in ${group.name}`
            : `📢 New Posts from ${group.name}`;
        
        payload = {
            username: "Facebook Groups Monitor",
            avatar_url: "https://static.xx.fbcdn.net/rsrc.php/v3/ys/r/TbNJQd_5E8B.png",
            embeds: [{
                title: groupTitle,
                description: postText || "New post detected",
                color: group.specificUserMode ? 0x9b59b6 : 0x1877f2, // Purple for user-specific, blue for general
                fields: [
                    {
                        name: "Group",
                        value: `[${group.name}](${group.url})`,
                        inline: true
                    },
                    {
                        name: "Posts Count",
                        value: posts.length.toString(),
                        inline: true
                    },
                    {
                        name: "Timestamp",
                        value: new Date().toLocaleString(),
                        inline: true
                    }
                ].concat(group.specificUserMode ? [{
                    name: "Monitoring",
                    value: `👤 ${group.specificUser}`,
                    inline: true
                }] : []),
                footer: {
                    text: "Facebook Groups Monitor Extension" + (group.specificUserMode ? ` - User: ${group.specificUser}` : "")
                }
            }]
        };
    } else if (isSlack) {
        // Slack webhook format
        const postText = posts.map(post => 
            `*${post.author || 'Unknown User'}*\n${post.content || 'No content'}\n${post.url ? `<${post.url}|View Post>` : ''}`
        ).join('\n\n');
        
        const groupTitle = group.specificUserMode 
            ? `📢 New Posts from ${group.specificUser} in ${group.name}`
            : `📢 New Posts from ${group.name}`;
        
        payload = {
            text: groupTitle,
            attachments: [{
                color: group.specificUserMode ? "#9b59b6" : "#1877f2",
                fields: [
                    {
                        title: "Posts",
                        value: postText || "New post detected",
                        short: false
                    },
                    {
                        title: "Group",
                        value: `<${group.url}|${group.name}>`,
                        short: true
                    },
                    {
                        title: "Count",
                        value: posts.length.toString(),
                        short: true
                    }
                ].concat(group.specificUserMode ? [{
                    title: "User",
                    value: `👤 ${group.specificUser}`,
                    short: true
                }] : []),
                footer: "Facebook Groups Monitor" + (group.specificUserMode ? ` - User: ${group.specificUser}` : ""),
                ts: Math.floor(Date.now() / 1000)
            }]
        };
    } else {
        // Generic webhook format (webhook.site, Zapier, etc.)
        payload = {
            message: group.specificUserMode 
                ? `New posts from ${group.specificUser} in ${group.name}`
                : `New posts from ${group.name}`,
            group: {
                name: group.name,
                url: group.url,
                id: group.id,
                specificUserMode: group.specificUserMode || false,
                specificUser: group.specificUser || null
            },
            posts: posts.map(post => ({
                id: post.id,
                content: post.content || 'No content',
                author: post.author || 'Unknown User',
                timestamp: post.timestamp,
                url: post.url || group.url,
                type: post.type || 'post'
            })),
            timestamp: new Date().toISOString(),
            postCount: posts.length,
            source: "Facebook Groups Monitor Extension",
            userSpecific: group.specificUserMode || false,
            targetUser: group.specificUser || null
        };
    }
    
    console.log(`Preparing to send ${isDiscord ? 'Discord' : isSlack ? 'Slack' : 'generic'} webhook for ${group.name}`);
    console.log('Webhook URL:', group.webhook);
    console.log('Payload size:', JSON.stringify(payload).length, 'characters');
    console.log('Payload preview:', JSON.stringify(payload, null, 2).substring(0, 1000) + '...');
    
    try {
        console.log(`🚀 Sending webhook request to: ${group.webhook}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
        
        const response = await fetch(group.webhook, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Facebook-Groups-Monitor-Extension/1.0',
                'Accept': 'application/json, text/plain, */*'
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        console.log(`📡 Webhook response received:`);
        console.log(`- Status: ${response.status} ${response.statusText}`);
        console.log(`- OK: ${response.ok}`);
        console.log(`- Headers:`, Object.fromEntries(response.headers.entries()));
        
        // Try to read response body for debugging
        let responseText = '';
        try {
            responseText = await response.text();
            console.log(`- Response body (${responseText.length} chars):`, responseText.substring(0, 500));
        } catch (bodyError) {
            console.log('- Could not read response body:', bodyError.message);
            responseText = `Error reading body: ${bodyError.message}`;
        }
        
        if (response.ok) {
            console.log(`✅ Webhook sent successfully for ${group.name}`);
            return { 
                success: true, 
                status: response.status, 
                statusText: response.statusText,
                body: responseText 
            };
        } else {
            console.error(`❌ Webhook failed for ${group.name}:`);
            console.error(`- HTTP ${response.status}: ${response.statusText}`);
            console.error(`- Response: ${responseText}`);
            return { 
                success: false, 
                status: response.status, 
                statusText: response.statusText,
                error: `HTTP ${response.status}: ${response.statusText}`,
                body: responseText 
            };
        }
        
    } catch (error) {
        console.error(`❌ Webhook network error for ${group.name}:`, error);
        
        let errorMessage = error.message;
        if (error.name === 'AbortError') {
            errorMessage = 'Request timed out after 15 seconds';
        } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorMessage = 'Network error - check URL and internet connection';
        }
        
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        
        return { 
            success: false, 
            error: errorMessage,
            errorType: error.name
        };
    }
}

// Handle extension startup
chrome.runtime.onStartup.addListener(async () => {
    try {
        const result = await chrome.storage.sync.get(['monitoredGroups', 'monitoringActive']);
        monitoredGroups = result.monitoredGroups || [];
        isMonitoring = result.monitoringActive || false;
        
        console.log('Extension startup: Loaded state');
        
        if (isMonitoring && monitoredGroups.length > 0) {
            startMonitoring();
        }
    } catch (error) {
        console.error('Error on startup:', error);
    }
});