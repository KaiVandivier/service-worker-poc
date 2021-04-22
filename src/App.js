import React from 'react'
import logo from './logo.svg'
import './App.css'

function App() {
    // This function should be provided by the API
    function recordRequests(networkAction, recordingTimeoutDelay) {
        console.log('[App] Sending "Start recording" message')
        navigator.serviceWorker.controller?.postMessage({
            type: 'START_RECORDING',
            recordingTimeoutDelay,
            sectionId: 'testId1234',
        })
        return networkAction()
    }

    async function cascadingRequests() {
        console.log('[App] Cascading requests started')

        const unsplashBaseUrl = 'https://source.unsplash.com/featured/?'
        const keywords = ['nature1', 'water2', 'cat3', 'bird4']

        const res1 = await fetch(unsplashBaseUrl + keywords[0])
        const res2 = await fetch(unsplashBaseUrl + keywords[1])
        console.log('[App] responses: (now waiting 500ms)', {
            res1,
            res2,
        })

        await new Promise((resolve) => {
            setTimeout(resolve, 500)
        })
        console.log(
            '[App] Finished 500 ms wait between requests - fetching again'
        )

        const res3 = await fetch(unsplashBaseUrl + keywords[2])
        console.log('[App] Res 3: (now waiting 1.5s)', { res3 })

        await new Promise((resolve) => {
            setTimeout(resolve, 1500)
        })
        console.log('[App] Finished 1.5s wait - fetching again')

        const res4 = await fetch(unsplashBaseUrl + keywords[3])
        console.log('[App] Finished final fetch in cascadingRequests:', {
            res4,
        })
        return { res1, res2, res3, res4 }
    }

    async function onClick() {
        const recordingTimeoutDelay = 2000
        console.log('[App] Triggering cascading requests and recording', {
            recordingTimeoutDelay,
        })
        const res = await recordRequests(
            cascadingRequests,
            recordingTimeoutDelay
        )
        console.log('[App] result of recordResults callback:', { res })
    }

    function deleteSection() {
      console.log('[SW] Attempting to delete section...')
        navigator.serviceWorker.controller?.postMessage({
            type: 'DELETE_RECORDED_SECTION',
            payload: { sectionId: 'testId1234' },
        })
    }

    function skipWaiting() {
        navigator.serviceWorker.controller?.postMessage({
            type: 'SKIP_WAITING',
        })
    }

    return (
        <div className="App">
            <header className="App-header">
                <img src={logo} className="App-logo" alt="logo" />
                <p>
                    Edit <code>src/App.js</code> and save to reload.
                </p>
                <div className="button-container">
                    <button onClick={skipWaiting}>
                        {"Skip waiting (doesn't seem to work)"}
                    </button>
                    <button onClick={onClick}>
                        {'Trigger cascading requests & record'}
                    </button>
                    <button onClick={deleteSection}>
                        {'Delete recorded section'}
                    </button>
                    <p>Links to static resources:</p>
                    <a href="./cats/green-cat-png.png" className="App-link">
                        Green cat
                    </a>
                    <a href="./cats/fluffy-cat-png.png" className="App-link">
                        Fluffy cat
                    </a>
                    <a
                        href="./cats/transparent-orange-white-cat-png.png"
                        className="App-link"
                    >
                        Orange cat
                    </a>
                </div>
            </header>
        </div>
    )
}

export default App
