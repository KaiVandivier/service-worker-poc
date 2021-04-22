A proof of concept for using a service worker to record cascading requests and save them in recorded sections.

The service worker is only enabled in the production environment, so run `yarn build` then serve the app from the `/build` directory (for example using the `serve` package `serve -s build`)