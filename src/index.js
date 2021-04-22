import React from 'react'
import ReactDOM from 'react-dom'
import './index.css'
import App from './App'
import * as serviceWorkerRegistration from './serviceWorkerRegistration'
import reportWebVitals from './reportWebVitals'

ReactDOM.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
    document.getElementById('root')
)

// TODO: Conditionally register/unregister based on d2.config

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
serviceWorkerRegistration.register({
    // These callbacks can be used to prompt user to activate new service worker
    onUpdate: (registration) =>
        console.log(
            'New service worker installed and ready to activate',
            registration
        ),
    onSuccess: (registration) =>
        console.log('New service worker active', registration),
})

// Service worker message interface
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.onmessage = (event) => {
        if (event.data && event.data.type === 'RECORDING_ERROR') {
            console.error(
                '[App] Received recording error',
                event.data.payload.error
            )
        }

        if (event.data && event.data.type === 'CONFIRM_RECORDING_COMPLETION') {
            console.log('[App] Confirming completion')
            navigator.serviceWorker.controller.postMessage({
                type: 'COMPLETE_RECORDING',
            })
        }
    }
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals()
