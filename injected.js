// Injected script that runs in the page context to access Facebook's internal data

(function() {
    'use strict';
    
    console.log('Facebook Groups Monitor: Injected script loaded');
    
    // Wait for Facebook to load
    setTimeout(() => {
        try {
            scrapeFacebookData();
        } catch (error) {
            console.error('Error in injected script:', error);
            // Send empty data if error occurs
            window.postMessage({
                type: 'FACEBOOK_POSTS_DATA',
                posts: []
            }, '*');
        }
    }, 2000);
    
    function scrapeFacebookData() {
        const posts = [];
        
        // Try multiple approaches to get post data
        
        // Approach 1: Look for React fiber data
        try {
            const fiberPosts = extractFromReactFiber();
            if (fiberPosts.length > 0) {
                posts.push(...fiberPosts);
            }
        } catch (error) {
            console.log('React fiber extraction failed:', error);
        }
        
        // Approach 2: Enhanced DOM scraping
        try {
            const domPosts = enhancedDOMScraping();
            if (domPosts.length > 0) {
                posts.push(...domPosts);
            }
        } catch (error) {
            console.log('Enhanced DOM scraping failed:', error);
        }
        
        // Approach 3: Look for GraphQL data in the page
        try {
            const graphqlPosts = extractFromGraphQL();
            if (graphqlPosts.length > 0) {
                posts.push(...graphqlPosts);
            }
        } catch (error) {
            console.log('GraphQL extraction failed:', error);
        }
        
        // Remove duplicates based on content and author
        const uniquePosts = removeDuplicates(posts);
        
        console.log(`Found ${uniquePosts.length} unique posts`);
        
        // Send data back to content script
        window.postMessage({
            type: 'FACEBOOK_POSTS_DATA',
            posts: uniquePosts
        }, '*');
    }
    
    function extractFromReactFiber() {
        const posts = [];
        
        // Look for React fiber nodes that might contain post data
        const elements = document.querySelectorAll('[data-pagelet^="FeedUnit"], [role="article"]');
        
        elements.forEach(element => {
            try {
                // Get React fiber from element
                const fiberKey = Object.keys(element).find(key => key.startsWith('__reactInternalInstance') || key.startsWith('_reactInternalFiber'));
                if (fiberKey) {
                    const fiber = element[fiberKey];
                    const postData = traverseFiberForPostData(fiber);
                    if (postData) {
                        posts.push(postData);
                    }
                }
            } catch (error) {
                console.log('Error extracting from fiber:', error);
            }
        });
        
        return posts;
    }
    
    function traverseFiberForPostData(fiber) {
        // This is a simplified version - Facebook's actual structure is complex
        try {
            let current = fiber;
            let depth = 0;
            
            while (current && depth < 10) {
                if (current.memoizedProps || current.pendingProps) {
                    const props = current.memoizedProps || current.pendingProps;
                    
                    // Look for post-like data structures
                    if (props.story || props.post || props.feedback) {
                        return extractPostFromProps(props);
                    }
                }
                
                current = current.return || current.child;
                depth++;
            }
        } catch (error) {
            console.log('Error traversing fiber:', error);
        }
        
        return null;
    }
    
    function extractPostFromProps(props) {
        try {
            const post = {
                id: '',
                content: '',
                author: '',
                timestamp: null,
                url: '',
                type: 'post'
            };
            
            // Extract data from props structure
            const story = props.story || props.post;
            if (story) {
                post.id = story.id || story.post_id || '';
                post.content = story.message || story.story || '';
                
                if (story.actors && story.actors[0]) {
                    post.author = story.actors[0].name || '';
                }
                
                if (story.created_time) {
                    post.timestamp = new Date(story.created_time * 1000).toISOString();
                }
                
                if (story.permalink) {
                    post.url = story.permalink;
                }
            }
            
            return post.content || post.author ? post : null;
        } catch (error) {
            console.log('Error extracting from props:', error);
            return null;
        }
    }
    
    function enhancedDOMScraping() {
        const posts = [];
        
        // More comprehensive selectors for Facebook posts
        const postSelectors = [
            '[data-pagelet^="FeedUnit"]',
            '[role="article"]',
            '[data-testid="story-subtitle"]',
            '.userContentWrapper',
            '[data-ad-preview="message"]'
        ];
        
        let postElements = [];
        
        for (const selector of postSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                postElements = Array.from(elements);
                break;
            }
        }
        
        postElements.forEach((element, index) => {
            try {
                const post = extractPostFromElement(element, index);
                if (post) {
                    posts.push(post);
                }
            } catch (error) {
                console.log('Error extracting post from element:', error);
            }
        });
        
        return posts;
    }
    
    function extractPostFromElement(element, index) {
        const post = {
            id: `dom_post_${index}_${Date.now()}`,
            content: '',
            author: '',
            timestamp: null,
            url: '',
            type: 'post',
            images: [],
            links: []
        };
        
        // Extract text content
        const textSelectors = [
            '[data-testid="post_message"]',
            '.userContent',
            '[data-ad-preview="message"]',
            '.kvgmc6g5.cxmmr5t8.oygrvhab.hcukyx3x.c1et5uql.ii04i59q',
            'div[dir="auto"]'
        ];
        
        for (const selector of textSelectors) {
            const textElement = element.querySelector(selector);
            if (textElement && textElement.textContent.trim()) {
                post.content = textElement.textContent.trim();
                break;
            }
        }
        
        // Extract author name
        const authorSelectors = [
            'h3 a[role="link"]',
            '.actor-link',
            '[data-testid="post_author_name"]',
            'strong a'
        ];
        
        for (const selector of authorSelectors) {
            const authorElement = element.querySelector(selector);
            if (authorElement && authorElement.textContent.trim()) {
                post.author = authorElement.textContent.trim();
                break;
            }
        }
        
        // Extract timestamp
        const timeSelectors = [
            'a[role="link"][tabindex="0"]',
            '.timestampContent',
            'abbr[data-utime]'
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
            if (img.src && !img.src.includes('emoji') && !img.src.includes('reaction')) {
                post.images.push(img.src);
            }
        });
        
        return (post.content || post.author) ? post : null;
    }
    
    function extractFromGraphQL() {
        const posts = [];
        
        try {
            // Look for GraphQL responses in the page
            const scripts = document.querySelectorAll('script');
            
            scripts.forEach(script => {
                if (script.textContent.includes('graphql') || script.textContent.includes('edge_')) {
                    try {
                        // Try to parse JSON data that might contain posts
                        const matches = script.textContent.match(/\{.*"edges".*\}/g);
                        if (matches) {
                            matches.forEach(match => {
                                try {
                                    const data = JSON.parse(match);
                                    const extractedPosts = extractPostsFromGraphQLData(data);
                                    posts.push(...extractedPosts);
                                } catch (e) {
                                    // Ignore parsing errors
                                }
                            });
                        }
                    } catch (error) {
                        // Ignore errors
                    }
                }
            });
        } catch (error) {
            console.log('Error extracting from GraphQL:', error);
        }
        
        return posts;
    }
    
    function extractPostsFromGraphQLData(data) {
        const posts = [];
        
        try {
            // Recursively search for post-like objects
            function searchForPosts(obj) {
                if (typeof obj !== 'object' || obj === null) return;
                
                if (Array.isArray(obj)) {
                    obj.forEach(searchForPosts);
                    return;
                }
                
                // Check if this looks like a post object
                if (obj.message || obj.story || (obj.node && (obj.node.message || obj.node.story))) {
                    const postNode = obj.node || obj;
                    const post = {
                        id: postNode.id || `graphql_${Date.now()}_${Math.random()}`,
                        content: postNode.message || postNode.story || '',
                        author: postNode.author ? postNode.author.name : '',
                        timestamp: postNode.created_time ? new Date(postNode.created_time * 1000).toISOString() : null,
                        url: postNode.url || postNode.permalink_url || '',
                        type: 'post'
                    };
                    
                    if (post.content || post.author) {
                        posts.push(post);
                    }
                }
                
                // Continue searching recursively
                Object.values(obj).forEach(searchForPosts);
            }
            
            searchForPosts(data);
        } catch (error) {
            console.log('Error searching GraphQL data:', error);
        }
        
        return posts;
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
                { regex: /(\d+)\s*s/, multiplier: 1000 },
                { regex: /(\d+)\s*m/, multiplier: 60 * 1000 },
                { regex: /(\d+)\s*h/, multiplier: 60 * 60 * 1000 },
                { regex: /(\d+)\s*d/, multiplier: 24 * 60 * 60 * 1000 },
                { regex: /(\d+)\s*w/, multiplier: 7 * 24 * 60 * 60 * 1000 }
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
    
    function removeDuplicates(posts) {
        const seen = new Set();
        return posts.filter(post => {
            const key = `${post.content}_${post.author}`.toLowerCase();
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }
    
})();