const CACHE_NAME = 'sun-exposure-v1.0.0';
const urlsToCache = [
    '/',
    '/index.html',
    '/script.js',
    '/config.js',
    '/site.webmanifest',
    'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdn.tailwindcss.com'
];

// Install event - cache resources
self.addEventListener('install', function(event) {
    console.log('Service Worker installing');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('Caching app shell');
                return cache.addAll(urlsToCache.map(url => new Request(url, {cache: 'reload'})));
            })
            .catch(function(error) {
                console.error('Failed to cache resources:', error);
            })
    );
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', function(event) {
    console.log('Service Worker activating');
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                // Return cached version if available
                if (response) {
                    return response;
                }
                
                // For navigation requests, try network first
                if (event.request.mode === 'navigate') {
                    return fetch(event.request).catch(() => {
                        return caches.match('/index.html');
                    });
                }
                
                // For other requests, try network first, fallback to cache
                return fetch(event.request).then(function(response) {
                    // Don't cache non-successful responses
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    
                    // Cache successful responses for next time
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then(function(cache) {
                            cache.put(event.request, responseToCache);
                        });
                    
                    return response;
                }).catch(function() {
                    // Network failed, try to serve from cache
                    return caches.match(event.request);
                });
            })
    );
});

// Handle messages from main thread
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});