/* eslint-disable no-restricted-globals */

// This service worker can be customized!
// See https://developers.google.com/web/tools/workbox/modules
// for the list of available Workbox modules, or add any other
// code you'd like.
// You can also remove this file if you'd prefer not to use a
// service worker, and the Workbox build step will be skipped.

import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { openDB } from 'idb'
import { CacheFirst } from 'workbox-strategies'
import { NetworkFirst } from 'workbox-strategies'

let dbPromise
const clientRecordingStates = {}
const DB_VERSION = 1

clientsClaim()

// Precache all of the assets generated by your build process.
// Their URLs are injected into the manifest variable below.
// This variable must be present somewhere in your service worker file,
// even if you decide not to use precaching. See https://cra.link/PWA
precacheAndRoute(self.__WB_MANIFEST)

/**
 * A test to see if another precacheAndRouteCall works (it does).
 * Limitation: files need to be explicitly specified; I haven't found
 * a way to use a glob yet.
 * Maybe this could be handled by a cache-first route? It wouldn't be precached.
 * (Cache-first route is down below)
 */
precacheAndRoute([
    { url: './vendor/jquery-3.3.1.min.js', revision: null },
    { url: 'nonexistent/url-v1.png', revision: null },
])

/**
 * (Kai: Do we need this? It might let us move away from a hash router?)
 */
// Set up App Shell-style routing, so that all navigation requests
// are fulfilled with your index.html shell. Learn more at
// https://developers.google.com/web/fundamentals/architecture/app-shell
const fileExtensionRegexp = new RegExp('/[^/?]+\\.[^/]+$')
registerRoute(
    // Return false to exempt requests from being fulfilled by index.html.
    ({ request, url }) => {
        // If this isn't a navigation, skip.
        if (request.mode !== 'navigate') {
            return false
        } // If this is a URL that starts with /_, skip.

        if (url.pathname.startsWith('/_')) {
            return false
        } // If this looks like a URL for a resource, because it contains // a file extension, skip.

        if (url.pathname.match(fileExtensionRegexp)) {
            return false
        } // Return true to signal that we want to use the handler.

        return true
    },
    createHandlerBoundToURL(process.env.PUBLIC_URL + '/index.html')
)

/**
 * Possible cache-first route for 'vendor' files, if precaching is too complicated.
 * Do we want to add i18n files here too?
 */
registerRoute(
    /(.*)\/vendor\/(.*)/,
    new CacheFirst({
        cacheName: 'vendor',
        plugins: [new ExpirationPlugin({ maxAgeSeconds: 30 * 24 * 60 * 60 })], // 30 days
    })
)

/**
 * Todo: network-first, but in recording mode
 */
registerRoute(
    ({ url, request, event }) => isClientRecording(event.clientId),
    handleRecordedRequest
)

/**
 * Network-first caching by default unless filtered out
 */
registerRoute(({ url, request, event }) => {
    // Don't cache external requests by default
    // QUESTION: Can this safely be generalized to all apps?
    if (url.origin !== self.location.origin) return false
    // TODO: if (url matches filter) return false
    return true
}, new NetworkFirst({ cacheName: 'app-shell', plugins: [new ExpirationPlugin({ maxAgeSeconds: 30 * 24 * 60 * 60 })] }))

// This allows the web app to trigger skipWaiting via
// registration.waiting.postMessage({type: 'SKIP_WAITING'})
// Paired with `clientsClaim()` at top of file.
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting()
    }

    if (event.data && event.data.type === 'START_RECORDING') {
        startRecording(event)
    }

    if (event.data && event.data.type === 'COMPLETE_RECORDING') {
        completeRecording(event.source.id) // same as FetchEvent.clientId
    }

    if (event.data && event.data.type === 'DELETE_RECORDED_SECTION') {
        deleteRecordedSection(event.data.payload?.sectionId)
    }
})

// Any other custom service worker logic can go here.

// Open DB on activation
self.addEventListener('activate', (event) => {
    console.log('[SW] New service worker activated')
    event.waitUntil(createDB())
})

function createDB() {
    dbPromise = openDB('recorded-section-store', DB_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
            // DB versioning trick that can iteratively apply upgrades
            // https://developers.google.com/web/ilt/pwa/working-with-indexeddb#using_database_versioning
            // eslint-disable-next-line default-case
            switch (oldVersion) {
                case 0:
                    // Any indexes needed here?
                    db.createObjectStore('recorded-sections', {
                        keyPath: 'sectionId',
                    })
            }
        },
    })
}

/**
 * Recording mode helpers
 */

function getCacheKey(...args) {
    return args.join('-')
}

function isClientRecording(clientId) {
    return clientRecordingStates[clientId]?.recording
}

function addToCache(cacheKey, request, response) {
    if (response.ok) {
        console.log(`[SW] Response ok - adding ${request.url} to cache`)
        const responseClone = response.clone()
        caches.open(cacheKey).then((cache) => cache.put(request, responseClone))
    }
}

