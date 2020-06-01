A Pia voice app that is running in its own process and
communicating with Pia using HTTP.
This is implementing a HTTP server for the app,
so that Pia core can call the app.

Include this module to create a Pia voice app that runs
as a separate process.

The inter process protocol is actually a normal HTTP REST
server with some well-defined URLs. However, as voice app,
you don't need to see any of this. You just write the
intents JSON file and implement your functions.
The HTTP endpoint and URLs are all created by this library.
