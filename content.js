// Content script for Facebook Groups Monitor Extension

(function() {
    'use strict';
    
    let isScrapingPosts = false;
    let scrapingAttempts = 0;
    const MAX_ATTEMPTS = 3;
    
    console.log('Content script loaded on:', window.location.href);
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('Content script: Received message:', message);
        
        if (message.action === 'scrapePosts' || message.action === 'triggerScraping') {
            console.log('Content script: Received scraping trigger');
            scrapePosts();
            sendResponse({ success: true });
        }
        return true;
    });
    
    // Listen for custom events to trigger scraping
    window.addEventListener('triggerPostScraping', () => {
        console.log('Content script: Triggered by custom event');
        scrapePosts();
    });
    
    // Auto-run post scraping when on a Facebook group page
    if (window.location.href.includes('facebook.com/groups/')) {
        console.log('Content script: Auto-running on Facebook group page');
        // Wait for page to load before scraping
        setTimeout(() => {
            console.log('Content script: Auto-trigger after 5 seconds');
            scrapePosts();
        }, 5000);
    }
    
    // Listen for navigation changes
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            if (url.includes('facebook.com/groups/')) {
                console.log('Content script: Navigation detected, triggering scraping');
                setTimeout(() => {
                    scrapePosts();
                }, 3000);
            }
        }
    }).observe(document, { subtree: true, childList: true });

    function scrapePosts() {
        if (isScrapingPosts) {
            console.log('Content script: Already scraping posts, skipping...');
            return;
        }
        
        isScrapingPosts = true;
        scrapingAttempts++;
        
        console.log(`Content script: Starting post scraping attempt ${scrapingAttempts}/${MAX_ATTEMPTS}`);
        
        // Wait for page to be ready
        if (document.readyState !== 'complete') {
            console.log('Content script: Page not ready, waiting...');
            setTimeout(() => {
                isScrapingPosts = false;
                scrapePosts();
            }, 2000);
            return;
        }
        
        try {
            // Try multiple extraction methods
            let posts = [];
            
            // Method 1: Look for feed posts
            const feedPosts = extractFeedPosts();
            if (feedPosts.length > 0) {
                console.log(`Content script: Found ${feedPosts.length} posts using feed method`);
                posts = feedPosts;
            }
            
            // Method 2: If no posts found, try broader search
            if (posts.length === 0) {
                const broadPosts = extractWithBroadSearch();
                if (broadPosts.length > 0) {
                    console.log(`Content script: Found ${broadPosts.length} posts using broad search`);
                    posts = broadPosts;
                }
            }
            
            // Method 3: Last resort - try to find any text content
            if (posts.length === 0) {
                const textPosts = extractTextContent();
                if (textPosts.length > 0) {
                    console.log(`Content script: Found ${textPosts.length} posts using text extraction`);
                    posts = textPosts;
                }
            }
            
            // Sort posts by timestamp (newest first)
            if (posts.length > 0) {
                posts.sort((a, b) => {
                    const timeA = new Date(a.timestamp).getTime();
                    const timeB = new Date(b.timestamp).getTime();
                    return timeB - timeA;
                });
                
                console.log(`Content script: Successfully extracted ${posts.length} posts`);
                console.log('Content script: Latest post:', posts[0]);
            } else {
                console.log('Content script: No posts found with any method');
                
                // If no posts found and we haven't reached max attempts, try again
                if (scrapingAttempts < MAX_ATTEMPTS) {
                    console.log('Content script: Retrying in 5 seconds...');
                    setTimeout(() => {
                        isScrapingPosts = false;
                        scrapePosts();
                    }, 5000);
                    return;
                }
            }
            
            // Send posts data to background script
            chrome.runtime.sendMessage({
                action: 'postsData',
                posts: posts
            });
            
        } catch (error) {
            console.error('Content script: Error during scraping:', error);
            
            // Send empty result
            chrome.runtime.sendMessage({
                action: 'postsData',
                posts: []
            });
        } finally {
            isScrapingPosts = false;
        }
    }
    
    function extractFeedPosts() {
        const posts = [];
        
        // Updated selectors for current Facebook structure
        const feedSelectors = [
            '[role="main"] [role="article"]',
            '[data-pagelet="FeedUnit_0"]',
            '[data-pagelet^="FeedUnit"]',
            '.userContentWrapper',
            '[data-testid="story-subtitle"]',
            'div[data-ad-preview="message"]'
        ];
        
        let postElements = [];
        
        for (const selector of feedSelectors) {
            postElements = Array.from(document.querySelectorAll(selector));
            if (postElements.length > 0) {
                console.log(`Content script: Found ${postElements.length} elements with selector: ${selector}`);
                break;
            }
        }
        
        postElements.forEach((element, index) => {
            try {
                const post = extractPostFromElement(element, index, 'feed');
                if (post && post.content) {
                    posts.push(post);
                }
            } catch (error) {
                console.log(`Content script: Error extracting post ${index}:`, error);
            }
        });
        
        return posts;
    }
    
    function extractWithBroadSearch() {
        const posts = [];
        
        // Look for any divs that might contain posts
        const allDivs = document.querySelectorAll('div');
        const potentialPosts = [];
        
        allDivs.forEach(div => {
            const text = div.textContent?.trim() || '';
            
            // Filter for potential post content
            if (text.length > 30 && text.length < 5000) {
                // Check if it has links or looks like a post
                const hasLinks = div.querySelector('a[href*="facebook.com"]');
                const hasTimeIndicator = text.match(/\d+[smhdw]|ago|hour|minute|day/i);
                const hasAuthor = div.querySelector('a[role="link"]');
                
                if (hasLinks || hasTimeIndicator || hasAuthor) {
                    potentialPosts.push(div);
                }
            }
        });
        
        console.log(`Content script: Found ${potentialPosts.length} potential post elements`);
        
        // Take the first 10 potential posts to avoid processing too many
        potentialPosts.slice(0, 10).forEach((element, index) => {
            try {
                const post = extractPostFromElement(element, index, 'broad');
                if (post && post.content) {
                    posts.push(post);
                }
            } catch (error) {
                console.log(`Content script: Error extracting broad post ${index}:`, error);
            }
        });
        
        return posts;
    }
    
    function extractTextContent() {
        const posts = [];
        
        // Last resort: just grab some text content from the page
        const textElements = document.querySelectorAll('p, div[dir="auto"], span');
        const foundTexts = new Set();
        
        Array.from(textElements).forEach((element, index) => {
            const text = element.textContent?.trim();
            
            if (text && text.length > 20 && text.length < 2000 && !foundTexts.has(text)) {
                foundTexts.add(text);
                
                const post = {
                    id: `text_${index}_${Date.now()}`,
                    content: text,
                    author: 'Unknown User',
                    timestamp: new Date().toISOString(),
                    url: window.location.href,
                    type: 'text_extraction'
                };
                
                posts.push(post);
                
                // Limit to 5 text posts
                if (posts.length >= 5) {
                    return;
                }
            }
        });
        
        console.log(`Content script: Extracted ${posts.length} text posts as fallback`);
        return posts;
    }
    
    function extractPostFromElement(element, index, method) {
        const post = {
            id: `${method}_post_${index}_${Date.now()}`,
            content: '',
            author: '',
            timestamp: new Date().toISOString(),
            url: window.location.href,
            type: method,
            images: [],
            links: []
        };
        
        // Extract text content
        const textSelectors = [
            '[data-testid="post_message"]',
            '.userContent',
            '[data-ad-preview="message"]',
            'div[dir="auto"]',
            'p',
            'span'
        ];
        
        for (const selector of textSelectors) {
            const textElement = element.querySelector(selector);
            if (textElement && textElement.textContent?.trim()) {
                post.content = textElement.textContent.trim();
                break;
            }
        }
        
        // If no content found, use element's direct text
        if (!post.content) {
            const directText = element.textContent?.trim();
            if (directText && directText.length > 10) {
                // Take first reasonable chunk of text
                post.content = directText.substring(0, 500);
            }
        }
        
        // Extract author name
        const authorSelectors = [
            'h3 a[role="link"]',
            'a[role="link"] strong',
            '.actor-link',
            '[data-testid="post_author_name"]',
            'strong a'
        ];
        
        for (const selector of authorSelectors) {
            const authorElement = element.querySelector(selector);
            if (authorElement && authorElement.textContent?.trim()) {
                post.author = authorElement.textContent.trim();
                break;
            }
        }
        
        // Extract timestamp
        const timeSelectors = [
            'a[role="link"][tabindex="0"]',
            '.timestampContent',
            'abbr[data-utime]',
            'time'
        ];
        
        for (const selector of timeSelectors) {
            const timeElement = element.querySelector(selector);
            if (timeElement) {
                const timeValue = timeElement.getAttribute('data-utime') || 
                               timeElement.getAttribute('title') ||
                               timeElement.textContent;
                
                if (timeValue) {
                    post.timestamp = parseTimestamp(timeValue);
                    if (timeElement.href) {
                        post.url = timeElement.href;
                    }
                    break;
                }
            }
        }
        
        // Extract images
        const images = element.querySelectorAll('img[src]');
        images.forEach(img => {
            if (img.src && !img.src.includes('emoji') && !img.src.includes('static') && img.src.startsWith('http')) {
                post.images.push(img.src);
            }
        });
        
        return post.content ? post : null;
    }
    
    function parseTimestamp(timeText) {
        try {
            // Unix timestamp
            if (/^\d{10}$/.test(timeText)) {
                return new Date(parseInt(timeText) * 1000).toISOString();
            }
            
            // ISO date string
            const date = new Date(timeText);
            if (!isNaN(date.getTime())) {
                return date.toISOString();
            }
            
            // Relative time parsing
            const now = new Date();
            
            if (timeText.includes('now') || timeText.includes('Just now')) {
                return now.toISOString();
            }
            
            const patterns = [
                { regex: /(\d+)\s*s/i, multiplier: 1000 },
                { regex: /(\d+)\s*m/i, multiplier: 60 * 1000 },
                { regex: /(\d+)\s*h/i, multiplier: 60 * 60 * 1000 },
                { regex: /(\d+)\s*d/i, multiplier: 24 * 60 * 60 * 1000 },
                { regex: /(\d+)\s*w/i, multiplier: 7 * 24 * 60 * 60 * 1000 }
            ];
            
            for (const pattern of patterns) {
                const match = timeText.match(pattern.regex);
                if (match) {
                    const value = parseInt(match[1]);
                    return new Date(now.getTime() - value * pattern.multiplier).toISOString();
                }
            }
            
            return now.toISOString();
        } catch (error) {
            return new Date().toISOString();
        }
    }
    
})();