// Triggered on 'START_RECORDING' message
function startRecording(event) {
    console.log('[SW] Starting recording')
    if (!event.data.payload?.sectionId)
        throw new Error('[SW] No section ID specified to record')

    const clientId = event.source.id // clientId from MessageEvent
    // Throw error if another recording is in process
    if (isClientRecording(clientId))
        throw new Error(
            "[SW] Can't start a new recording; a recording is already in process"
        )

    const newClientRecordingState = {
        // 'recordingAll' might be necessary between 'done recording' and 'confirm save recording'
        recording: true,
        sectionId: event.data.payload?.sectionId,
        pendingRequests: new Map(),
        fulfilledRequests: new Map(),
        recordingTimeout: undefined,
        recordingTimeoutDelay: event.data.payload?.recordingTimeoutDelay || 200,
        confirmationTimeout: undefined,
    }
    clientRecordingStates[clientId] = newClientRecordingState
}

function removeRecording(clientId) {
    console.log('[SW] Removing recording for client ID', clientId)
    // Remove recording state
    delete clientRecordingStates[clientId]
    // Delete temp cache
    const cacheKey = getCacheKey('temp', clientId)
    return caches.delete(cacheKey)
}

// Triggered by 'COMPLETE_RECORDING' message
async function completeRecording(clientId) {
    const recordingState = clientRecordingStates[clientId]
    console.log('[SW] Completing recording', { clientId, recordingState })
    clearTimeout(recordingState.confirmationTimeout)

    // Move requests from temp cache to section-<ID> cache
    const sectionCacheKey = getCacheKey('section', recordingState.sectionId)
    const sectionCache = await caches.open(sectionCacheKey)
    const tempCache = await caches.open(getCacheKey('temp', clientId))
    const tempCacheItemKeys = await tempCache.keys()
    tempCacheItemKeys.forEach(async (request) => {
        const response = await tempCache.match(request)
        sectionCache.put(request, response)
    })

    // Add content to DB
    const db = await dbPromise
    db.put('recorded-sections', {
        // Note that request objects can't be stored in the IDB
        // https://stackoverflow.com/questions/32880073/whats-the-best-option-for-structured-cloning-of-a-fetch-api-request-object
        sectionId: recordingState.sectionId, // the key path
        cacheKey: sectionCacheKey,
        lastUpdated: new Date(),
        requests: recordingState.fulfilledRequests,
    }).catch((err) => console.error)

    removeRecording(clientId)
}

function startConfirmationTimeout(clientId) {
    const recordingState = clientRecordingStates[clientId]
    recordingState.confirmationTimeout = setTimeout(() => {
        console.warn(
            '[SW] Completion confirmation timed out. Clearing recording for client',
            clientId
        )
        removeRecording(clientId)
    }, 10000)
}

async function requestCompletionConfirmation(clientId) {
    console.log(
        '[SW] Requesting completion confirmation from client ID',
        clientId
    )
    const client = await self.clients.get(clientId)
    if (!client) {
        console.log('[SW] Client not found for ID', clientId)
        removeRecording(clientId)
        return
    }
    client.postMessage({ type: 'CONFIRM_RECORDING_COMPLETION', clientId })
    startConfirmationTimeout(clientId)
}

function stopRecording(error, clientId) {
    const recordingState = clientRecordingStates[clientId]

    console.log('[SW] Stopping recording', { clientId, recordingState })
    clearTimeout(recordingState?.recordingTimeout)
    recordingState.recording = false

    if (error) {
        // QUESTION: Anything else we should do to handle errors better?
        self.clients.get(clientId).then((client) => {
            console.log('[SW] posting error message to client', client)
            client.postMessage({
                type: 'RECORDING_ERROR',
                clientId,
                error,
            })
        })
        return
    }

    requestCompletionConfirmation(clientId)
}

function startRecordingTimeout(clientId) {
    const recordingState = clientRecordingStates[clientId]
    recordingState.recordingTimeout = setTimeout(
        () => stopRecording(null, clientId),
        recordingState.recordingTimeoutDelay
    )
}

function handleRecordedResponse(request, response, clientId) {
    const recordingState = clientRecordingStates[clientId]
    // add response to temp cache - when recording is successful, move to permanent cache
    const tempCacheKey = getCacheKey('temp', clientId)
    addToCache(tempCacheKey, request, response)

    // add request to fulfilled
    // note that request objects can't be stored in IDB (see 'complet recording' function)
    // QUESTION: Something better to store as value? If not, an array may be appropriate
    recordingState.fulfilledRequests.set(request.url, 'placeholder-value')

    // remove request from pending requests
    recordingState.pendingRequests.delete(request)

    // start timer if pending requests are all complete
    if (recordingState.pendingRequests.size === 0)
        startRecordingTimeout(clientId)
    return response
}

function handleRecordedRequest({ url, request, event, params }) {
    const recordingState = clientRecordingStates[event.clientId]

    clearTimeout(recordingState.recordingTimeout)
    recordingState.pendingRequests.set(request, 'placeholder') // Something better to put here? timestamp?

    fetch(request)
        .then((response) => {
            return handleRecordedResponse(request, response, event.clientId)
        })
        .catch((error) => {
            console.errror(error)
            stopRecording(error, event.clientId)
        })
}

async function deleteRecordedSection(sectionId) {
    if (!sectionId) throw new Error('[SW] No section ID specified to delete')
    const db = await dbPromise
    const cacheKey = getCacheKey('section', sectionId)
    return Promise.all([
        caches.delete(cacheKey),
        db.delete('recorded-sections', sectionId),
    ])
}
