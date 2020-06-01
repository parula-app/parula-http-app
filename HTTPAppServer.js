import { intentsJSONWithValues } from './IntentsJSONGenerator.js';
import { Client } from 'pia/client/Client.js';
import { getConfig } from 'pia/util/config.js';
import { assert } from 'pia/util/util.js';
import express from 'express';
import http from 'http';
import r2 from 'r2';
import cryptoRandomString from 'crypto-random-string';

const kPortFrom = 12127;
const kPortTo = 12712;
var gAuthKey = null;
const kCoreURL = "http://localhost:12777";

/**
 * Wraps a Pia voice app as a HTTP REST server.
 * The caller is in all cases Pia core.
 *
 * Reads the basic intents and commands from a JSON file.
 * Then loads the app and lets it add the available values
 * for each type.
 * Then we register our app with the Pia core.
 *
 * We also listen to URLs for each app intent, in the form
 * <http://localhost:12127/:appid/:intent> (POST)
 * They will be called when the user invoked a voice command.
 * Parameters are passed as JSON.
 * The result is a JSON with either a sentence as response to the user,
 * or an error message and code.
 */
export default class HTTPAppServer {
  constructor(apps) {
    assert(apps.length, "Need array of apps");
    apps.forEach(app => assert(app.intents, "App has wrong type"));
    this.apps = apps; // {Array of AppBase}
    this._client = null; // {Client}
    this._expressApp = null; // {Express}
    this._port = null; // {Integer}
  }

  async start() {
    this._client = new Client();
    await this._client.loadApps(this.apps, "en");

    gAuthKey = cryptoRandomString({length: 10});
    await this._createServer();
    await this._registerWithCore();
    console.log(`Listening on port ${this._port} with auth key ${gAuthKey}`);
    console.log("Started and registered");
  }

  async _createServer() {
    let expressApp = this._expressApp = express();
    let server = http.createServer(expressApp);
    //expressApp.set("json spaces", 2);
    await this._findFreePort(server);

    // Register the REST URL handler for each intent
    for (let app of this.apps) {
      for (let intent of Object.values(app.intents)) {
        assert(intent.parameters, "Intent has wrong type");
        expressApp.post(`/${app.id}/${intent.id}`, authenticator, express.json(), (req, resp) => catchHTTPJSON(req, resp, async () =>
          await this.intentCall(intent, req)));
      }
    }
  }

  /**
   * Calls `server.listen(port)` with a random port.
   */
  async _findFreePort(server) {
    let failures = 0;
    let width = kPortTo - kPortFrom;
    const maxFailures = 10;
    while (1) {
      try {
        let port = kPortFrom + Math.ceil(Math.random() * width);
        await listen(server, port);
        this._port = port;
        return;
      } catch (ex) {
        if (ex.code == "EADDRINUSE") {
          if (++failures > maxFailures) { // infinite loop protection
            console.log("Failed too often while trying to open port");
            throw ex;
          }
          // continue looping
        } else {
          throw ex;
        }
      }
    }
  }

  /**
   * Notify the Pia core of us
   */
  async _registerWithCore() {
    let coreURL = getConfig().coreURL || kCoreURL;
    if (!coreURL.endsWith("/")) {
      coreURL += "/";
    }
    let myURL = `http://localhost:${this._port}/`;
    if (!coreURL.includes("//localhost:")) {
      myURL = `http://${os.hostname()}:${this._port}/`;
    }
    try {
      for (let app of this.apps) {
        let json = {
          appID: app.id,
          url: myURL,
          authKey: gAuthKey,
          intents: intentsJSONWithValues(app),
        };
        await r2.put(coreURL + "app/http", { json: json }).json;
      }
    } catch (ex) {
      if (ex.code == "ECONNREFUSED") {
        throw new Error(`Pia core is not running, on <${coreURL}>`);
      } else {
        throw ex;
      }
    }
  }

  /**
   * The user invoked an intent command and the
   * Pia core called us to run the intent.
   *
   * Map it from HTTP and JSON to intent call.
   *
   * @param intent {Intent}
   * @param request {HTTP server request}
   *   Body must be JSON with: {
   *     args: {
   *       <slotname>: <value>,
   *       ...
   *     }
   *   }
   * @see HTTPApp.js for the HTTP client = Pia core
   */
  async intentCall(intent, request) {
    // TODO map back NamedValues from term to value
    // TODO sanitize and security-check the arguments
    let args = request.body.args;
    console.log("intent", intent.id, "called with args", args);

    let langs = intent.app.languages || [ "en" ]; // TODO
    this._client.lang = request.acceptsLanguages(langs) || "en";
    // TODO due to async, another call can overwrite lang again.
    // Need to make a new ClientAPI or Client object.

    let response = await intent.run(args, this._client.clientAPI);
    return { responseText: response };
  }
}


/**
 * Ensures that Pia core is calling us.
 * Insists on a key that was sent to Pia core during registration.
 *
 * Prevents that other software contacts us and leaches user data.
 *
 * Express middleware
 * @param request  {Request}  The request whose header to check
 * @param response {Response} Allows errors to be reported
 * @param next     {Function} Callback to continue processing the request
 */
function authenticator(request, response, next) {
  let receivedKey = request.header("X-AuthToken") || request.query.auth;

  if (receivedKey && receivedKey == gAuthKey) {
    next();
  } else {
    response.sendStatus(401);
  }
}

/**
 * Calls `func`, returns the JSON as response to the HTTP client,
 * and catches exceptions and returns them to the HTTP client.
 *
 * @param func {async function} A function that returns JSON
 */
async function catchHTTPJSON(request, response, func) {
  try {
    let json = await func();
    //console.log("response", json);
    response.json(json);
  } catch (ex) {
    console.error(ex);
    response.status(ex.httpErrorCode || 400).json({
      errorMessage: ex.message,
      errorCode: ex.code,
    });
  }
}

class HTTPError extends Error {
  constructor(httpErrorCode, message) {
    super(message);
    this.httpErrorCode = httpErrorCode;
  }
}

/**
 * http server listen() returns and then errors out.
 * This function allows to await it, including in error cases.
 *
 * https://github.com/nodejs/node/issues/21482
 */
function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.listen(port)
      .once('listening', resolve)
      .once('error', reject);
  });
}
