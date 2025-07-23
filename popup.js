document.addEventListener('DOMContentLoaded', function() {
    const addGroupBtn = document.getElementById('addGroup');
    const toggleMonitoringBtn = document.getElementById('toggleMonitoring');
    const statusMessage = document.getElementById('statusMessage');
    const groupsList = document.getElementById('groupsList');
    const monitoringStatus = document.getElementById('monitoringStatus');

    // Load saved groups and monitoring status on popup open
    loadGroups();
    updateMonitoringStatus();

    addGroupBtn.addEventListener('click', addGroup);
    toggleMonitoringBtn.addEventListener('click', toggleMonitoring);

    // Handle specific user checkbox toggle
    document.getElementById('specificUserMode').addEventListener('change', function(e) {
        const specificUserGroup = document.getElementById('specificUserGroup');
        if (e.target.checked) {
            specificUserGroup.style.display = 'block';
        } else {
            specificUserGroup.style.display = 'none';
            document.getElementById('specificUser').value = '';
        }
    });

    async function addGroup() {
        const name = document.getElementById('groupName').value.trim();
        const url = document.getElementById('groupUrl').value.trim();
        const webhook = document.getElementById('webhookUrl').value.trim();
        const interval = parseInt(document.getElementById('checkInterval').value);
        const specificUserMode = document.getElementById('specificUserMode').checked;
        const specificUser = document.getElementById('specificUser').value.trim();

        if (!name || !url || !webhook) {
            showStatus('Please fill in all required fields', 'error');
            return;
        }

        if (specificUserMode && !specificUser) {
            showStatus('Please enter a specific user name when user monitoring is enabled', 'error');
            return;
        }

        if (!isValidFacebookGroupUrl(url)) {
            showStatus('Please enter a valid Facebook group URL', 'error');
            return;
        }

        if (!isValidUrl(webhook)) {
            showStatus('Please enter a valid webhook URL', 'error');
            return;
        }

        try {
            const result = await chrome.storage.sync.get(['monitoredGroups']);
            const groups = result.monitoredGroups || [];
            
            // Check if group already exists
            if (groups.some(group => group.url === url)) {
                showStatus('This group is already being monitored', 'error');
                return;
            }

            const newGroup = {
                id: Date.now().toString(),
                name,
                url,
                webhook,
                interval: interval || 5,
                lastChecked: null,
                postCount: 0,
                active: true,
                specificUserMode: specificUserMode,
                specificUser: specificUserMode ? specificUser : null
            };

            groups.push(newGroup);
            await chrome.storage.sync.set({ monitoredGroups: groups });

            // Clear form
            document.getElementById('groupName').value = '';
            document.getElementById('groupUrl').value = '';
            document.getElementById('webhookUrl').value = '';
            document.getElementById('checkInterval').value = '5';
            document.getElementById('specificUserMode').checked = false;
            document.getElementById('specificUser').value = '';
            document.getElementById('specificUserGroup').style.display = 'none';

            showStatus('Group added successfully! Fetching latest post...', 'success');
            loadGroups();

            // Update background script and fetch latest post
            chrome.runtime.sendMessage({ 
                action: 'updateGroups', 
                groups: groups 
            });

            // Wait a moment for the background script to process, then fetch latest post
            setTimeout(() => {
                chrome.runtime.sendMessage({ 
                    action: 'fetchLatestPost', 
                    groupId: newGroup.id 
                }, (response) => {
                    if (response && response.success) {
                        showStatus('Latest post sent to webhook!', 'success');
                    } else {
                        showStatus('Group added, but could not fetch latest post: ' + (response?.error || 'Unknown error'), 'error');
                    }
                });
            }, 1000);
        } catch (error) {
            showStatus('Error adding group: ' + error.message, 'error');
        }
    }

    async function removeGroup(groupId) {
        if (!confirm('Are you sure you want to remove this group?')) {
            return;
        }

        try {
            const result = await chrome.storage.sync.get(['monitoredGroups']);
            const groups = result.monitoredGroups || [];
            const filteredGroups = groups.filter(group => group.id !== groupId);
            
            await chrome.storage.sync.set({ monitoredGroups: filteredGroups });
            loadGroups();
            showStatus('Group removed successfully!', 'success');

            // Update background script
            chrome.runtime.sendMessage({ action: 'updateGroups', groups: filteredGroups });
        } catch (error) {
            showStatus('Error removing group: ' + error.message, 'error');
        }
    }

    async function toggleGroupActive(groupId) {
        try {
            const result = await chrome.storage.sync.get(['monitoredGroups']);
            const groups = result.monitoredGroups || [];
            const group = groups.find(g => g.id === groupId);
            
            if (group) {
                group.active = !group.active;
                await chrome.storage.sync.set({ monitoredGroups: groups });
                loadGroups();
                
                const status = group.active ? 'activated' : 'deactivated';
                showStatus(`Group ${status} successfully!`, 'success');

                // Update background script
                chrome.runtime.sendMessage({ action: 'updateGroups', groups: groups });
            }
        } catch (error) {
            showStatus('Error updating group: ' + error.message, 'error');
        }
    }

    async function toggleMonitoring() {
        try {
            const result = await chrome.storage.sync.get(['monitoringActive']);
            const isActive = result.monitoringActive || false;
            const newStatus = !isActive;
            
            await chrome.storage.sync.set({ monitoringActive: newStatus });
            
            // Send message to background script
            chrome.runtime.sendMessage({ 
                action: newStatus ? 'startMonitoring' : 'stopMonitoring' 
            });
            
            updateMonitoringStatus();
            showStatus(newStatus ? 'Monitoring started!' : 'Monitoring stopped!', 'success');
        } catch (error) {
            showStatus('Error toggling monitoring: ' + error.message, 'error');
        }
    }

    async function updateMonitoringStatus() {
        try {
            const result = await chrome.storage.sync.get(['monitoringActive']);
            const isActive = result.monitoringActive || false;
            
            const indicator = monitoringStatus.querySelector('.status-indicator');
            if (isActive) {
                indicator.className = 'status-indicator status-active';
                monitoringStatus.innerHTML = '<span class="status-indicator status-active"></span>Monitoring Status: Active';
                toggleMonitoringBtn.textContent = 'Stop Monitoring';
            } else {
                indicator.className = 'status-indicator status-inactive';
                monitoringStatus.innerHTML = '<span class="status-indicator status-inactive"></span>Monitoring Status: Inactive';
                toggleMonitoringBtn.textContent = 'Start Monitoring';
            }
        } catch (error) {
            console.error('Error updating monitoring status:', error);
        }
    }

    async function loadGroups() {
        try {
            const result = await chrome.storage.sync.get(['monitoredGroups']);
            const groups = result.monitoredGroups || [];
            
            if (groups.length === 0) {
                groupsList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No groups added yet</p>';
                return;
            }

            groupsList.innerHTML = groups.map(group => `
                <div class="group-item">
                    <div class="group-name">${escapeHtml(group.name)} ${group.active ? '' : '(Inactive)'}${group.specificUserMode ? ` - Monitoring: ${escapeHtml(group.specificUser)}` : ''}</div>
                    <div class="group-url">${escapeHtml(group.url)}</div>
                    <div class="group-webhook">Webhook: ${escapeHtml(group.webhook)}</div>
                    ${group.specificUserMode ? `<div style="font-size: 12px; color: #e67e22; margin-bottom: 5px;">👤 Monitoring posts from: <strong>${escapeHtml(group.specificUser)}</strong></div>` : ''}
                    <div style="font-size: 12px; color: #666; margin-bottom: 10px;">
                        Interval: ${group.interval} min | Posts: ${group.postCount} | 
                        Last checked: ${group.lastChecked ? new Date(group.lastChecked).toLocaleString() : 'Never'}
                    </div>
                    <div class="group-actions">
                        <button class="btn btn-small toggle-btn" data-group-id="${group.id}">
                            ${group.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button class="btn btn-small btn-test test-btn" data-group-id="${group.id}">Test Latest Post</button>
                        <button class="btn btn-small webhook-test-btn" data-group-id="${group.id}">Test Webhook</button>
                        <button class="btn btn-small btn-danger remove-btn" data-group-id="${group.id}">Remove</button>
                    </div>
                </div>
            `).join('');

            // Add event listeners for dynamically created buttons
            addButtonEventListeners();
        } catch (error) {
            groupsList.innerHTML = '<p style="color: red;">Error loading groups: ' + error.message + '</p>';
        }
    }

    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = `status ${type}`;
        statusMessage.style.display = 'block';
        
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 3000);
    }

    function isValidFacebookGroupUrl(url) {
        const fbGroupPattern = /^https?:\/\/(www\.)?facebook\.com\/groups\/[a-zA-Z0-9._-]+/;
        return fbGroupPattern.test(url);
    }

    function isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    // Function to fetch latest post for testing
    async function fetchLatestPost(groupId) {
        showStatus('Fetching latest post...', 'success');
        
        // First reload groups to make sure we have the latest data
        await loadGroups();
        
        try {
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ 
                    action: 'fetchLatestPost', 
                    groupId: groupId 
                }, resolve);
            });
            
            console.log('Response from background:', response);
            
            if (response && response.success && response.webhookSent) {
                showStatus('Latest post sent to webhook successfully!', 'success');
            } else if (response && response.postFound && !response.webhookSent) {
                showStatus(`Post found but webhook failed: ${response.error}`, 'error');
                console.error('Webhook failure details:', response);
            } else if (response && response.postFound === false) {
                showStatus(`No posts found: ${response.error}`, 'error');
            } else {
                showStatus(`Error: ${response?.error || 'Could not fetch latest post'}`, 'error');
                console.error('Full response:', response);
            }
        } catch (error) {
            showStatus('Error communicating with background script', 'error');
            console.error('Error:', error);
        }
    }

    // Function to test webhook URL
    async function testWebhook(groupId) {
        const group = await getGroupById(groupId);
        if (!group) {
            showStatus('Group not found', 'error');
            return;
        }
        
        showStatus('Testing webhook...', 'success');
        
        try {
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ 
                    action: 'testWebhook', 
                    webhook: group.webhook
                }, resolve);
            });
            
            if (response && response.success) {
                showStatus(`Webhook test successful! Status: ${response.status}`, 'success');
                console.log('Test webhook response:', response);
            } else {
                const errorMsg = response?.error || 'Unknown error';
                const statusInfo = response?.status ? ` (Status: ${response.status})` : '';
                showStatus(`Webhook test failed: ${errorMsg}${statusInfo}`, 'error');
                console.error('Test webhook failure:', response);
            }
        } catch (error) {
            showStatus('Error testing webhook', 'error');
            console.error('Error:', error);
        }
    }

    async function getGroupById(groupId) {
        try {
            const result = await chrome.storage.sync.get(['monitoredGroups']);
            const groups = result.monitoredGroups || [];
            return groups.find(g => g.id === groupId);
        } catch (error) {
            console.error('Error getting group:', error);
            return null;
        }
    }

    // Add event listeners for dynamically created buttons
    function addButtonEventListeners() {
        // Remove button listeners
        document.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const groupId = e.target.getAttribute('data-group-id');
                removeGroup(groupId);
            });
        });

        // Toggle active button listeners
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const groupId = e.target.getAttribute('data-group-id');
                toggleGroupActive(groupId);
            });
        });

        // Test button listeners
        document.querySelectorAll('.test-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const groupId = e.target.getAttribute('data-group-id');
                fetchLatestPost(groupId);
            });
        });

        // Webhook test button listeners
        document.querySelectorAll('.webhook-test-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const groupId = e.target.getAttribute('data-group-id');
                testWebhook(groupId);
            });
        });
    }
});